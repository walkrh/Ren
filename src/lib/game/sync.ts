// Convex <-> World bridge. Subscribes with client.onUpdate (no Svelte reactivity) and writes
// straight into the plain World; the loop hands it events through the SyncPort.
import type { ConvexClient } from 'convex/browser';
import type { FunctionReturnType } from 'convex/server';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { diffEnemies, enemySnapshot, selfChanged, type EnemySent, type SelfSent } from './diff.js';
import { loadoutFor, weapons, type RangedWeapon, type WeaponKey } from './data/items.js';
import { SnapshotBuffer } from './interp.js';
import type { SyncPort } from './loop.js';
import { add, scale, type Vec2 } from './vec.js';
import {
	addEnemy,
	addPickup,
	addPlayer,
	localPlayer,
	makeEnemy,
	removeEnemy,
	removePickup,
	removePlayer,
	type Enemy,
	type Hit,
	type Player,
	type World
} from './world.js';

export const ENEMY_SYNC_HZ = 8;
export const PLAYER_SYNC_HZ = 12;
const HEARTBEAT_MS = 1000;
const HOST_STALE_MS = 10_000;
const CLAIM_RETRY_MS = 3000;
const UNCONFIRMED_TTL_MS = 5000;
const TOUCH_GUARD_MS = 2000;
const ENEMY_INTERP_DELAY = (1000 / ENEMY_SYNC_HZ) * 1.5;
const PLAYER_INTERP_DELAY = (1000 / PLAYER_SYNC_HZ) * 1.5;

type StateResult = NonNullable<FunctionReturnType<typeof api.games.state>>;
type EnemyRow = FunctionReturnType<typeof api.games.enemies>[number];
type TransformRow = FunctionReturnType<typeof api.games.transforms>[number];
type ProjectileSnapshot = FunctionReturnType<typeof api.games.projectiles>;

export class GameSync implements SyncPort {
	/** true once the first state result has arrived */
	ready = false;
	/** set when the game row disappears */
	gone = false;
	lastError: string | null = null;

	private unsubs: (() => void)[] = [];
	private hitQueue: { weaponKey: WeaponKey; hits: Hit[] }[] = [];
	private damageQueue: { playerId: string; amount: number; enemyKey: string }[] = [];
	private spawnQueue: { enemy: Enemy; extra: boolean }[] = [];
	private pickupQueue: string[] = [];
	private waveRequest: number | null = null;
	private clearedRequest: number | null = null;
	private abilityRequest = false;

	private lastSentEnemies = new Map<string, EnemySent>();
	private lastSentSelf: SelfSent | null = null;
	private hostInFlight = false;
	private hostGeneration = 0;
	private transformInFlight = false;
	private lastHostFlushAt = 0;
	private lastTransformFlushAt = 0;
	private lastHeartbeatAt = 0;
	private lastClaimAt = 0;

	private hasState = false;
	private enemyRows: EnemyRow[] | null = null;
	private transformRows: TransformRow[] | null = null;
	private projectileSnapshot: ProjectileSnapshot | undefined;
	private sentProjectiles = false;
	private unconfirmedSince = new Map<string, number>();
	private touchedPickups = new Map<string, number>();
	private positioned = false;

	constructor(
		private readonly client: ConvexClient,
		private readonly gameId: Id<'games'>,
		private readonly world: World
	) {}

	start() {
		const args = { gameId: this.gameId };
		this.unsubs.push(
			this.client.onUpdate(
				api.games.state,
				args,
				(r) => this.onState(r),
				(e) => this.fail(e)
			),
			this.client.onUpdate(
				api.games.enemies,
				args,
				(r) => this.onEnemies(r),
				(e) => this.fail(e)
			),
			this.client.onUpdate(
				api.games.transforms,
				args,
				(r) => this.onTransforms(r),
				(e) => this.fail(e)
			),
			this.client.onUpdate(
				api.games.projectiles,
				args,
				(r) => this.onProjectiles(r),
				(e) => this.fail(e)
			)
		);
	}

	stop() {
		for (const u of this.unsubs) u();
		this.unsubs = [];
		this.ready = false;
		this.hostGeneration++;
	}

	private updateReady() {
		this.ready =
			this.hasState &&
			this.enemyRows !== null &&
			this.transformRows !== null &&
			this.projectileSnapshot !== undefined;
	}

	private fail(e: Error) {
		this.lastError = e.message;
		console.error('[sync]', e);
	}

