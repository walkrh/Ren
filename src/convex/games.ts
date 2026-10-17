import { ConvexError, v } from 'convex/values';
import { mutation, query } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import {
	enemyTypeValidator,
	hotbarSlotValidator,
	vec2Validator,
	projectileValidator
} from './schema';
import {
	activeEffects,
	endGame,
	enemyByKey,
	finite,
	playersInGame,
	requireHost,
	requirePlayer,
	transformOf
} from './lib';
import { enemies as enemyDefs } from '../lib/game/data/enemies';
import {
	abilities,
	isPickupKind,
	isWeaponKey,
	pickups as pickupDefs,
	pickupKinds,
	weapons
} from '../lib/game/data/items';
import { CRIT_MULTIPLIER, resolveModifiers } from '../lib/game/data/stats';
import {
	BLEED_OUT_MS,
	BOSS_WAVE,
	INTERMISSION_MS,
	REVIVE_HP_FRACTION,
	REVIVE_MS,
	REVIVE_RANGE,
	REVIVE_STALE_MS,
	waveEnemyCount
} from '../lib/game/data/waves';
import { statusFromHit } from '../lib/game/combat';

const HOST_STALE_MS = 10_000;
const HOUSEKEEPING_MS = 1000;
/** Transforms arrive at ~12 Hz, so the server's view of a reviver can trail the client's. */
const REVIVE_RANGE_SLACK = 0.75;
/** The reviver's clock started half a round trip before the server stamped the revive. */
const REVIVE_FINISH_TOLERANCE_MS = 300;

/** Upgrade an already-running game without replaying enemies spawned by the old client. */
async function spawnReceipts(ctx: QueryCtx | MutationCtx, game: Doc<'games'>): Promise<string[]> {
	if (game.spawnedKeys !== undefined) return game.spawnedKeys;
	const live = await ctx.db
		.query('enemies')
		.withIndex('by_game', (q) => q.eq('gameId', game._id))
		.collect();
	const total = waveEnemyCount(game.wave);
	// Remaining counts include adds, so adding live enemies cancels both live/dead add counts.
	const plannedCount = Math.min(
		total,
		Math.max(0, total + live.length - game.waveEnemiesRemaining)
	);
	return [
		...new Set([
			...Array.from({ length: plannedCount }, (_, i) => `${game.seed}-w${game.wave}-${i}`),
			...live.map((e) => e.key)
		])
	];
}

// ─── Queries (one per table so enemy churn does not re-push HUD rows) ───

export const state = query({
	args: { gameId: v.id('games') },
	handler: async (ctx, { gameId }) => {
		const game = await ctx.db.get(gameId);
		if (!game) return null;
		const [players, pickups, effects] = await Promise.all([
			playersInGame(ctx, gameId),
			ctx.db
				.query('pickups')
				.withIndex('by_game', (q) => q.eq('gameId', gameId))
				.collect(),
			ctx.db
				.query('statusEffects')
				.withIndex('by_game', (q) => q.eq('gameId', gameId))
				.collect()
		]);
		return {
			game: { ...game, spawnedKeys: await spawnReceipts(ctx, game) },
			players,
			pickups,
			effects
		};
	}
});

export const enemies = query({
	args: { gameId: v.id('games') },
	handler: (ctx, { gameId }) =>
		ctx.db
			.query('enemies')
			.withIndex('by_game', (q) => q.eq('gameId', gameId))
			.collect()
});

export const transforms = query({
	args: { gameId: v.id('games') },
	handler: (ctx, { gameId }) =>
		ctx.db
			.query('playerTransforms')
			.withIndex('by_game', (q) => q.eq('gameId', gameId))
			.collect()
});

export const projectiles = query({
	args: { gameId: v.id('games') },
	handler: (ctx, { gameId }) =>
		ctx.db
			.query('enemyProjectiles')
			.withIndex('by_game', (q) => q.eq('gameId', gameId))
			.unique()
});

// ─── Waves ───

