// Turns a wave number into a time-staggered spawn plan around the arena rim.
import { ARENA, SPAWN_BATCH, SPAWN_EVERY_MS, waveEntries } from './data/waves.js';
import type { EnemyType } from './data/enemies.js';
import type { Rng } from './rng.js';
import type { Vec2 } from './vec.js';
import type { SpawnEntry, World } from './world.js';

/** A random point just inside the arena edge. */
export function rimPoint(rng: Rng, inset = 1.5): Vec2 {
	const side = rng.int(0, 3);
	const w = ARENA.halfWidth - inset;
	const d = ARENA.halfDepth - inset;
	switch (side) {
		case 0:
			return { x: rng.range(-w, w), z: -d };
		case 1:
			return { x: rng.range(-w, w), z: d };
		case 2:
			return { x: -w, z: rng.range(-d, d) };
		default:
			return { x: w, z: rng.range(-d, d) };
	}
}

/** Interleave types so a wave does not front-load all of one kind. */
function interleave(entries: { type: EnemyType; count: number }[]): EnemyType[] {
	const pools = entries.map((e) => ({ type: e.type, left: e.count }));
	const out: EnemyType[] = [];
	let any = true;
	while (any) {
		any = false;
		for (const p of pools) {
			if (p.left > 0) {
				out.push(p.type);
				p.left--;
				any = true;
			}
		}
	}
	return out;
}

export function planWave(wave: number, rng: Rng): SpawnEntry[] {
	const types = interleave(waveEntries(wave));
	// The boss walks in first and alone.
	types.sort((a, b) => (a === 'overlord' ? -1 : b === 'overlord' ? 1 : 0));
	return types.map((type, i) => ({
		at: Math.floor(i / SPAWN_BATCH) * (SPAWN_EVERY_MS / 1000),
		type,
		pos: type === 'overlord' ? { x: 0, z: -ARENA.halfDepth + 3 } : rimPoint(rng),
		extra: false
	}));
}

export function aliveCount(world: World): number {
	let n = 0;
	for (const e of world.enemies.values()) if (!e.dying) n++;
	return n;
}