	// ─── SyncPort ───

	queueHit(weaponKey: WeaponKey, hits: Hit[]) {
		this.hitQueue.push({ weaponKey, hits });
	}
	queueDamage(playerId: string, amount: number, enemyKey: string) {
		this.damageQueue.push({ playerId, amount, enemyKey });
	}
	queueSpawn(enemy: Enemy, extra: boolean) {
		this.spawnQueue.push({ enemy, extra });
		this.unconfirmedSince.set(enemy.key, Date.now());
	}
	queuePickup(key: string) {
		this.pickupQueue.push(key);
		this.touchedPickups.set(key, Date.now());
	}
	startWave(wave: number) {
		this.waveRequest = wave;
	}
	waveCleared(wave: number) {
		this.clearedRequest = wave;
	}
	useAbility() {
		this.abilityRequest = true;
	}

	flush(world: World, host: boolean) {
		if (!this.ready || this.gone) return;
		const now = Date.now();
		const gameId = this.gameId;

		// Low-volume, latency-sensitive: send immediately.
		for (const h of this.hitQueue.splice(0)) {
			// The spawn may be queued, in flight, or retrying. Never hit before it exists.
			if (h.hits.some((hit) => world.enemies.get(hit.key)?.confirmed === false)) {
				this.hitQueue.push(h);
				continue;
			}
			const hits = h.hits.filter((hit) => world.enemies.has(hit.key));
			if (hits.length)
				this.client
					.mutation(api.games.hitEnemy, { gameId, weaponKey: h.weaponKey, hits })
					.catch((e: Error) => {
						// Restore a rejected predicted kill even if no new enemy snapshot arrives.
						for (const hit of hits) {
							const row = this.enemyRows?.find((row) => row.key === hit.key);
							const enemy = world.enemies.get(hit.key);
							if (row && enemy) {
								enemy.hp = row.hp;
								enemy.dying = false;
							}
						}
						this.fail(e);
					});
		}
		for (const key of this.pickupQueue.splice(0)) this.call(api.games.takePickup, { gameId, key });
		if (this.abilityRequest) {
			this.abilityRequest = false;
			this.call(api.games.useAbility, { gameId });
		}
		if (host) {
			for (const d of this.damageQueue.splice(0)) {
				this.call(api.games.damagePlayer, {
					gameId,
					playerId: d.playerId as Id<'gamePlayers'>,
					amount: d.amount,
					enemyKey: d.enemyKey
				});
			}
			if (this.waveRequest !== null) {
				const wave = this.waveRequest;
				this.waveRequest = null;
				this.clearedRequest = null;
				this.call(api.games.startWave, { gameId, wave });
			}
			if (this.clearedRequest !== null) {
				const wave = this.clearedRequest;
				this.clearedRequest = null;
				this.call(api.games.waveCleared, { gameId, wave });
			}
			this.flushHost(world, now);
		} else {
			this.damageQueue.length = 0;
			this.waveRequest = null;
			this.clearedRequest = null;
			this.flushTransform(world, now);
			if (now - world.game.hostSeenAt > HOST_STALE_MS && now - this.lastClaimAt > CLAIM_RETRY_MS) {
				this.lastClaimAt = now;
				this.call(api.games.claimHost, { gameId });
			}
		}
	}

