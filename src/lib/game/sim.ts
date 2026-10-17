// Pure simulation steps. No Three, no Svelte, no Convex: everything here runs in a vitest node test.
import { enemyBrains, pickTarget, type HostTools } from './enemies.js';
import {
	enemiesInArc,
	enemyRadius,
	firstEnemyOnRay,
	hitsForAoe,
	hitsForDirectHit,
	isAoeWeapon
} from './combat.js';
import { enemies as enemyDefs, type EnemyType } from './data/enemies.js';
import { weapons, type HotbarSlot, type RangedWeapon } from './data/items.js';
import { resolveModifiers } from './data/stats.js';
import {
	ARENA,
	BOSS_ADDS,
	BOSS_WAVE,
	MAX_ALIVE,
	PICKUP_RADIUS,
	PLAYER_RADIUS
} from './data/waves.js';
import type { Rng } from './rng.js';
import { createRng } from './rng.js';
import {
	add,
	angleTo,
	clampToRect,
	dist,
	fromAngle,
	len,
	norm,
	scale,
	sub,
	type Vec2
} from './vec.js';
import { aliveCount, planWave, rimPoint } from './waves.js';
import {
	addEnemy,
	alivePlayers,
	liveEnemies,
	localPlayer,
	makeEnemy,
	isHost,
	removePickup,
	type Enemy,
	type Player,
	type World
} from './world.js';

export type InputFrame = {
	/** normalised WASD direction */
	move: Vec2;
	/** ground point under the cursor */
	aim: Vec2;
	/** held */
	fire: boolean;
	/** edge: melee shortcut (works from any slot) */
	melee: boolean;
	/** edge */
	reload: boolean;
	/** edge */
	slot: HotbarSlot | null;
	/** edge */
	ability: boolean;
	/** held: revive a downed teammate in reach */
	interact: boolean;
};

export const EMPTY_INPUT: InputFrame = {
	move: { x: 0, z: 0 },
	aim: { x: 0, z: 0 },
	fire: false,
	melee: false,
	reload: false,
	slot: null,
	ability: false,
	interact: false
};

// ---------- Local player ----------

export function stepLocalPlayer(world: World, input: InputFrame, dt: number) {
	const p = localPlayer(world);
	if (!p || p.state !== 'alive' || world.game.status !== 'active') return;
	const mods = resolveModifiers(p.id, world.effects, world.now, p.weapon.overclockUntil);
	const w = p.weapon;
	const main = weapons[p.hotbar.main] as RangedWeapon;
	// Reviving roots you in place, facing the teammate, with weapons down.
	const reviving = world.revive ? world.players.get(world.revive.targetId) : undefined;

	// Movement and facing
	if (reviving) {
		p.vel = { x: 0, z: 0 };
		p.facing = angleTo(p.pos, reviving.pos);
	} else {
		p.vel = scale(input.move, p.stats.moveSpeed * mods.speed);
		p.pos = clampToRect(
			add(p.pos, scale(p.vel, dt)),
			ARENA.halfWidth,
			ARENA.halfDepth,
			PLAYER_RADIUS
		);
		if (dist(p.pos, input.aim) > 0.05) p.facing = angleTo(p.pos, input.aim);
	}

	// Timers
	w.cooldownT = Math.max(0, w.cooldownT - dt);
	w.meleeCooldownT = Math.max(0, w.meleeCooldownT - dt);
	w.meleeBufferT = Math.max(0, w.meleeBufferT - dt);
	if (w.reloadT > 0) {
		w.reloadT -= dt;
		if (w.reloadT <= 0) {
			w.reloadT = 0;
			w.ammo = main.clipSize;
		}
	}

	// Hotbar
	if (input.slot && input.slot !== w.slot) {
		w.slot = input.slot;
		w.cooldownT = Math.max(w.cooldownT, 0.15);
	}
	if (input.reload && w.reloadT === 0 && w.ammo < main.clipSize) startReload(p, mods.reload);
	if (input.ability && w.abilityReadyAt <= world.now) world.events.push({ type: 'useAbility' });

	// Attacks
	if (reviving) return;
	if (input.melee || (w.slot === 'melee' && input.fire)) w.meleeBufferT = MELEE_BUFFER_S;
	if (w.meleeBufferT > 0) swingMelee(world, p, mods.attackSpeed);
	else if (w.slot === 'main' && input.fire) fireMain(world, p, mods.attackSpeed, mods.reload);
}

