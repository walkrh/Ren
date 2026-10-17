// Wave composition and pacing. Boss on the final wave; victory ends the run.
import type { EnemyType } from './enemies.js';

export const BOSS_WAVE = 5;
export const INTERMISSION_MS = 10_000;
/** Pause before wave 1 so players can get their bearings. */
export const START_INTERMISSION_MS = 5000;
export const SPAWN_BATCH = 4;
export const SPAWN_EVERY_MS = 2000;
export const MAX_ALIVE = 12;

/** Scouts keep coming while the Overlord lives. */
export const BOSS_ADDS = { type: 'scout' as EnemyType, count: 2, everyMs: 30_000 };

export type WaveEntry = { type: EnemyType; count: number };

export const waves: Record<number, WaveEntry[]> = {
	1: [{ type: 'mobile_tank', count: 6 }],
	2: [
		{ type: 'mobile_tank', count: 6 },
		{ type: 'gun_drone', count: 4 }
	],
	3: [
		{ type: 'mobile_tank', count: 5 },
		{ type: 'gun_drone', count: 5 },
		{ type: 'scout', count: 4 }
	],
	4: [
		{ type: 'mobile_tank', count: 6 },
		{ type: 'gun_drone', count: 6 },
		{ type: 'scout', count: 4 },
		{ type: 'id_stealer', count: 1 }
	],
	5: [
		{ type: 'overlord', count: 1 },
		{ type: 'gun_drone', count: 4 }
	]
};

export function waveEntries(wave: number): WaveEntry[] {
	return waves[wave] ?? [];
}

export function waveEnemyCount(wave: number): number {
	return waveEntries(wave).reduce((n, e) => n + e.count, 0);
}

/** Flat ground plane, centred on the origin. */
export const ARENA = { halfWidth: 24, halfDepth: 24 };

export const PLAYER_RADIUS = 0.5;
export const PICKUP_RADIUS = 1.0;
export const BLEED_OUT_MS = 30_000;
export const REVIVE_MS = 4000;
/** How close a reviver must stand to a downed teammate. */
export const REVIVE_RANGE = 2.5;
/** Fraction of max hp a revived player gets back. */
export const REVIVE_HP_FRACTION = 0.5;
/** A revive this long past its finish time is abandoned (the reviver left); anyone may take over. */
export const REVIVE_STALE_MS = 3000;