/** Host advances to `wave`. Idempotent: only applies when the game sits on wave - 1. */
export const startWave = mutation({
	args: { gameId: v.id('games'), wave: v.number() },
	handler: async (ctx, { gameId, wave }) => {
		const { game } = await requireHost(ctx, gameId);
		if (game.status !== 'active') return false;
		if (game.waveState !== 'intermission' || game.wave !== wave - 1) return false;
		if (wave > BOSS_WAVE) return false;
		await ctx.db.patch(gameId, {
			wave,
			waveState: 'in_progress',
			waveEnemiesRemaining: waveEnemyCount(wave),
			spawnedKeys: [],
			nextWaveAt: undefined,
			bossSpawned: false,
			hostSeenAt: Date.now()
		});
		return true;
	}
});

/**
 * Safety valve: the host saw an empty arena with nothing left to spawn, but the counter
 * did not reach zero (a dropped spawn, a migration). Verifies no enemy rows remain.
 */
export const waveCleared = mutation({
	args: { gameId: v.id('games'), wave: v.number() },
	handler: async (ctx, { gameId, wave }) => {
		const { game } = await requireHost(ctx, gameId);
		if (game.status !== 'active' || game.waveState !== 'in_progress' || game.wave !== wave)
			return false;
		if (wave >= BOSS_WAVE) return false; // the boss wave only ends on the Overlord's death
		const any = await ctx.db
			.query('enemies')
			.withIndex('by_game', (q) => q.eq('gameId', gameId))
			.first();
		if (any) return false;
		await ctx.db.patch(gameId, {
			waveState: 'intermission',
			waveEnemiesRemaining: 0,
			nextWaveAt: Date.now() + INTERMISSION_MS
		});
		return true;
	}
});

// ─── Host sync ───

const spawnValidator = v.object({
	key: v.string(),
	type: enemyTypeValidator,
	wave: v.number(),
	position: vec2Validator,
	facing: v.number(),
	state: v.string(),
	hovering: v.optional(v.boolean()),
	disguisedAs: v.optional(v.id('gamePlayers')),
	/** not counted in the wave plan (boss adds): bumps waveEnemiesRemaining */
	extra: v.boolean()
});

const updateValidator = v.object({
	key: v.string(),
	position: vec2Validator,
	facing: v.number(),
	state: v.string(),
	targetPlayerId: v.optional(v.id('gamePlayers')),
	hovering: v.optional(v.boolean()),
	disguisedAs: v.optional(v.id('gamePlayers')),
	bossPhase: v.optional(v.number())
});

/**
 * The host's batched write (~8 Hz): its own transform, new enemies, and moved enemies.
 * Never touches hp. Also runs 1 Hz housekeeping so no scheduler is needed.
 */
