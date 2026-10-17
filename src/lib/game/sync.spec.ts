import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConvexClient } from 'convex/browser';
import { getFunctionName, type FunctionReference } from 'convex/server';
import type { Id } from '../../convex/_generated/dataModel';
import { GameSync } from './sync.js';
import { applyEvents, createGameLoop, STEP } from './loop.js';
import { EMPTY_INPUT, stepHost, stepProjectiles } from './sim.js';
import { fakeSync, rng, testPlayer, testWorld } from './testing.js';
import { addEnemy, makeEnemy } from './world.js';

function connection(world = testWorld()) {
	const listeners = new Map<string, (value: unknown) => void>();
	const mutation = vi
		.fn<(fn: FunctionReference<'mutation'>, args: unknown) => Promise<void>>()
		.mockResolvedValue(undefined);
	const client = {
		onUpdate(fn: FunctionReference<'query'>, _args: unknown, callback: (value: unknown) => void) {
			listeners.set(getFunctionName(fn), callback);
			return () => {};
		},
		mutation
	} as unknown as ConvexClient;
	const sync = new GameSync(client, 'g1' as Id<'games'>, world);
	sync.start();
	const p = testPlayer(world);
	const player = { ...p, _id: p.id, abilityReadyAt: 0, hp: 50 };
	const state = { game: world.game, players: [player], effects: [], pickups: [] };
	const emit = (name: string, value: unknown) => listeners.get(`games:${name}`)?.(value);
	emit('state', state);
	emit('enemies', []);
	emit('transforms', [{ playerId: p.id, position: p.pos, facing: 0 }]);
	emit('projectiles', null);
	return { world, sync, mutation, emit, state, player, listeners };
}

afterEach(() => vi.restoreAllMocks());

