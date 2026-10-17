// One brain per enemy type. Only the host runs these. Brains move the enemy, pick targets,
// and emit 'playerHit' / spawn requests; they never touch Convex.
import { enemies as defs, OVERLORD, overlordPhase, type EnemyType } from './data/enemies.js';
import { ARENA, PLAYER_RADIUS } from './data/waves.js';
import type { Rng } from './rng.js';
import { add, angleTo, clampToRect, dist, fromAngle, norm, scale, sub, type Vec2 } from './vec.js';
import { alivePlayers, type Enemy, type Player, type World } from './world.js';

export type HostTools = {
	rng: Rng;
	spawn(type: EnemyType, pos: Vec2, extra: boolean, key?: string): void;
	fire(e: Enemy, dir: Vec2, speed: number, damage: number): void;
};

export type Brain = (e: Enemy, target: Player, world: World, dt: number, tools: HostTools) => void;

export function speedOf(e: Enemy, world: World): number {
	const def = defs[e.type];
	let s = e.type === 'overlord' && e.bossPhase === 3 ? OVERLORD.phase3Speed : def.speed;
	if (e.slowUntil > world.now) s *= 1 - e.slowValue;
	return s;
}

export function pickTarget(e: Enemy, world: World): Player | null {
	let best: Player | null = null;
	let bestD = Infinity;
	for (const p of alivePlayers(world)) {
		const d = dist(e.pos, p.pos);
		if (d < bestD) {
			best = p;
			bestD = d;
		}
	}
	return best;
}

function moveToward(e: Enemy, to: Vec2, speed: number, dt: number) {
	const dir = norm(sub(to, e.pos));
	e.pos = add(e.pos, scale(dir, speed * dt));
	if (dir.x !== 0 || dir.z !== 0) e.facing = Math.atan2(dir.z, dir.x);
}

function moveAway(e: Enemy, from: Vec2, speed: number, dt: number) {
	const dir = norm(sub(e.pos, from));
	e.pos = add(e.pos, scale(dir, speed * dt));
	e.facing = angleTo(e.pos, from);
}

/** Enemies outside the target's notice radius creep instead of charging. */
function chaseSpeed(e: Enemy, target: Player, world: World): number {
	const s = speedOf(e, world);
	return dist(e.pos, target.pos) > target.stats.aggroRadius ? s * 0.5 : s;
}

function inMeleeRange(e: Enemy, target: Player): boolean {
	return dist(e.pos, target.pos) <= defs[e.type].attackRange + defs[e.type].radius + PLAYER_RADIUS;
}

function melee(e: Enemy, target: Player, world: World, damageMultiplier = 1) {
	if (e.cooldown > 0 || !inMeleeRange(e, target)) return false;
	e.cooldown = defs[e.type].attackCooldownMs / 1000;
	e.facing = angleTo(e.pos, target.pos);
	world.events.push({
		type: 'playerHit',
		playerId: target.id,
		amount: defs[e.type].damage * damageMultiplier,
		enemyKey: e.key
	});
	if (e.disguisedAs) {
		e.disguisedAs = null;
		e.state = 'revealed';
		e.stateT = 0;
	}
	return true;
}

const mobileTank: Brain = (e, target, world, dt) => {
	e.state = 'chase';
	if (!melee(e, target, world)) moveToward(e, target.pos, chaseSpeed(e, target, world), dt);
};

/** Keep inside the [keepMin, keepMax] band, strafe sideways inside it, shoot on cooldown. */
function kite(e: Enemy, target: Player, world: World, dt: number) {
	const def = defs[e.type];
	const band = def.ranged!;
	const d = dist(e.pos, target.pos);
	const s = chaseSpeed(e, target, world);
	if (d < band.keepMin) {
		moveAway(e, target.pos, s, dt);
		e.state = 'retreat';
	} else if (d > band.keepMax) {
		moveToward(e, target.pos, s, dt);
		e.state = 'approach';
	} else {
		// Strafe: orbit direction flips with the key hash so drones do not all circle the same way.
		const sign = e.key.charCodeAt(e.key.length - 1) % 2 === 0 ? 1 : -1;
		const theta = angleTo(target.pos, e.pos) + sign * 0.5 * Math.PI;
		e.pos = add(e.pos, scale(fromAngle(theta), s * 0.6 * dt));
		e.state = 'strafe';
	}
	e.facing = angleTo(e.pos, target.pos);
}

const gunDrone: Brain = (e, target, world, dt, tools) => {
	kite(e, target, world, dt);
	const def = defs[e.type];
	if (e.cooldown <= 0 && dist(e.pos, target.pos) <= def.attackRange) {
		e.cooldown = def.attackCooldownMs / 1000;
		tools.fire(e, norm(sub(target.pos, e.pos)), def.ranged!.projectileSpeed, def.damage);
	}
};

const scout: Brain = (e, target, world, dt) => {
	e.hovering = true;
	const s = speedOf(e, world);
	if (e.cooldown <= 0) {
		// Dash straight in; the hit lands when it arrives.
		e.state = 'dash';
		if (!melee(e, target, world)) moveToward(e, target.pos, s * 1.6, dt);
		return;
	}
	// Orbit at a few units while the attack recharges.
	e.state = 'orbit';
	const orbit = add(target.pos, fromAngle(e.stateT * 1.5, 4));
	moveToward(e, orbit, s, dt);
	e.facing = angleTo(e.pos, target.pos);
};

const idStealer: Brain = (e, target, world, dt) => {
	if (e.state !== 'revealed') {
		// Walk up looking like the teammate it copies, at a player's pace.
		e.state = 'disguised';
		e.disguisedAs = target.id;
		if (!melee(e, target, world)) moveToward(e, target.pos, target.stats.moveSpeed, dt);
		return;
	}
	if (!melee(e, target, world)) moveToward(e, target.pos, chaseSpeed(e, target, world), dt);
};

const overlord: Brain = (e, target, world, dt, tools) => {
	const def = defs[e.type];
	const phase = overlordPhase(e.hp, e.maxHp);
	if (phase !== e.bossPhase) {
		e.bossPhase = phase;
		e.stateT = 0;
	}
	kite(e, target, world, dt);
	e.state = `phase${phase}`;
	if (e.cooldown <= 0 && dist(e.pos, target.pos) <= def.attackRange) {
		e.cooldown = def.attackCooldownMs / 1000;
		const dmg = def.damage * (phase === 3 ? OVERLORD.phase3DamageMultiplier : 1);
		const base = angleTo(e.pos, target.pos);
		const n = OVERLORD.volleyCount;
		for (let i = 0; i < n; i++) {
			const theta = base + (i - (n - 1) / 2) * OVERLORD.volleySpreadRadians;
			tools.fire(e, fromAngle(theta), def.ranged!.projectileSpeed, dmg);
		}
	}
	if (phase >= 2) {
		e.addT -= dt;
		if (e.addT <= 0) {
			e.addT = OVERLORD.phase2DroneEveryMs / 1000;
			for (let i = 0; i < OVERLORD.phase2DroneCount; i++) {
				const p = clampToRect(
					add(e.pos, fromAngle(tools.rng.range(0, Math.PI * 2), 3)),
					ARENA.halfWidth,
					ARENA.halfDepth,
					1
				);
				tools.spawn('gun_drone', p, true);
			}
		}
	}
};

export const enemyBrains: Record<EnemyType, Brain> = {
	mobile_tank: mobileTank,
	gun_drone: gunDrone,
	scout,
	id_stealer: idStealer,
	overlord
};