export const syncEnemies = mutation({
	args: {
		gameId: v.id('games'),
		self: v.optional(v.object({ position: vec2Validator, facing: v.number() })),
		spawns: v.array(spawnValidator),
		updates: v.array(updateValidator),
		projectiles: v.optional(v.array(projectileValidator))
	},
	handler: async (ctx, { gameId, self, spawns, updates, projectiles }) => {
		const { game, player } = await requireHost(ctx, gameId);
		const now = Date.now();
		if (game.status !== 'active') return;

		let remaining = game.waveEnemiesRemaining;
		let bossSpawned = game.bossSpawned;
		const spawnedKeys = new Set(await spawnReceipts(ctx, game));
		for (const s of spawns) {
			if (s.wave !== game.wave || game.waveState !== 'in_progress') continue;
			if (spawnedKeys.has(s.key)) continue;
			spawnedKeys.add(s.key);
			if (await enemyByKey(ctx, gameId, s.key)) continue;
			const def = enemyDefs[s.type];
			await ctx.db.insert('enemies', {
				gameId,
				key: s.key,
				type: s.type,
				wave: s.wave,
				hp: def.hp,
				maxHp: def.hp,
				position: cleanVec(s.position),
				facing: finite(s.facing),
				state: s.state,
				hovering: s.hovering,
				disguisedAs: s.disguisedAs,
				bossPhase: s.type === 'overlord' ? 1 : undefined,
				updatedAt: now
			});
			if (s.extra) remaining++;
			if (s.type === 'overlord') bossSpawned = true;
		}

		for (const u of updates) {
			const row = await enemyByKey(ctx, gameId, u.key);
			if (!row) continue; // died since the host last saw it; never resurrect
			await ctx.db.patch(row._id, {
				position: cleanVec(u.position),
				facing: finite(u.facing),
				state: u.state,
				targetPlayerId: u.targetPlayerId,
				hovering: u.hovering,
				disguisedAs: u.disguisedAs,
				bossPhase: u.bossPhase,
				updatedAt: now
			});
		}

		if (self) await writeTransform(ctx, gameId, player._id, self.position, self.facing, now);
		if (projectiles) {
			const snapshot = await ctx.db
				.query('enemyProjectiles')
				.withIndex('by_game', (q) => q.eq('gameId', gameId))
				.unique();
			const fields = { projectiles, updatedAt: now };
			if (snapshot) await ctx.db.patch(snapshot._id, fields);
			else await ctx.db.insert('enemyProjectiles', { gameId, ...fields });
		}

		const patch: Partial<Doc<'games'>> = { hostSeenAt: now };
		if (game.spawnedKeys === undefined || spawnedKeys.size !== game.spawnedKeys.length)
			patch.spawnedKeys = [...spawnedKeys];
		if (remaining !== game.waveEnemiesRemaining) patch.waveEnemiesRemaining = remaining;
		if (bossSpawned !== game.bossSpawned) patch.bossSpawned = bossSpawned;
		if (now - game.lastTickAt >= HOUSEKEEPING_MS) {
			await housekeeping(ctx, gameId, game.lastTickAt, now);
			patch.lastTickAt = now;
		}
		await ctx.db.patch(gameId, patch);
	}
});

async function housekeeping(
	ctx: MutationCtx,
	gameId: Id<'games'>,
	lastTickAt: number,
	now: number
) {
	const dt = Math.min(5, (now - lastTickAt) / 1000);
	const players = await playersInGame(ctx, gameId);
	for (const p of players) {
		if (p.state === 'alive' && p.stats.regenPerSecond > 0 && p.hp < p.maxHp) {
			await ctx.db.patch(p._id, { hp: Math.min(p.maxHp, p.hp + p.stats.regenPerSecond * dt) });
		}
		if (p.overclockUntil !== undefined && p.overclockUntil <= now) {
			await ctx.db.patch(p._id, { overclockUntil: undefined });
		}
	}
	const effects = await ctx.db
		.query('statusEffects')
		.withIndex('by_game', (q) => q.eq('gameId', gameId))
		.collect();
	for (const e of effects) if (e.endsAt <= now) await ctx.db.delete(e._id);
	const pickups = await ctx.db
		.query('pickups')
		.withIndex('by_game', (q) => q.eq('gameId', gameId))
		.collect();
	for (const p of pickups) if (p.despawnAt <= now) await ctx.db.delete(p._id);
}

/** Idle host keeps the lease alive when there is nothing to sync. */
export const hostHeartbeat = mutation({
	args: { gameId: v.id('games') },
	handler: async (ctx, { gameId }) => {
		const { game } = await requireHost(ctx, gameId);
		if (game.status !== 'active') return;
		const now = Date.now();
		if (now - game.lastTickAt >= HOUSEKEEPING_MS) {
			await housekeeping(ctx, gameId, game.lastTickAt, now);
			await ctx.db.patch(gameId, { hostSeenAt: now, lastTickAt: now });
		} else await ctx.db.patch(gameId, { hostSeenAt: now });
	}
});

/** Any member may take over once the host has gone quiet. Re-checked inside the mutation. */
export const claimHost = mutation({
	args: { gameId: v.id('games') },
	handler: async (ctx, { gameId }) => {
		const { game, identity } = await requirePlayer(ctx, gameId);
		const now = Date.now();
		if (game.hostUserId === identity.subject) return true;
		if (now - game.hostSeenAt < HOST_STALE_MS) return false;
		await ctx.db.patch(gameId, { hostUserId: identity.subject, hostSeenAt: now });
		return true;
	}
});

// ─── Combat ───

/**
 * The shooter reports a hit; damage comes from the catalog, never the client.
 * Deletes the enemy on death, awards points/kills, rolls drops, and advances the wave.
 */