	private flushHost(world: World, now: number) {
		if (this.hostInFlight || now - this.lastHostFlushAt < 1000 / ENEMY_SYNC_HZ) return;
		const me = localPlayer(world);
		const spawns = this.spawnQueue.splice(0);
		const updates = diffEnemies(world, this.lastSentEnemies).slice(0, 60);
		const projectiles = world.projectiles
			.filter((p) => p.owner === 'enemy')
			.map((p) => ({
				key: p.networkKey ?? `${world.spawnEpoch}-shot-${p.id}`,
				ownerKey: p.ownerKey,
				position: p.pos,
				velocity: p.vel,
				ttl: p.ttl,
				damage: p.damage,
				radius: p.radius
			}));
		const self =
			me && this.positioned && selfChanged(me, this.lastSentSelf)
				? { position: me.pos, facing: me.facing }
				: undefined;
		if (
			spawns.length === 0 &&
			updates.length === 0 &&
			!self &&
			projectiles.length === 0 &&
			!this.sentProjectiles
		) {
			if (now - this.lastHeartbeatAt > HEARTBEAT_MS) {
				this.lastHeartbeatAt = now;
				this.call(api.games.hostHeartbeat, { gameId: this.gameId });
			}
			return;
		}
		this.hostInFlight = true;
		const generation = this.hostGeneration;
		this.lastHostFlushAt = now;
		this.lastHeartbeatAt = now;
		const sentEnemies = updates.map((e) => [e.key, enemySnapshot(e)] as const);
		const sentSelf = self ? { x: self.position.x, z: self.position.z, facing: self.facing } : null;
		this.client
			.mutation(api.games.syncEnemies, {
				gameId: this.gameId,
				self,
				projectiles,
				spawns: spawns.slice(0, 60).map(({ enemy, extra }) => ({
					key: enemy.key,
					type: enemy.type,
					wave: enemy.wave,
					position: enemy.pos,
					facing: enemy.facing,
					state: enemy.state,
					hovering: enemy.hovering || undefined,
					disguisedAs: (enemy.disguisedAs as Id<'gamePlayers'> | null) ?? undefined,
					extra
				})),
				updates: updates.slice(0, 60).map((e) => ({
					key: e.key,
					position: e.pos,
					facing: e.facing,
					state: e.state,
					targetPlayerId: (e.targetPlayerId as Id<'gamePlayers'> | null) ?? undefined,
					hovering: e.hovering || undefined,
					disguisedAs: (e.disguisedAs as Id<'gamePlayers'> | null) ?? undefined,
					bossPhase: e.type === 'overlord' ? e.bossPhase : undefined
				}))
			})
			.then(() => {
				if (generation !== this.hostGeneration) return;
				this.sentProjectiles = projectiles.length > 0;
				for (const [k, s] of sentEnemies) this.lastSentEnemies.set(k, s);
				if (sentSelf) this.lastSentSelf = sentSelf;
				// Anything beyond the chunk goes next time.
				this.spawnQueue.unshift(...spawns.slice(60));
			})
			.catch((e: Error) => {
				if (generation !== this.hostGeneration) return;
				this.spawnQueue.unshift(...spawns);
				this.fail(e);
			})
			.finally(() => {
				this.hostInFlight = false;
			});
	}

	private flushTransform(world: World, now: number) {
		if (this.transformInFlight || now - this.lastTransformFlushAt < 1000 / PLAYER_SYNC_HZ) return;
		const me = localPlayer(world);
		if (!me || !this.positioned || !selfChanged(me, this.lastSentSelf)) return;
		this.transformInFlight = true;
		this.lastTransformFlushAt = now;
		const sent = { x: me.pos.x, z: me.pos.z, facing: me.facing };
		this.client
			.mutation(api.transforms.update, { gameId: this.gameId, position: me.pos, facing: me.facing })
			.then(() => {
				this.lastSentSelf = sent;
			})
			.catch((e: Error) => this.fail(e))
			.finally(() => {
				this.transformInFlight = false;
			});
	}

	private call<A extends object>(fn: Parameters<ConvexClient['mutation']>[0], args: A) {
		this.client.mutation(fn, args as never).catch((e: Error) => this.fail(e));
	}

	// ─── Subscriptions -> World ───

