import { describe, expect, it } from 'vitest';
import { createGameLoop, STEP } from './loop.js';
import { EMPTY_INPUT, spawnEnemy, stepHost, stepLocalPlayer, stepProjectiles } from './sim.js';
import { fakeSync, rng, testPlayer, testWorld } from './testing.js';
import { enemies } from './data/enemies.js';
import { weapons } from './data/items.js';
import { MAX_ALIVE, waveEnemyCount } from './data/waves.js';
import { enemiesInArc, statusFromHit } from './combat.js';
import { makeEnemy, addEnemy } from './world.js';

const input = (over: Partial<typeof EMPTY_INPUT>) => ({ ...EMPTY_INPUT, ...over });

describe('local player', () => {
	it('moves at its stat speed and clamps to the arena', () => {
		const world = testWorld();
		const p = testPlayer(world, { origin: 'plains' });
		for (let i = 0; i < 60; i++)
			stepLocalPlayer(world, input({ move: { x: 1, z: 0 }, aim: { x: 10, z: 0 } }), STEP);
		expect(p.pos.x).toBeCloseTo(7.2, 1);
		for (let i = 0; i < 600; i++)
			stepLocalPlayer(world, input({ move: { x: 1, z: 0 }, aim: { x: 10, z: 0 } }), STEP);
		expect(p.pos.x).toBeLessThanOrEqual(24);
	});

	it('hitscan fire hits the first enemy on the ray, spends ammo, and reloads when empty', () => {
		const world = testWorld({ hostUserId: 'someone-else' });
		const p = testPlayer(world, { race: 'agarthan' });
		const near = makeEnemy('e1', 'mobile_tank', 1, { x: 3, z: 0 }, 220);
		const far = makeEnemy('e2', 'mobile_tank', 1, { x: 5, z: 0 }, 220);
		addEnemy(world, near);
		addEnemy(world, far);
		const sync = fakeSync();
		const loop = createGameLoop({
			world,
			input: () => input({ fire: true, aim: { x: 10, z: 0 } }),
			sync,
			rng: rng(),
			now: () => 1_000_000
		});
		loop.tick(STEP);
		expect(sync.hits.length).toBe(1);
		expect(sync.hits[0].weaponKey).toBe('arc_caster');
		expect(sync.hits[0].hits[0]).toEqual({ key: 'e1', multiplier: 1 });
		// chain reaches the second enemy at half damage
		expect(sync.hits[0].hits[1]).toEqual({ key: 'e2', multiplier: 0.5 });
		expect(p.weapon.ammo).toBe(weapons.arc_caster.clipSize - 1);
		expect(near.hp).toBeLessThan(220);

		// Empty the clip; the reload starts on its own and blocks firing.
		for (let i = 0; i < 400 && p.weapon.ammo > 0; i++) loop.tick(STEP);
		expect(p.weapon.ammo).toBe(0);
		expect(sync.hits.length).toBe(weapons.arc_caster.clipSize);
		expect(p.weapon.reloadT).toBeGreaterThan(0);
		const hitsBefore = sync.hits.length;
		for (let i = 0; i < 30; i++) loop.tick(STEP);
		expect(sync.hits.length).toBe(hitsBefore);
		// Plains shortens the reload by 20%
		for (let i = 0; i < Math.ceil((weapons.arc_caster.reloadMs / 1000) * 0.8 * 60) + 2; i++)
			loop.tick(STEP);
		expect(p.weapon.reloadT).toBe(0);
		expect(p.weapon.ammo).toBeGreaterThan(0);
		expect(sync.hits.length).toBeGreaterThan(hitsBefore);
	});

	it('projectile weapons hit when the shard arrives, and aoe damage falls off with distance', () => {
		const world = testWorld({ hostUserId: 'someone-else' });
		testPlayer(world, { race: 'forsaken' });
		addEnemy(world, makeEnemy('c', 'mobile_tank', 1, { x: 6, z: 0 }, 220));
		addEnemy(world, makeEnemy('edge', 'mobile_tank', 1, { x: 6, z: 2.5 }, 220));
		addEnemy(world, makeEnemy('out', 'mobile_tank', 1, { x: 6, z: 6 }, 220));
		const sync = fakeSync();
		const loop = createGameLoop({
			world,
			input: () => input({ fire: true, aim: { x: 10, z: 0 } }),
			sync,
			rng: rng(),
			now: () => 1_000_000
		});
		loop.tick(STEP);
		expect(world.projectiles.length).toBe(1);
		for (let i = 0; i < 60 && sync.hits.length === 0; i++) loop.tick(STEP);
		expect(sync.hits.length).toBe(1);
		const keys = sync.hits[0].hits.map((h) => h.key);
		expect(keys).toContain('c');
		expect(keys).toContain('edge');
		expect(keys).not.toContain('out');
		const centre = sync.hits[0].hits.find((h) => h.key === 'c')!;
		const edge = sync.hits[0].hits.find((h) => h.key === 'edge')!;
		expect(centre.multiplier).toBeGreaterThan(edge.multiplier);
	});

	it('melee cannot hit a hovering scout but hits a tank in the arc', () => {
		const world = testWorld({ hostUserId: 'someone-else' });
		testPlayer(world, { race: 'human' });
		addEnemy(world, makeEnemy('s', 'scout', 1, { x: 1.5, z: 0 }, 40, { hovering: true }));
		addEnemy(world, makeEnemy('t', 'mobile_tank', 1, { x: 1.5, z: 0.5 }, 220));
		addEnemy(world, makeEnemy('behind', 'mobile_tank', 1, { x: -1.5, z: 0 }, 220));
		const inArc = enemiesInArc(world, { x: 0, z: 0 }, 0, 2, 90);
		expect(inArc.map((e) => e.key)).toEqual(['t']);
		const sync = fakeSync();
		const loop = createGameLoop({
			world,
			input: () => input({ melee: true, aim: { x: 10, z: 0 } }),
			sync,
			rng: rng(),
			now: () => 1_000_000
		});
		loop.tick(STEP);
		expect(sync.hits[0].weaponKey).toBe('shock_baton');
		expect(sync.hits[0].hits.map((h) => h.key)).toEqual(['t']);
	});

	it('every 5th pulse rifle hit stuns, every 3rd baton hit stuns and all baton hits slow', () => {
		expect(statusFromHit(weapons.pulse_rifle, 4, 0).stunMs).toBe(0);
		expect(statusFromHit(weapons.pulse_rifle, 5, 0).stunMs).toBe(500);
		const b1 = statusFromHit(weapons.shock_baton, 1, 0);
		expect(b1.slow?.value).toBe(0.4);
		expect(b1.stunMs).toBe(0);
		expect(statusFromHit(weapons.shock_baton, 3, 0).stunMs).toBe(500);
		expect(statusFromHit(weapons.data_blade, 1, 0).lifesteal).toBe(0.15);
		expect(statusFromHit(weapons.breaker_hammer, 1, 0).knockback).toBe(3);
	});
});

