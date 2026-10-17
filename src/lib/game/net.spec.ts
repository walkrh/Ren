import { describe, expect, it } from 'vitest';
import { SnapshotBuffer } from './interp.js';
import { diffEnemies, enemySnapshot, type EnemySent } from './diff.js';
import { createGameLoop, STEP } from './loop.js';
import { EMPTY_INPUT } from './sim.js';
import { fakeSync, rng, testPlayer, testWorld } from './testing.js';
import { addEnemy, makeEnemy } from './world.js';

describe('SnapshotBuffer', () => {
	it('holds the first sample instead of sliding in from the origin', () => {
		const b = new SnapshotBuffer(100);
		b.push({ t: 1000, x: 5, z: 5, facing: 0 });
		const s = b.sample(1000);
		expect(s.x).toBe(5);
		expect(s.z).toBe(5);
	});

	it('interpolates between bracketing samples at now - delay', () => {
		const b = new SnapshotBuffer(100);
		b.push({ t: 1000, x: 0, z: 0, facing: 0 });
		b.push({ t: 1100, x: 10, z: 0, facing: 0 });
		expect(b.sample(1150).x).toBeCloseTo(5);
	});

	it('extrapolates briefly past the newest sample, then holds', () => {
		const b = new SnapshotBuffer(0);
		b.push({ t: 1000, x: 0, z: 0, facing: 0 });
		b.push({ t: 1100, x: 10, z: 0, facing: 0 });
		expect(b.sample(1150).x).toBeCloseTo(15);
		expect(b.sample(5000).x).toBeCloseTo(20); // capped at 100ms ahead
	});

	it('takes the short way round when interpolating facing', () => {
		const b = new SnapshotBuffer(0);
		b.push({ t: 0, x: 0, z: 0, facing: Math.PI - 0.1 });
		b.push({ t: 100, x: 0, z: 0, facing: -Math.PI + 0.1 });
		const f = b.sample(50).facing;
		expect(Math.abs(Math.abs(f) - Math.PI)).toBeLessThan(0.01);
	});
});

describe('diffEnemies', () => {
	it('skips unconfirmed, dying, and unmoved enemies', () => {
		const world = testWorld();
		const moved = makeEnemy('a', 'mobile_tank', 1, { x: 0, z: 0 }, 220, { confirmed: true });
		const still = makeEnemy('b', 'mobile_tank', 1, { x: 3, z: 0 }, 220, { confirmed: true });
		const fresh = makeEnemy('c', 'mobile_tank', 1, { x: 6, z: 0 }, 220);
		const dead = makeEnemy('d', 'mobile_tank', 1, { x: 9, z: 0 }, 0, {
			confirmed: true,
			dying: true
		});
		for (const e of [moved, still, fresh, dead]) addEnemy(world, e);
		const last = new Map<string, EnemySent>([
			['a', enemySnapshot(moved)],
			['b', enemySnapshot(still)]
		]);
		moved.pos = { x: 1, z: 0 };
		still.pos = { x: 3.01, z: 0 }; // under the threshold
		expect(diffEnemies(world, last).map((e) => e.key)).toEqual(['a']);
	});

	it('sends a state change even without movement', () => {
		const world = testWorld();
		const e = makeEnemy('a', 'id_stealer', 4, { x: 0, z: 0 }, 90, {
			confirmed: true,
			disguisedAs: 'p1'
		});
		addEnemy(world, e);
		const last = new Map([['a', enemySnapshot(e)]]);
		e.disguisedAs = null;
		e.state = 'revealed';
		expect(diffEnemies(world, last).length).toBe(1);
	});
});

describe('wave safety', () => {
	it('re-requests a wave start that the server never acknowledged', () => {
		const world = testWorld({ wave: 1, waveState: 'intermission', nextWaveAt: 999_000 });
		testPlayer(world);
		const sync = fakeSync();
		const loop = createGameLoop({
			world,
			input: () => EMPTY_INPUT,
			sync,
			rng: rng(),
			now: () => 1_000_000
		});
		loop.tick(STEP);
		expect(sync.waves).toEqual([2]);
		for (let i = 0; i < 60 * 4; i++) loop.tick(STEP);
		expect(sync.waves).toEqual([2, 2]);
	});

	it('reports an empty arena when the server still counts enemies', () => {
		const world = testWorld({ wave: 2, waveState: 'in_progress', waveEnemiesRemaining: 1 });
		testPlayer(world);
		world.wave.planned = 2; // plan already drained
		const sync = fakeSync();
		const loop = createGameLoop({
			world,
			input: () => EMPTY_INPUT,
			sync,
			rng: rng(),
			now: () => 1_000_000
		});
		for (let i = 0; i < 60 * 4; i++) loop.tick(STEP);
		expect(sync.cleared).toEqual([2]);
	});

	it('never reports the boss wave as cleared', () => {
		const world = testWorld({ wave: 5, waveState: 'in_progress', waveEnemiesRemaining: 1 });
		testPlayer(world);
		world.wave.planned = 5;
		const sync = fakeSync();
		const loop = createGameLoop({
			world,
			input: () => EMPTY_INPUT,
			sync,
			rng: rng(),
			now: () => 1_000_000
		});
		for (let i = 0; i < 60 * 4; i++) loop.tick(STEP);
		expect(sync.cleared).toEqual([]);
	});
});