export const hitEnemy = mutation({
	args: {
		gameId: v.id('games'),
		weaponKey: v.string(),
		hits: v.array(v.object({ key: v.string(), multiplier: v.number() }))
	},
	handler: async (ctx, { gameId, weaponKey, hits }) => {
		const { game, player } = await requirePlayer(ctx, gameId);
		if (game.status !== 'active' || player.state !== 'alive')
			return { crit: false, killed: [] as string[] };
		if (!isWeaponKey(weaponKey)) throw new ConvexError('Unknown weapon');
		const weapon = weapons[weaponKey];
		if (weapon.race !== player.race) throw new ConvexError('That is not your weapon');
		const maxHits = weapon.slot === 'main' && weapon.effects.some((e) => e.type === 'aoe') ? 16 : 6;
		if (hits.length === 0 || hits.length > maxHits) throw new ConvexError('Bad hit list');

		const now = Date.now();
		const counters = { ...player.hitCounters };
		counters[weapon.slot] += 1;
		const status = statusFromHit(weapon, counters[weapon.slot], Math.random());
		const crit = Math.random() < player.stats.critChance;
		const base = weapon.damage * player.stats.damageMultiplier * (crit ? CRIT_MULTIPLIER : 1);

		let dealt = 0;
		let kills = 0;
		let points = 0;
		let remaining = game.waveEnemiesRemaining;
		let victory = false;
		const killed: string[] = [];
		const seen = new Set<string>();
		const from = await transformOf(ctx, player._id);

		for (const h of hits) {
			if (seen.has(h.key)) continue;
			seen.add(h.key);
			const enemy = await enemyByKey(ctx, gameId, h.key);
			if (!enemy) continue;
			const mult = Math.min(1, Math.max(0, finite(h.multiplier)));
			const dmg = base * mult;
			dealt += Math.min(dmg, enemy.hp);
			const hp = enemy.hp - dmg;
			if (hp <= 0) {
				await ctx.db.delete(enemy._id);
				killed.push(enemy.key);
				kills++;
				points += enemyDefs[enemy.type].points;
				remaining--;
				if (enemy.type === 'overlord') victory = true;
				await rollDrops(ctx, gameId, enemy, player.stats.dropMultiplier, now);
				continue;
			}
			const patch: Partial<Doc<'enemies'>> = { hp };
			if (status.stunMs) patch.stunUntil = Math.max(enemy.stunUntil ?? 0, now + status.stunMs);
			if (status.slow) {
				patch.slowUntil = now + status.slow.ms;
				patch.slowValue = status.slow.value;
			}
			if (status.knockback && from) {
				const dx = enemy.position.x - from.position.x;
				const dz = enemy.position.z - from.position.z;
				const l = Math.hypot(dx, dz) || 1;
				patch.knockbackAt = now;
				patch.knockbackDir = { x: (dx / l) * status.knockback, z: (dz / l) * status.knockback };
			}
			await ctx.db.patch(enemy._id, patch);
		}

		const playerPatch: Partial<Doc<'gamePlayers'>> = { hitCounters: counters };
		if (kills) {
			playerPatch.kills = player.kills + kills;
			playerPatch.points = player.points + points;
		}
		if (status.lifesteal > 0 && dealt > 0) {
			playerPatch.hp = Math.min(player.maxHp, player.hp + dealt * status.lifesteal);
		}
		await ctx.db.patch(player._id, playerPatch);

		if (victory) {
			await endGame(ctx, game, { status: 'victory', endedAt: now, waveEnemiesRemaining: 0 });
		} else if (remaining !== game.waveEnemiesRemaining) {
			const gamePatch: Partial<Doc<'games'>> = { waveEnemiesRemaining: Math.max(0, remaining) };
			if (remaining <= 0 && game.waveState === 'in_progress' && game.wave < BOSS_WAVE) {
				gamePatch.waveState = 'intermission';
				gamePatch.nextWaveAt = now + INTERMISSION_MS;
			}
			await ctx.db.patch(gameId, gamePatch);
		}
		return { crit, killed };
	}
});