function startReload(p: Player, reloadMod: number) {
	const main = weapons[p.hotbar.main] as RangedWeapon;
	p.weapon.reloadT = (main.reloadMs / 1000) * p.stats.reloadMultiplier * reloadMod;
}

function fireMain(world: World, p: Player, attackSpeed: number, reloadMod: number) {
	const w = p.weapon;
	const main = weapons[p.hotbar.main] as RangedWeapon;
	if (w.reloadT > 0 || w.cooldownT > 0) return;
	if (w.ammo <= 0) {
		startReload(p, reloadMod);
		return;
	}
	w.ammo--;
	w.shots++;
	w.cooldownT = main.cooldownMs / 1000 / attackSpeed;
	if (w.ammo === 0) startReload(p, reloadMod); // auto-reload the moment the clip empties
	world.fx.push({ type: 'muzzle', playerId: p.id });
	const dir = fromAngle(p.facing);
	const muzzle = add(p.pos, scale(dir, PLAYER_RADIUS + 0.2));
	if (main.attackType === 'hitscan') {
		const hit = firstEnemyOnRay(world, muzzle, dir, main.range);
		const end = add(muzzle, scale(dir, hit ? hit.t : main.range));
		world.fx.push({ type: 'tracer', from: muzzle, to: end });
		if (hit) {
			world.fx.push({ type: 'hit', pos: end });
			world.events.push({
				type: 'enemyHit',
				weaponKey: p.hotbar.main,
				hits: hitsForDirectHit(main, hit.enemy, world)
			});
		}
		return;
	}
	const speed = main.projectileSpeed ?? 20;
	world.projectiles.push({
		id: world.nextProjectileId++,
		owner: 'player',
		ownerKey: p.id,
		pos: muzzle,
		vel: scale(dir, speed),
		ttl: main.range / speed,
		damage: main.damage,
		radius: 0.2,
		weaponKey: p.hotbar.main
	});
}

/** A melee press is remembered this long, so pressing slightly early still swings. */
const MELEE_BUFFER_S = 0.25;
const MELEE_GUN_LOCKOUT_S = 0.15;

function swingMelee(world: World, p: Player, attackSpeed: number) {
	const w = p.weapon;
	const melee = weapons[p.hotbar.melee];
	if (melee.slot !== 'melee' || w.meleeCooldownT > 0) return;
	w.meleeBufferT = 0;
	w.meleeCooldownT = melee.cooldownMs / 1000 / attackSpeed;
	// A swing briefly lowers the gun, so melee and shooting do not stack at full rate.
	w.cooldownT = Math.max(w.cooldownT, MELEE_GUN_LOCKOUT_S);
	world.fx.push({ type: 'swing', playerId: p.id });
	const targets = enemiesInArc(world, p.pos, p.facing, melee.range, melee.arcDegrees);
	if (targets.length === 0) return;
	world.events.push({
		type: 'enemyHit',
		weaponKey: p.hotbar.melee,
		hits: targets.map((e) => ({ key: e.key, multiplier: 1 }))
	});
}

// ---------- Projectiles ----------

export function stepProjectiles(world: World, dt: number) {
	const keep = [];
	for (const pr of world.projectiles) {
		pr.pos = add(pr.pos, scale(pr.vel, dt));
		pr.ttl -= dt;
		const out =
			Math.abs(pr.pos.x) > ARENA.halfWidth + 1 || Math.abs(pr.pos.z) > ARENA.halfDepth + 1;
		let done = out;
		if (!done && pr.owner === 'player') done = playerProjectileHit(world, pr, pr.ttl <= 0);
		else if (!done && pr.owner === 'enemy' && isHost(world)) done = enemyProjectileHit(world, pr);
		if (!done && pr.ttl <= 0) done = true;
		if (!done) keep.push(pr);
	}
	world.projectiles = keep;
}