describe('host', () => {
	it('spawns wave 1 in batches, respecting the alive cap, and emits spawn events', () => {
		const world = testWorld({ wave: 1, waveState: 'in_progress' });
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
		expect(sync.spawns.length).toBe(4);
		for (let i = 0; i < 60 * 3; i++) loop.tick(STEP);
		expect(sync.spawns.length).toBe(waveEnemyCount(1));
		expect(world.enemies.size).toBeLessThanOrEqual(MAX_ALIVE);
		expect(sync.spawns.every((s) => s.enemy.type === 'mobile_tank')).toBe(true);
	});

	it('requests the next wave once when the intermission ends', () => {
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
		loop.tick(STEP);
		expect(sync.waves).toEqual([2]);
	});

	it('a tank walks to the player and rams it; damage goes through the sync port', () => {
		const world = testWorld({ wave: 1, waveState: 'in_progress' });
		const p = testPlayer(world, { origin: 'desert' });
		world.wave.planned = 1; // skip the planner; hand-spawn
		const tank = spawnEnemy(world, 'mobile_tank', { x: 6, z: 0 }, false);
		const sync = fakeSync();
		const loop = createGameLoop({
			world,
			input: () => EMPTY_INPUT,
			sync,
			rng: rng(),
			now: () => 1_000_000
		});
		for (let i = 0; i < 60 * 4; i++) loop.tick(STEP);
		expect(tank.pos.x).toBeLessThan(6);
		expect(sync.damage.length).toBeGreaterThan(0);
		expect(sync.damage[0]).toMatchObject({
			playerId: 'p1',
			amount: enemies.mobile_tank.damage,
			enemyKey: tank.key
		});
		// Local prediction applied desert's 20% reduction
		expect(p.hp).toBeLessThan(p.maxHp);
		expect(p.hp).toBeGreaterThan(p.maxHp - enemies.mobile_tank.damage * sync.damage.length);
	});

	it('an id stealer looks like its target until its first hit', () => {
		const world = testWorld({ wave: 4, waveState: 'in_progress' });
		testPlayer(world);
		world.wave.planned = 4;
		const thief = spawnEnemy(world, 'id_stealer', { x: 4, z: 0 }, false);
		expect(thief.disguisedAs).toBe('p1');
		const sync = fakeSync();
		const loop = createGameLoop({
			world,
			input: () => EMPTY_INPUT,
			sync,
			rng: rng(),
			now: () => 1_000_000
		});
		for (let i = 0; i < 60 * 3 && sync.damage.length === 0; i++) loop.tick(STEP);
		expect(sync.damage.length).toBe(1);
		expect(thief.disguisedAs).toBeNull();
		expect(thief.state).toBe('revealed');
	});

	it('a gun drone keeps its distance and fires projectiles that hit the player', () => {
		const world = testWorld({ wave: 2, waveState: 'in_progress' });
		testPlayer(world);
		world.wave.planned = 2;
		const drone = spawnEnemy(world, 'gun_drone', { x: 3, z: 0 }, false);
		const sync = fakeSync();
		const loop = createGameLoop({
			world,
			input: () => EMPTY_INPUT,
			sync,
			rng: rng(),
			now: () => 1_000_000
		});
		for (let i = 0; i < 60 * 4; i++) loop.tick(STEP);
		expect(Math.hypot(drone.pos.x, drone.pos.z)).toBeGreaterThanOrEqual(
			enemies.gun_drone.ranged!.keepMin - 0.5
		);
		expect(
			sync.damage.some((d) => d.enemyKey === drone.key && d.amount === enemies.gun_drone.damage)
		).toBe(true);
	});

	it('the overlord changes phase with hp and spawns drones in phase 2', () => {
		const world = testWorld({ wave: 5, waveState: 'in_progress' });
		testPlayer(world);
		world.wave.planned = 5;
		const boss = spawnEnemy(world, 'overlord', { x: 8, z: 0 }, false);
		boss.hp = boss.maxHp * 0.5;
		const sync = fakeSync();
		stepHost(world, STEP, rng());
		expect(boss.bossPhase).toBe(2);
		expect(boss.state).toBe('phase2');
		expect(sync.spawns.length).toBe(0);
		// first add batch fires when the timer first elapses (addT starts at 0)
		const drones = [...world.enemies.values()].filter((e) => e.type === 'gun_drone');
		expect(drones.length).toBe(2);
		const droneSpawns = world.events.filter(
			(e) => e.type === 'spawnEnemy' && e.extra && e.enemy.type === 'gun_drone'
		);
		expect(droneSpawns.length).toBe(2);
	});

	it('does not simulate enemies on a non-host client', () => {
		const world = testWorld({ hostUserId: 'someone-else', wave: 1, waveState: 'in_progress' });
		testPlayer(world);
		const sync = fakeSync();
		const loop = createGameLoop({
			world,
			input: () => EMPTY_INPUT,
			sync,
			rng: rng(),
			now: () => 1_000_000
		});
		for (let i = 0; i < 60; i++) loop.tick(STEP);
		expect(sync.spawns.length).toBe(0);
		expect(world.enemies.size).toBe(0);
	});
});

describe('projectiles', () => {
	it('expire at range', () => {
		const world = testWorld();
		testPlayer(world, { race: 'human' });
		const sync = fakeSync();
		const loop = createGameLoop({
			world,
			input: () => input({ fire: true, aim: { x: 10, z: 0 } }),
			sync,
			rng: rng(),
			now: () => 1_000_000
		});
		loop.tick(STEP);
		expect(world.projectiles.length).toBe(1);
		for (let i = 0; i < 60; i++) stepProjectiles(world, STEP);
		expect(world.projectiles.length).toBe(0);
		expect(sync.hits.length).toBe(0);
	});
});
