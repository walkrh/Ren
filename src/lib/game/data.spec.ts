import { describe, expect, it } from 'vitest';
import { computeStats, resolveModifiers } from './data/stats.js';
import { loadoutFor, weaponKeys, weapons } from './data/items.js';
import { BOSS_WAVE, waveEnemyCount, waves } from './data/waves.js';
import { enemies, overlordPhase } from './data/enemies.js';
import { createRng } from './rng.js';
import { planWave } from './waves.js';
import { ARENA } from './data/waves.js';

describe('stats', () => {
	it('applies race and origin bonuses on top of the base', () => {
		const s = computeStats('forsaken', 'mountains');
		expect(s.maxHp).toBe(125);
		expect(s.damageMultiplier).toBe(1.15);
		expect(s.critChance).toBe(0.05);
	});
	it('aries buff speeds up and fatigue slows down only its target', () => {
		const effects = [
			{
				kind: 'impatience' as const,
				sourcePlayerId: 'a',
				targetPlayerId: 'a',
				magnitude: 0.4,
				startsAt: 0,
				endsAt: 100
			},
			{
				kind: 'impatience_fatigue' as const,
				sourcePlayerId: 'a',
				targetPlayerId: 'a',
				magnitude: 0.25,
				startsAt: 100,
				endsAt: 200
			}
		];
		expect(resolveModifiers('a', effects, 50).speed).toBeCloseTo(1.4);
		expect(resolveModifiers('a', effects, 150).speed).toBeCloseTo(0.75);
		expect(resolveModifiers('b', effects, 50).speed).toBe(1);
		expect(resolveModifiers('a', effects, 500, 600).attackSpeed).toBeCloseTo(1.4);
	});
});

describe('items', () => {
	it('gives every race one main and one melee weapon', () => {
		for (const race of ['human', 'agarthan', 'forsaken'] as const) {
			const kit = loadoutFor(race, 'libra');
			expect(weapons[kit.main].slot).toBe('main');
			expect(weapons[kit.melee].slot).toBe('melee');
			expect(weapons[kit.main].race).toBe(race);
		}
	});
	it('keys match ids', () => {
		for (const k of weaponKeys) expect(weapons[k].id).toBe(k);
	});
});

describe('waves', () => {
	it('defines every wave up to the boss, with the boss only on the last', () => {
		for (let w = 1; w <= BOSS_WAVE; w++) expect(waveEnemyCount(w)).toBeGreaterThan(0);
		for (let w = 1; w < BOSS_WAVE; w++)
			expect(waves[w].some((e) => e.type === 'overlord')).toBe(false);
		expect(waves[BOSS_WAVE].some((e) => e.type === 'overlord')).toBe(true);
	});
	it('plans staggered spawns inside the arena with the boss first', () => {
		const plan = planWave(BOSS_WAVE, createRng(1));
		expect(plan.length).toBe(waveEnemyCount(BOSS_WAVE));
		expect(plan[0].type).toBe('overlord');
		for (const s of plan) {
			expect(Math.abs(s.pos.x)).toBeLessThanOrEqual(ARENA.halfWidth);
			expect(Math.abs(s.pos.z)).toBeLessThanOrEqual(ARENA.halfDepth);
		}
		const w1 = planWave(1, createRng(1));
		expect(w1.map((s) => s.at)).toEqual([0, 0, 0, 0, 2, 2]);
	});
	it('overlord phases flip at the thresholds', () => {
		const max = enemies.overlord.hp;
		expect(overlordPhase(max, max)).toBe(1);
		expect(overlordPhase(max * 0.5, max)).toBe(2);
		expect(overlordPhase(max * 0.1, max)).toBe(3);
	});
});