function playerProjectileHit(
	world: World,
	pr: World['projectiles'][number],
	expired: boolean
): boolean {
	const weapon = weapons[pr.weaponKey!] as RangedWeapon;
	const aoe = isAoeWeapon(weapon);
	let struck: Enemy | null = null;
	for (const e of liveEnemies(world)) {
		if (dist(pr.pos, e.pos) <= pr.radius + enemyRadius(e)) {
			struck = e;
			break;
		}
	}
	if (!struck && !(expired && aoe)) return false;
	const hits = aoe ? hitsForAoe(weapon, pr.pos, world) : hitsForDirectHit(weapon, struck!, world);
	world.fx.push({ type: 'hit', pos: pr.pos });
	if (hits.length) world.events.push({ type: 'enemyHit', weaponKey: pr.weaponKey!, hits });
	return true;
}

function enemyProjectileHit(world: World, pr: World['projectiles'][number]): boolean {
	for (const p of alivePlayers(world)) {
		if (dist(pr.pos, p.pos) <= pr.radius + PLAYER_RADIUS) {
			world.events.push({
				type: 'playerHit',
				playerId: p.id,
				amount: pr.damage,
				enemyKey: pr.ownerKey
			});
			world.fx.push({ type: 'hit', pos: pr.pos });
			return true;
		}
	}
	return false;
}

// ---------- Pickups ----------

export function stepPickupTouch(world: World) {
	const p = localPlayer(world);
	if (!p || p.state !== 'alive') return;
	for (const pk of world.pickups.values()) {
		if (pk.despawnAt <= world.now) {
			removePickup(world, pk.key);
			continue;
		}
		if (dist(p.pos, pk.pos) <= PICKUP_RADIUS) {
			removePickup(world, pk.key);
			world.events.push({ type: 'pickupTouched', key: pk.key });
		}
	}
}

// ---------- Host ----------

/** Seconds before a wave request is re-sent, or an empty arena is reported. */
const WAVE_RETRY_S = 3;

export function stepHost(world: World, dt: number, rng: Rng) {
	if (world.game.status !== 'active') return;
	const tools: HostTools = {
		rng,
		spawn: (type, pos, extra, key) => spawnEnemy(world, type, pos, extra, key),
		fire: (e, dir, speed, damage) => {
			world.projectiles.push({
				id: world.nextProjectileId++,
				networkKey: `${world.spawnEpoch}-shot-${world.nextProjectileId}`,
				owner: 'enemy',
				ownerKey: e.key,
				pos: add(e.pos, scale(dir, enemyRadius(e) + 0.2)),
				vel: scale(dir, speed),
				ttl: enemyDefs[e.type].attackRange / speed + 0.5,
				damage,
				radius: 0.25
			});
		}
	};

	stepWaves(world, dt, rng, tools);

	for (const e of world.enemies.values()) {
		if (e.dying) continue;
		e.stateT += dt;
		e.cooldown = Math.max(0, e.cooldown - dt);
		// Knockback impulse
		if (len(e.vel) > 0.01) {
			e.pos = add(e.pos, scale(e.vel, dt));
			e.vel = scale(e.vel, Math.max(0, 1 - 8 * dt));
		}
		if (e.stunUntil > world.now) continue;
		const target = pickTarget(e, world);
		if (!target) continue;
		e.targetPlayerId = target.id;
		enemyBrains[e.type](e, target, world, dt, tools);
		e.pos = clampToRect(e.pos, ARENA.halfWidth, ARENA.halfDepth, enemyRadius(e));
	}
	separate(world);
}

