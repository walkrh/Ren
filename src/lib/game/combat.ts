// Hit geometry and the client half of weapon effects (targeting: chain, aoe).
// Status effects from hits (stun/slow/knockback/lifesteal) are applied server-side in hitEnemy.
import { enemies as enemyDefs } from './data/enemies.js';
import type { HitEffect, MeleeWeapon, RangedWeapon } from './data/items.js';
import { angleDiff, dist, sub, type Vec2 } from './vec.js';
import { liveEnemies, type Enemy, type Hit, type World } from './world.js';

/** Distance along a unit ray at which it enters a circle, or null if it misses. */
export function rayCircle(origin: Vec2, dir: Vec2, center: Vec2, radius: number): number | null {
	const oc = sub(origin, center);
	const b = oc.x * dir.x + oc.z * dir.z;
	const c = oc.x * oc.x + oc.z * oc.z - radius * radius;
	const disc = b * b - c;
	if (disc < 0) return null;
	const t = -b - Math.sqrt(disc);
	if (t < 0) return c <= 0 ? 0 : null; // started inside
	return t;
}

export function enemyRadius(e: Enemy): number {
	return enemyDefs[e.type].radius;
}

export function canMeleeHit(e: Enemy): boolean {
	return !e.hovering && !e.dying;
}

/** First live enemy along a ray within range. Returns the enemy and the hit distance. */
export function firstEnemyOnRay(
	world: World,
	origin: Vec2,
	dir: Vec2,
	range: number
): { enemy: Enemy; t: number } | null {
	let best: { enemy: Enemy; t: number } | null = null;
	for (const e of liveEnemies(world)) {
		const t = rayCircle(origin, dir, e.pos, enemyRadius(e));
		if (t === null || t > range) continue;
		if (!best || t < best.t) best = { enemy: e, t };
	}
	return best;
}

/** Live enemies inside a swing arc. Hovering enemies are skipped: melee cannot reach them. */
export function enemiesInArc(
	world: World,
	origin: Vec2,
	facing: number,
	reach: number,
	arcDegrees: number
): Enemy[] {
	const half = (arcDegrees * Math.PI) / 360;
	const out: Enemy[] = [];
	for (const e of liveEnemies(world)) {
		if (!canMeleeHit(e)) continue;
		if (dist(origin, e.pos) > reach + enemyRadius(e)) continue;
		const theta = Math.atan2(e.pos.z - origin.z, e.pos.x - origin.x);
		if (Math.abs(angleDiff(facing, theta)) <= half) out.push(e);
	}
	return out;
}

export function enemiesInRadius(
	world: World,
	center: Vec2,
	radius: number,
	exclude?: string
): Enemy[] {
	const out: Enemy[] = [];
	for (const e of liveEnemies(world)) {
		if (e.key === exclude) continue;
		if (dist(center, e.pos) <= radius + enemyRadius(e)) out.push(e);
	}
	return out;
}

export function nearestEnemy(
	world: World,
	from: Vec2,
	maxDist: number,
	exclude?: string
): Enemy | null {
	let best: Enemy | null = null;
	let bestD = maxDist;
	for (const e of liveEnemies(world)) {
		if (e.key === exclude) continue;
		const d = dist(from, e.pos);
		if (d <= bestD) {
			best = e;
			bestD = d;
		}
	}
	return best;
}

function effectOf<T extends HitEffect['type']>(
	weapon: RangedWeapon | MeleeWeapon,
	type: T
): Extract<HitEffect, { type: T }> | undefined {
	return weapon.effects.find((e) => e.type === type) as Extract<HitEffect, { type: T }> | undefined;
}

/** Hits produced when a ranged shot connects with `primary` (adds chain targets if the weapon has one). */
export function hitsForDirectHit(weapon: RangedWeapon, primary: Enemy, world: World): Hit[] {
	const hits: Hit[] = [{ key: primary.key, multiplier: 1 }];
	const chain = effectOf(weapon, 'chain');
	if (chain) {
		const candidates = enemiesInRadius(world, primary.pos, chain.radius, primary.key)
			.map((e) => ({ e, d: dist(primary.pos, e.pos) }))
			.sort((a, b) => a.d - b.d)
			.slice(0, chain.maxTargets);
		for (const { e } of candidates) hits.push({ key: e.key, multiplier: chain.value });
	}
	return hits;
}

/** Hits produced when an aoe projectile detonates at `center`: full damage at the centre, `value` at the edge. */
export function hitsForAoe(weapon: RangedWeapon, center: Vec2, world: World): Hit[] {
	const aoe = effectOf(weapon, 'aoe');
	if (!aoe) return [];
	return enemiesInRadius(world, center, aoe.radius).map((e) => {
		const d = Math.max(0, dist(center, e.pos) - enemyRadius(e));
		const u = Math.min(1, d / aoe.radius);
		return { key: e.key, multiplier: 1 + (aoe.value - 1) * u };
	});
}

export function isAoeWeapon(weapon: RangedWeapon): boolean {
	return !!effectOf(weapon, 'aoe');
}

/**
 * Server half: which status effects a hit applies, given the shooter's running hit count
 * for this weapon (1-based, already incremented for this hit) and a random roll in [0,1).
 */
export function statusFromHit(
	weapon: RangedWeapon | MeleeWeapon,
	hitNumber: number,
	roll: number
): {
	stunMs: number;
	slow: { value: number; ms: number } | null;
	knockback: number;
	lifesteal: number;
} {
	let stunMs = 0;
	let slow: { value: number; ms: number } | null = null;
	let knockback = 0;
	let lifesteal = 0;
	for (const fx of weapon.effects) {
		if (fx.everyNthHit && hitNumber % fx.everyNthHit !== 0) continue;
		if (fx.chance !== undefined && roll >= fx.chance) continue;
		switch (fx.type) {
			case 'stun':
				stunMs = Math.max(stunMs, fx.durationMs);
				break;
			case 'slow':
				slow = { value: fx.value, ms: fx.durationMs };
				break;
			case 'knockback':
				knockback = Math.max(knockback, fx.value);
				break;
			case 'lifesteal':
				lifesteal += fx.value;
				break;
			case 'chain':
			case 'aoe':
				break; // targeting effects, handled on the client
		}
	}
	return { stunMs, slow, knockback, lifesteal };
}