	private onState(r: StateResult | null) {
		const world = this.world;
		if (!r) {
			this.gone = true;
			return;
		}
		const g = r.game;
		const changedHost = world.game.hostUserId !== g.hostUserId;
		world.game = {
			hostUserId: g.hostUserId,
			status: g.status,
			wave: g.wave,
			waveState: g.waveState,
			waveEnemiesRemaining: g.waveEnemiesRemaining,
			nextWaveAt: g.nextWaveAt ?? null,
			bossSpawned: g.bossSpawned,
			seed: g.seed,
			hostSeenAt: g.hostSeenAt,
			spawnedKeys: g.spawnedKeys
		};
		if (changedHost) {
			this.hostGeneration++;
			this.sentProjectiles = false;
			this.lastHostFlushAt = 0;
			world.wave.planned = 0;
			world.wave.requested = 0;
			world.wave.requestedAt = -Infinity;
			world.wave.emptyFor = 0;
			world.wave.spawnQueue = [];
			this.spawnQueue = [];
			this.damageQueue = [];
			this.waveRequest = this.clearedRequest = null;
			this.lastSentEnemies.clear();
			for (const [key, e] of world.enemies) if (!e.confirmed) removeEnemy(world, key);
			this.unconfirmedSince.clear();
			if (this.enemyRows) this.onEnemies(this.enemyRows, true);
			if (this.projectileSnapshot !== undefined) this.onProjectiles(this.projectileSnapshot, true);
		}

		const seen = new Set<string>();
		for (const row of r.players) {
			seen.add(row._id);
			let p = world.players.get(row._id);
			if (!p) {
				p = this.makePlayer(row);
				addPlayer(world, p);
			}
			p.name = row.name;
			p.maxHp = row.maxHp;
			p.stats = row.stats;
			p.shieldCharges = row.shieldCharges;
			p.state = row.state;
			p.weapon.overclockUntil = row.overclockUntil ?? 0;
			p.weapon.abilityReadyAt = row.abilityReadyAt;
			// An unchanged value can still correct damage blocked by Balance or a shield.
			p.hp = row.hp;
		}
		for (const id of [...world.players.keys()]) if (!seen.has(id)) removePlayer(world, id);

		const now = Date.now();
		const pk = new Set<string>();
		for (const row of r.pickups) {
			if (row.despawnAt <= now) continue;
			pk.add(row.key);
			const touchedAt = this.touchedPickups.get(row.key);
			if (touchedAt !== undefined && now - touchedAt < TOUCH_GUARD_MS) continue;
			this.touchedPickups.delete(row.key);
			if (!world.pickups.has(row.key)) {
				addPickup(world, {
					key: row.key,
					kind: row.kind,
					pos: row.position,
					despawnAt: row.despawnAt,
					confirmed: true
				});
			}
		}
		for (const key of [...world.pickups.keys()]) if (!pk.has(key)) removePickup(world, key);

		world.effects = r.effects.map((e) => ({
			kind: e.kind,
			sourcePlayerId: e.sourcePlayerId,
			targetPlayerId: e.targetPlayerId,
			magnitude: e.magnitude,
			startsAt: e.startsAt,
			endsAt: e.endsAt
		}));
		this.hasState = true;
		// Subscription delivery order is not guaranteed; replay transforms after players exist.
		if (this.transformRows) this.onTransforms(this.transformRows);
		this.updateReady();
	}

	private makePlayer(row: StateResult['players'][number]): Player {
		const local = row.userId === this.world.localUserId;
		const hotbar = loadoutFor(row.race, row.constellation);
		const main = weapons[hotbar.main] as RangedWeapon;
		return {
			id: row._id,
			userId: row.userId,
			name: row.name,
			race: row.race,
			origin: row.origin,
			constellation: row.constellation,
			hotbar,
			local,
			pos: { x: 0, z: 0 },
			facing: 0,
			vel: { x: 0, z: 0 },
			hp: row.hp,
			maxHp: row.maxHp,
			shieldCharges: row.shieldCharges,
			state: row.state,
			stats: row.stats,
			weapon: {
				slot: 'main',
				ammo: main.clipSize,
				reloadT: 0,
				cooldownT: 0,
				meleeCooldownT: 0,
				meleeBufferT: 0,
				overclockUntil: row.overclockUntil ?? 0,
				abilityReadyAt: row.abilityReadyAt,
				shots: 0
			},
			interp: local ? null : new SnapshotBuffer(PLAYER_INTERP_DELAY)
		};
	}