function stepWaves(world: World, dt: number, rng: Rng, tools: HostTools) {
	const g = world.game;
	const wv = world.wave;
	if (g.waveState === 'intermission') {
		const due = g.nextWaveAt !== null && world.now >= g.nextWaveAt && g.wave < BOSS_WAVE;
		const retry = wv.requested > g.wave && world.time - wv.requestedAt > WAVE_RETRY_S;
		if (due && (wv.requested <= g.wave || retry)) {
			// The server row flips to in_progress and the next step plans it.
			wv.requested = g.wave + 1;
			wv.requestedAt = world.time;
			world.events.push({ type: 'startWave', wave: g.wave + 1 });
		}
		return;
	}
	if (wv.planned !== g.wave) {
		wv.planned = g.wave;
		const spawned = new Set(g.spawnedKeys ?? []);
		wv.spawnQueue = planWave(g.wave, createRng(g.seed + g.wave))
			.map((entry, i) => ({ ...entry, key: `${g.seed}-w${g.wave}-${i}` }))
			.filter((entry) => !spawned.has(entry.key));
		wv.elapsed = 0;
		wv.addT = BOSS_ADDS.everyMs / 1000;
	}
	wv.elapsed += dt;
	while (
		wv.spawnQueue.length &&
		wv.spawnQueue[0].at <= wv.elapsed &&
		aliveCount(world) < MAX_ALIVE
	) {
		const entry = wv.spawnQueue.shift()!;
		if (!g.spawnedKeys?.includes(entry.key!))
			tools.spawn(entry.type, entry.pos, entry.extra, entry.key);
	}
	// Nothing alive and nothing queued, yet the server still counts enemies: ask it to verify.
	if (wv.spawnQueue.length === 0 && aliveCount(world) === 0 && g.wave < BOSS_WAVE) {
		wv.emptyFor += dt;
		if (wv.emptyFor > WAVE_RETRY_S && world.time - wv.requestedAt > WAVE_RETRY_S) {
			wv.requestedAt = world.time;
			world.events.push({ type: 'waveCleared', wave: g.wave });
		}
	} else {
		wv.emptyFor = 0;
	}
	if (g.wave === BOSS_WAVE && bossAlive(world)) {
		wv.addT -= dt;
		if (wv.addT <= 0) {
			wv.addT = BOSS_ADDS.everyMs / 1000;
			for (let i = 0; i < BOSS_ADDS.count; i++) tools.spawn(BOSS_ADDS.type, rimPoint(rng), true);
		}
	}
}

function bossAlive(world: World): boolean {
	for (const e of world.enemies.values()) if (e.type === 'overlord' && !e.dying) return true;
	return false;
}

export function spawnEnemy(
	world: World,
	type: EnemyType,
	pos: Vec2,
	extra: boolean,
	plannedKey?: string
): Enemy {
	const def = enemyDefs[type];
	const key = plannedKey ?? `${world.game.seed}-${world.spawnEpoch}-${world.nextKey++}`;
	const e = makeEnemy(key, type, world.game.wave, pos, def.hp, {
		hovering: def.hovering,
		facing: angleTo(pos, { x: 0, z: 0 })
	});
	if (def.disguises) {
		const t = pickTarget(e, world);
		e.state = 'disguised';
		e.disguisedAs = t?.id ?? null;
	}
	addEnemy(world, e);
	world.events.push({ type: 'spawnEnemy', enemy: e, extra });
	return e;
}

/** Push overlapping ground enemies apart so they do not stack into one blob. */
function separate(world: World) {
	const list = liveEnemies(world).filter((e) => !e.hovering);
	for (let i = 0; i < list.length; i++) {
		for (let j = i + 1; j < list.length; j++) {
			const a = list[i];
			const b = list[j];
			const minD = enemyRadius(a) + enemyRadius(b);
			const d = dist(a.pos, b.pos);
			if (d >= minD || d < 1e-4) continue;
			const push = scale(norm(sub(b.pos, a.pos)), (minD - d) / 2);
			a.pos = sub(a.pos, push);
			b.pos = add(b.pos, push);
		}
	}
}