async function rollDrops(
	ctx: MutationCtx,
	gameId: Id<'games'>,
	enemy: Doc<'enemies'>,
	dropMultiplier: number,
	now: number
) {
	for (const kind of pickupKinds) {
		const def = pickupDefs[kind];
		if (Math.random() >= def.dropChance * dropMultiplier) continue;
		// Scatter a little so two drops from one kill do not overlap exactly.
		const theta = Math.random() * Math.PI * 2;
		await ctx.db.insert('pickups', {
			gameId,
			key: `${enemy.key}-${kind}`,
			kind,
			position: {
				x: enemy.position.x + Math.cos(theta) * 0.6,
				z: enemy.position.z + Math.sin(theta) * 0.6
			},
			despawnAt: now + def.despawnMs
		});
	}
}

/** Host reports an enemy hitting a player. Applies reductions, shields, auras, and the Libra floor. */
export const damagePlayer = mutation({
	args: {
		gameId: v.id('games'),
		playerId: v.id('gamePlayers'),
		amount: v.number(),
		enemyKey: v.string()
	},
	handler: async (ctx, { gameId, playerId, amount, enemyKey }) => {
		const { game } = await requireHost(ctx, gameId);
		if (game.status !== 'active') return;
		const target = await ctx.db.get(playerId);
		if (!target || target.gameId !== gameId || target.state !== 'alive') return;
		const now = Date.now();

		// The ID stealer drops its disguise on its first attack.
		const enemy = await enemyByKey(ctx, gameId, enemyKey);
		if (enemy?.disguisedAs)
			await ctx.db.patch(enemy._id, { disguisedAs: undefined, state: 'revealed' });

		if (target.shieldCharges > 0) {
			await ctx.db.patch(playerId, { shieldCharges: target.shieldCharges - 1 });
			return;
		}

		const effects = activeEffects(
			await ctx.db
				.query('statusEffects')
				.withIndex('by_game', (q) => q.eq('gameId', gameId))
				.collect(),
			now
		);
		const fortitude = await auraFortitude(ctx, effects, target);
		let hp =
			target.hp -
			Math.max(0, finite(amount)) * (1 - target.stats.damageReduction) * (1 - fortitude);

		const floor = effects.find((e) => e.kind === 'balance');
		if (floor) {
			const min = target.maxHp * (floor.magnitude ?? 0.5);
			if (target.hp >= min) hp = Math.max(hp, min);
		}

		if (hp > 0) {
			await ctx.db.patch(playerId, { hp });
			return;
		}
		await ctx.db.patch(playerId, {
			hp: 0,
			state: 'downed',
			bleedOutAt: now + BLEED_OUT_MS,
			downs: target.downs + 1,
			revivedBy: undefined,
			reviveCompletesAt: undefined
		});
		const everyone = await playersInGame(ctx, gameId);
		// Going down drops whatever revive this player was doing.
		for (const p of everyone)
			if (p.revivedBy === playerId)
				await ctx.db.patch(p._id, { revivedBy: undefined, reviveCompletesAt: undefined });
		if (everyone.every((p) => p._id === playerId || p.state === 'downed')) {
			await endGame(ctx, game, { status: 'defeat', endedAt: now });
		}
	}
});

/** Capricorn: the strongest active aura reaching this player, scaled by distance to its caster. */
async function auraFortitude(
	ctx: MutationCtx,
	effects: Doc<'statusEffects'>[],
	target: Doc<'gamePlayers'>
) {
	let best = 0;
	const auras = effects.filter((e) => e.kind === 'leadership');
	if (auras.length === 0) return 0;
	const def = abilities.capricorn.effect;
	const mine = await transformOf(ctx, target._id);
	for (const a of auras) {
		if (a.sourcePlayerId === target._id) {
			best = Math.max(best, a.magnitude ?? def.maxValue);
			continue;
		}
		const src = await transformOf(ctx, a.sourcePlayerId);
		if (!src || !mine) continue;
		const d = Math.hypot(src.position.x - mine.position.x, src.position.z - mine.position.z);
		const u = Math.max(0, 1 - d / def.radius);
		best = Math.max(best, (a.magnitude ?? def.maxValue) * u);
	}
	return best;
}

