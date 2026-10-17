import { describe, expect, it } from 'vitest';
import { createGameLoop, STEP } from './loop.js';
import { EMPTY_INPUT, type InputFrame } from './sim.js';
import { fakeSync, rng, testPlayer, testWorld } from './testing.js';
import { addEnemy, makeEnemy } from './world.js';
import { weapons } from './data/items.js';

const aimRight = { x: 10, z: 0 };

function setup(race: 'human' | 'agarthan' | 'forsaken' = 'forsaken') {
	// Not the host, so enemies stand still.
	const world = testWorld({ hostUserId: 'someone-else' });
	const p = testPlayer(world, { race });
	addEnemy(world, makeEnemy('t', 'mobile_tank', 1, { x: 1.5, z: 0 }, 220));
	const sync = fakeSync();
	let next: Partial<InputFrame> = {};
	const loop = createGameLoop({
		world,
		input: () => {
			const f = { ...EMPTY_INPUT, aim: aimRight, ...next };
			next = {};
			return f;
		},
		sync,
		rng: rng(),
		now: () => 1_000_000
	});
	const press = (f: Partial<InputFrame>) => {
		next = f;
		loop.tick(STEP);
	};
	const swings = () => world.fx.filter((f) => f.type === 'swing').length;
	return { world, p, sync, loop, press, swings };
}

describe('melee', () => {
	it('emits a swing even when nothing is in reach', () => {
		const { world, press, swings, sync } = setup();
		world.enemies.clear();
		press({ melee: true });
		expect(swings()).toBe(1);
		expect(sync.hits.length).toBe(0);
	});

	it('swings right after a gun shot instead of being eaten by the gun cooldown', () => {
		const { p, press, sync } = setup('forsaken'); // shard launcher: 850ms cooldown
		press({ fire: true });
		expect(p.weapon.cooldownT).toBeGreaterThan(0.5);
		press({ melee: true });
		const meleeHits = sync.hits.filter((h) => h.weaponKey === 'breaker_hammer');
		expect(meleeHits.length).toBe(1);
	});

	it('swings while the gun is reloading', () => {
		const { p, press, sync } = setup('human');
		p.weapon.ammo = 0;
		p.weapon.reloadT = 1.5;
		press({ melee: true });
		expect(sync.hits.filter((h) => h.weaponKey === 'shock_baton').length).toBe(1);
	});

	it('buffers a press made while melee is still cooling down', () => {
		const { press, loop, sync } = setup('agarthan'); // data blade: 280ms
		press({ melee: true });
		expect(sync.hits.length).toBe(1);
		// Press again 0.1s later, before the 0.28s cooldown is over.
		for (let i = 0; i < 6; i++) loop.tick(STEP);
		press({ melee: true });
		expect(sync.hits.length).toBe(1);
		for (let i = 0; i < 15; i++) loop.tick(STEP);
		expect(sync.hits.length).toBe(2);
	});

	it('holding fire with the melee slot selected keeps swinging at the weapon rate', () => {
		const { press, loop, sync } = setup('agarthan');
		press({ slot: 'melee' });
		const hold = { ...EMPTY_INPUT, aim: aimRight, fire: true };
		// 1 second of held fire at 280ms per swing => 4 swings (t = 0, .28, .56, .84)
		for (let i = 0; i < 60; i++) press(hold);
		const n = sync.hits.length;
		expect(n).toBeGreaterThanOrEqual(3);
		expect(n).toBeLessThanOrEqual(Math.ceil(1000 / weapons.data_blade.cooldownMs) + 1);
	});
});