describe('game sync regressions', () => {
	it('waits for a spawn acknowledgement before sending its hit', async () => {
		const { world, sync, mutation, emit } = connection();
		const enemy = makeEnemy('new', 'scout', 1, { x: 1, z: 1 }, 40);
		addEnemy(world, enemy);
		sync.queueSpawn(enemy, false);
		sync.queueHit('shard_launcher', [{ key: enemy.key, multiplier: 1 }]);
		sync.flush(world, true);
		expect(mutation.mock.calls.map(([fn]) => getFunctionName(fn))).not.toContain('games:hitEnemy');
		await Promise.resolve();
		emit('enemies', [{ ...enemy, position: enemy.pos, maxHp: 40 }]);
		sync.flush(world, true);
		expect(mutation.mock.calls.map(([fn]) => getFunctionName(fn))).toContain('games:hitEnemy');
	});

	it('updates the positions used by remote hit detection and host targeting', () => {
		const { world, emit } = connection(testWorld({ hostUserId: 'u2' }));
		const remote = testPlayer(world, { id: 'p2', local: false });
		emit('transforms', [{ playerId: remote.id, position: { x: 12, z: 8 }, facing: 1 }]);
		const enemy = {
			key: 'e1',
			type: 'mobile_tank',
			wave: 1,
			hp: 220,
			maxHp: 220,
			facing: 0,
			state: 'chase'
		};
		emit('enemies', [{ ...enemy, position: { x: 3, z: 4 } }]);
		emit('enemies', [{ ...enemy, position: { x: 14, z: 15 } }]);
		expect(remote.pos).toEqual({ x: 12, z: 8 });
		expect(world.enemies.get('e1')?.pos).toEqual({ x: 14, z: 15 });
	});

	it('restores authoritative health even when the server value is unchanged', () => {
		const { world, emit, state } = connection();
		const p = world.players.get('p1')!;
		p.hp = 0;
		p.state = 'downed';
		emit('state', state);
		expect(p.hp).toBe(50);
		expect(p.state).toBe('alive');
	});

	it('does not falsely down a player protected by Balance', () => {
		const world = testWorld();
		const p = testPlayer(world);
		p.hp = 50;
		world.effects = [
			{
				kind: 'balance',
				sourcePlayerId: p.id,
				magnitude: 0.5,
				startsAt: 0,
				endsAt: world.now + 1000
			}
		];
		world.events.push({ type: 'playerHit', playerId: p.id, amount: 100, enemyKey: 'tank' });
		applyEvents(world, fakeSync(), true);
		expect(p.hp).toBe(50);
		expect(p.state).toBe('alive');
	});

	it('retains edge input until a simulation step runs at 120 FPS', () => {
		const world = testWorld({ hostUserId: 'u2' });
		testPlayer(world);
		const sync = fakeSync();
		let frames = 0;
		const loop = createGameLoop({
			world,
			sync,
			rng: rng(),
			input: () => ({ ...EMPTY_INPUT, ability: frames++ === 0 }),
			now: () => world.now
		});
		loop.tick(STEP / 2);
		loop.tick(STEP / 2);
		loop.tick(STEP);
		expect(sync.abilities).toBe(1);
	});

	it('resumes only the unspawned part of a wave after reload', () => {
		const { world, emit, state } = connection();
		emit('state', {
			...state,
			game: { ...state.game, spawnedKeys: ['7-w1-0', '7-w1-1', '7-w1-2', '7-w1-3'] }
		});
		stepHost(world, STEP, rng());
		for (let i = 0; i < 180; i++) stepHost(world, STEP, rng());
		const spawned = world.events.filter((e) => e.type === 'spawnEnemy');
		expect(spawned).toHaveLength(2);
		expect(spawned.map((e) => e.enemy.key)).toEqual(['7-w1-4', '7-w1-5']);
	});

	it('receives enemy projectiles on a guest without reporting their damage twice', () => {
		const { world, emit, listeners } = connection(testWorld({ hostUserId: 'u2' }));
		expect(listeners.has('games:projectiles')).toBe(true);
		emit('projectiles', {
			updatedAt: Date.now(),
			projectiles: [
				{
					key: 'shot1',
					ownerKey: 'drone',
					position: { x: 0, z: 0 },
					velocity: { x: 1, z: 0 },
					ttl: 2,
					damage: 8,
					radius: 0.25
				}
			]
		});
		expect(world.projectiles).toHaveLength(1);
		stepProjectiles(world, STEP);
		expect(world.events.filter((e) => e.type === 'playerHit')).toHaveLength(0);
	});

	it('takes over existing enemies and bullets without restarting completed spawns', () => {
		const { world, emit, state } = connection(testWorld({ hostUserId: 'u2' }));
		emit('enemies', [
			{
				key: '7-w1-0',
				type: 'mobile_tank',
				wave: 1,
				hp: 25,
				maxHp: 220,
				facing: 0,
				state: 'chase',
				position: { x: 20, z: 20 }
			}
		]);
		emit('projectiles', {
			updatedAt: Date.now(),
			projectiles: [
				{
					key: 'shot1',
					ownerKey: 'drone',
					position: { x: 15, z: 0 },
					velocity: { x: 1, z: 0 },
					ttl: 2,
					damage: 8,
					radius: 0.25
				}
			]
		});
		emit('state', {
			...state,
			game: {
				...state.game,
				hostUserId: 'u1',
				spawnedKeys: Array.from({ length: 6 }, (_, i) => `7-w1-${i}`)
			}
		});
		stepHost(world, STEP, rng());
		expect(world.events.filter((e) => e.type === 'spawnEnemy')).toHaveLength(0);
		expect(world.enemies.get('7-w1-0')?.hp).toBe(25);
		expect(world.enemies.get('7-w1-0')?.interp).toBeNull();
		expect(world.projectiles[0].networkKey).toBe('shot1');
	});

	it('restores an enemy whose predicted death was not confirmed', () => {
		const { world, emit } = connection();
		const enemy = makeEnemy('e1', 'scout', 1, { x: 0, z: 0 }, 0, { dying: true });
		addEnemy(world, enemy);
		emit('enemies', [{ ...enemy, hp: 40, maxHp: 40, position: enemy.pos }]);
		expect(enemy.hp).toBe(40);
		expect(enemy.dying).toBe(false);
	});

	it('does not resurrect expired bullets when taking over a stale host', () => {
		vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
		const { world, emit, state } = connection(testWorld({ hostUserId: 'u2' }));
		emit('projectiles', {
			updatedAt: 980_000,
			projectiles: [
				{
					key: 'expired',
					ownerKey: 'drone',
					position: { x: 0, z: 0 },
					velocity: { x: 1, z: 0 },
					ttl: 2,
					damage: 8,
					radius: 0.25
				}
			]
		});
		emit('state', { ...state, game: { ...state.game, hostUserId: 'u1' } });
		expect(world.projectiles).toHaveLength(0);
	});

	it('sends an empty projectile snapshot after the last bullet expires', async () => {
		const { world, sync, mutation } = connection();
		world.projectiles.push({
			id: 1,
			networkKey: 'shot1',
			owner: 'enemy',
			ownerKey: 'drone',
			pos: { x: 8, z: 0 },
			vel: { x: 1, z: 0 },
			ttl: 1,
			damage: 8,
			radius: 0.25
		});
		const clock = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
		sync.flush(world, true);
		await new Promise((resolve) => setTimeout(resolve, 0));
		world.projectiles = [];
		clock.mockReturnValue(1_000_200);
		sync.flush(world, true);
		const writes = mutation.mock.calls.filter(
			([fn]) => getFunctionName(fn) === 'games:syncEnemies'
		);
		expect(writes).toHaveLength(2);
		expect(writes[0][1]).toMatchObject({ projectiles: [{ key: 'shot1' }] });
		expect(writes[1][1]).toMatchObject({ projectiles: [] });
	});
});