// ─── Pickups ───

export const takePickup = mutation({
	args: { gameId: v.id('games'), key: v.string() },
	handler: async (ctx, { gameId, key }) => {
		const { game, player } = await requirePlayer(ctx, gameId);
		if (game.status !== 'active' || player.state !== 'alive') return false;
		const row = await ctx.db
			.query('pickups')
			.withIndex('by_game_key', (q) => q.eq('gameId', gameId).eq('key', key))
			.unique();
		if (!row) return false; // someone else got there first
		await ctx.db.delete(row._id);
		if (row.despawnAt <= Date.now()) return false;
		if (!isPickupKind(row.kind)) return false;
		const now = Date.now();
		const patch: Partial<Doc<'gamePlayers'>> = {};
		for (const fx of pickupDefs[row.kind].effects) {
			switch (fx.type) {
				case 'heal':
					patch.hp = Math.min(player.maxHp, (patch.hp ?? player.hp) + player.maxHp * fx.value);
					break;
				case 'attackSpeed':
					patch.overclockUntil = Math.max(player.overclockUntil ?? 0, now) + fx.durationMs;
					break;
				case 'shield':
					patch.shieldCharges = player.shieldCharges + fx.value;
					break;
			}
		}
		await ctx.db.patch(player._id, patch);
		return true;
	}
});

// ─── Abilities ───

export const useAbility = mutation({
	args: { gameId: v.id('games') },
	handler: async (ctx, { gameId }) => {
		const { game, player } = await requirePlayer(ctx, gameId);
		if (game.status !== 'active' || player.state !== 'alive') return false;
		const now = Date.now();
		if (player.abilityReadyAt > now) return false;
		const ability = abilities[player.constellation];
		const fx = ability.effect;
		let readyAt = now + ability.cooldownMs;
		switch (fx.type) {
			case 'aura':
				await ctx.db.insert('statusEffects', {
					gameId,
					kind: 'leadership',
					sourcePlayerId: player._id,
					magnitude: fx.maxValue,
					startsAt: now,
					endsAt: now + fx.durationMs
				});
				break;
			case 'healthFloor': {
				await ctx.db.insert('statusEffects', {
					gameId,
					kind: 'balance',
					sourcePlayerId: player._id,
					magnitude: fx.threshold,
					startsAt: now,
					endsAt: now + fx.durationMs
				});
				for (const p of await playersInGame(ctx, gameId)) {
					const min = p.maxHp * fx.threshold;
					if (p.state === 'alive' && p.hp < min) await ctx.db.patch(p._id, { hp: min });
				}
				break;
			}
			case 'speedBuffThenDebuff':
				await ctx.db.insert('statusEffects', {
					gameId,
					kind: 'impatience',
					sourcePlayerId: player._id,
					targetPlayerId: player._id,
					magnitude: fx.buffValue,
					startsAt: now,
					endsAt: now + fx.buffDurationMs
				});
				await ctx.db.insert('statusEffects', {
					gameId,
					kind: 'impatience_fatigue',
					sourcePlayerId: player._id,
					targetPlayerId: player._id,
					magnitude: fx.debuffValue,
					startsAt: now + fx.buffDurationMs,
					endsAt: now + fx.buffDurationMs + fx.debuffDurationMs
				});
				// No cooldown, but the fatigue cannot be skipped by recasting.
				readyAt = Math.max(readyAt, now + fx.buffDurationMs + fx.debuffDurationMs);
				break;
		}
		await ctx.db.patch(player._id, { abilityReadyAt: readyAt });
		return true;
	}
});

export const setActiveSlot = mutation({
	args: { gameId: v.id('games'), slot: hotbarSlotValidator },
	handler: async (ctx, { gameId, slot }) => {
		const { player } = await requirePlayer(ctx, gameId);
		if (player.activeSlot !== slot) await ctx.db.patch(player._id, { activeSlot: slot });
	}
});

// ─── Revives ───