	private onEnemies(rows: EnemyRow[], restore = false) {
		this.enemyRows = rows;
		const world = this.world;
		const host = world.game.hostUserId === world.localUserId;
		const now = Date.now();
		const seen = new Set<string>();
		for (const row of rows) {
			seen.add(row.key);
			let e = world.enemies.get(row.key);
			if (!e) {
				// Non-host always builds from rows; the host only sees unknown rows after a migration.
				e = makeEnemy(row.key, row.type, row.wave, { ...row.position }, row.hp, {
					facing: row.facing,
					state: row.state,
					hovering: row.hovering ?? false,
					disguisedAs: row.disguisedAs ?? null,
					bossPhase: row.bossPhase ?? 1,
					targetPlayerId: row.targetPlayerId ?? null,
					confirmed: true,
					interp: host ? null : new SnapshotBuffer(ENEMY_INTERP_DELAY)
				});
				e.maxHp = row.maxHp;
				addEnemy(world, e);
			}
			e.confirmed = true;
			this.unconfirmedSince.delete(row.key);
			e.hp = row.hp;
			e.dying = false;
			e.stunUntil = row.stunUntil ?? 0;
			e.slowUntil = row.slowUntil ?? 0;
			e.slowValue = row.slowValue ?? 0;
			if (row.knockbackAt && row.knockbackDir && row.knockbackAt > e.knockbackAt) {
				e.knockbackAt = row.knockbackAt;
				// Impulse decays at 8/s in the sim, so 8x the distance covers it.
				if (host) e.vel = add(e.vel, scale(row.knockbackDir, 8));
			}
			if (!host || restore) {
				e.pos = { ...row.position };
				e.facing = row.facing;
				if (host) e.interp = null;
				else {
					if (!e.interp) e.interp = new SnapshotBuffer(ENEMY_INTERP_DELAY);
					e.interp.push({ t: now, x: row.position.x, z: row.position.z, facing: row.facing });
				}
				e.state = row.state;
				e.hovering = row.hovering ?? false;
				e.disguisedAs = row.disguisedAs ?? null;
				e.bossPhase = row.bossPhase ?? 1;
				e.targetPlayerId = row.targetPlayerId ?? null;
			}
		}
		for (const [key, e] of [...world.enemies]) {
			if (seen.has(key)) continue;
			if (e.confirmed) {
				if (!e.dying) world.fx.push({ type: 'death', pos: e.pos, enemyType: e.type });
				removeEnemy(world, key);
				this.lastSentEnemies.delete(key);
				continue;
			}
			// Insert still in flight; drop it if it never lands.
			const since = this.unconfirmedSince.get(key) ?? now;
			if (now - since > UNCONFIRMED_TTL_MS) {
				removeEnemy(world, key);
				this.unconfirmedSince.delete(key);
			}
		}
		this.updateReady();
	}

	private onTransforms(rows: TransformRow[]) {
		this.transformRows = rows;
		const world = this.world;
		const now = Date.now();
		for (const row of rows) {
			const p = world.players.get(row.playerId);
			if (!p) continue;
			if (p.local) {
				if (!this.positioned) {
					p.pos = { ...row.position };
					p.facing = row.facing;
					this.positioned = true;
					this.lastSentSelf = { x: row.position.x, z: row.position.z, facing: row.facing };
				}
				continue;
			}
			if (!p.interp) p.interp = new SnapshotBuffer(PLAYER_INTERP_DELAY);
			p.pos = { ...row.position };
			p.facing = row.facing;
			// State-only changes must not add duplicate transform samples.
			const previous = p.interp.latest;
			if (
				!previous ||
				previous.x !== row.position.x ||
				previous.z !== row.position.z ||
				previous.facing !== row.facing
			)
				p.interp.push({ t: now, x: row.position.x, z: row.position.z, facing: row.facing });
		}
		this.updateReady();
	}

	private onProjectiles(snapshot: ProjectileSnapshot, restore = false) {
		this.projectileSnapshot = snapshot;
		const world = this.world;
		if (world.game.hostUserId !== world.localUserId || restore || !this.ready) {
			const previous = new Map(
				world.projectiles.filter((p) => p.owner === 'enemy').map((p) => [p.networkKey, p.id])
			);
			world.projectiles = world.projectiles.filter((p) => p.owner === 'player');
			const age = snapshot ? Math.max(0, (Date.now() - snapshot.updatedAt) / 1000) : 0;
			for (const p of snapshot?.projectiles ?? []) {
				if (p.ttl <= age) continue;
				world.projectiles.push({
					id: previous.get(p.key) ?? world.nextProjectileId++,
					networkKey: p.key,
					owner: 'enemy',
					ownerKey: p.ownerKey,
					pos: add(p.position, scale(p.velocity, age)),
					vel: { ...p.velocity },
					ttl: p.ttl - age,
					damage: p.damage,
					radius: p.radius
				});
			}
		}
		this.updateReady();
	}
}

/** Render position for any player: local reads the sim, remote reads the interpolator. */
export function renderPose(p: Player, now: number): { pos: Vec2; facing: number } {
	if (p.local || !p.interp) return { pos: p.pos, facing: p.facing };
	const s = p.interp.sample(now);
	return { pos: { x: s.x, z: s.z }, facing: s.facing };
}

export function renderEnemyPose(e: Enemy, now: number): { pos: Vec2; facing: number } {
	if (!e.interp) return { pos: e.pos, facing: e.facing };
	const s = e.interp.sample(now);
	return { pos: { x: s.x, z: s.z }, facing: s.facing };
}