/** Reviver and target stand within reach, by the server's last-seen transforms. */
async function inReviveRange(
	ctx: MutationCtx,
	reviverId: Id<'gamePlayers'>,
	targetId: Id<'gamePlayers'>
) {
	const [a, b] = await Promise.all([transformOf(ctx, reviverId), transformOf(ctx, targetId)]);
	if (!a || !b) return false;
	const d = Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z);
	return d <= REVIVE_RANGE + REVIVE_RANGE_SLACK;
}

/** Someone else holds this revive and has not abandoned it. */
async function reviveHeldByOther(
	ctx: MutationCtx,
	target: Doc<'gamePlayers'>,
	playerId: Id<'gamePlayers'>,
	now: number
) {
	if (!target.revivedBy || target.revivedBy === playerId) return false;
	const reviver = await ctx.db.get(target.revivedBy);
	if (!reviver || reviver.state !== 'alive') return false;
	return (target.reviveCompletesAt ?? 0) + REVIVE_STALE_MS > now;
}

export const startRevive = mutation({
	args: { gameId: v.id('games'), targetPlayerId: v.id('gamePlayers') },
	handler: async (ctx, { gameId, targetPlayerId }) => {
		const { game, player } = await requirePlayer(ctx, gameId);
		if (game.status !== 'active' || player.state !== 'alive') return false;
		if (targetPlayerId === player._id) return false;
		const target = await ctx.db.get(targetPlayerId);
		if (!target || target.gameId !== gameId || target.state !== 'downed') return false;
		const now = Date.now();
		if (await reviveHeldByOther(ctx, target, player._id, now)) return false;
		if (!(await inReviveRange(ctx, player._id, targetPlayerId))) return false;
		const effects = await ctx.db
			.query('statusEffects')
			.withIndex('by_game', (q) => q.eq('gameId', gameId))
			.collect();
		// Aries' Impatience (and its fatigue) scales revives like it scales reloads.
		const duration = REVIVE_MS * resolveModifiers(player._id, effects, now).reload;
		await ctx.db.patch(targetPlayerId, {
			revivedBy: player._id,
			reviveCompletesAt: now + duration
		});
		return true;
	}
});

export const cancelRevive = mutation({
	args: { gameId: v.id('games'), targetPlayerId: v.id('gamePlayers') },
	handler: async (ctx, { gameId, targetPlayerId }) => {
		const { player } = await requirePlayer(ctx, gameId);
		const target = await ctx.db.get(targetPlayerId);
		if (!target || target.revivedBy !== player._id) return;
		await ctx.db.patch(targetPlayerId, { revivedBy: undefined, reviveCompletesAt: undefined });
	}
});

export const finishRevive = mutation({
	args: { gameId: v.id('games'), targetPlayerId: v.id('gamePlayers') },
	handler: async (ctx, { gameId, targetPlayerId }) => {
		const { game, player } = await requirePlayer(ctx, gameId);
		if (game.status !== 'active' || player.state !== 'alive') return false;
		const target = await ctx.db.get(targetPlayerId);
		if (!target || target.state !== 'downed' || target.revivedBy !== player._id) return false;
		const due = target.reviveCompletesAt ?? Infinity;
		if (due - Date.now() > REVIVE_FINISH_TOLERANCE_MS) return false;
		if (!(await inReviveRange(ctx, player._id, targetPlayerId))) return false;
		await ctx.db.patch(targetPlayerId, {
			state: 'alive',
			hp: target.maxHp * REVIVE_HP_FRACTION,
			bleedOutAt: undefined,
			revivedBy: undefined,
			reviveCompletesAt: undefined
		});
		await ctx.db.patch(player._id, { revives: player.revives + 1 });
		return true;
	}
});

// ─── Helpers ───

function cleanVec(p: { x: number; z: number }) {
	return { x: finite(p.x), z: finite(p.z) };
}

export async function writeTransform(
	ctx: MutationCtx,
	gameId: Id<'games'>,
	playerId: Id<'gamePlayers'>,
	position: { x: number; z: number },
	facing: number,
	now: number
) {
	const row = await transformOf(ctx, playerId);
	const fields = { position: cleanVec(position), facing: finite(facing), updatedAt: now };
	if (row) await ctx.db.patch(row._id, fields);
	else await ctx.db.insert('playerTransforms', { gameId, playerId, ...fields });
}
