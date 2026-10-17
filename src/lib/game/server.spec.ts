import { afterEach, describe, expect, it, vi } from 'vitest';
import * as games from '../../convex/games';
import { computeStats } from './data/stats';
import { memoryDb, run } from './convexFake';

function database() {
	const { rows, tables, insert, ctx } = memoryDb();
	const game = insert(
		'games',
		{
			hostUserId: 'u1',
			status: 'active',
			wave: 1,
			waveState: 'in_progress',
			seed: 7,
			waveEnemiesRemaining: 6,
			spawnedKeys: [],
			lastTickAt: Date.now() - 4000
		},
		'g1'
	);
	const player = insert(
		'gamePlayers',
		{
			gameId: 'g1',
			userId: 'u1',
			state: 'alive',
			race: 'agarthan',
			hp: 50,
			maxHp: 100,
			stats: computeStats('agarthan', 'plains'),
			hitCounters: { main: 0, melee: 0 },
			kills: 0,
			points: 0,
			shieldCharges: 0
		},
		'p1'
	);
	return { rows, tables, insert, game, player, ctx };
}

afterEach(() => vi.restoreAllMocks());

describe('authoritative game regressions', () => {
	it('regenerates and expires pickups/effects while the host is idle, without double ticking', async () => {
		vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
		const db = database();
		db.insert('pickups', { gameId: 'g1', despawnAt: 999_999 }, 'pickup');
		db.insert('statusEffects', { gameId: 'g1', endsAt: 999_999 }, 'effect');
		await run(games.hostHeartbeat, db.ctx, { gameId: 'g1' });
		expect(db.player.hp).toBe(52);
		expect(db.rows.has('pickup')).toBe(false);
		expect(db.rows.has('effect')).toBe(false);
		await run(games.syncEnemies, db.ctx, { gameId: 'g1', spawns: [], updates: [] });
		expect(db.player.hp).toBe(52);
	});

	it('keeps spawn receipts after death so a repeated spawn cannot resurrect an enemy', async () => {
		vi.spyOn(Math, 'random').mockReturnValue(0.99);
		const db = database();
		const spawn = {
			key: '7-w1-0',
			type: 'scout',
			wave: 1,
			position: { x: 0, z: 0 },
			facing: 0,
			state: 'chase',
			extra: false
		};
		await run(games.syncEnemies, db.ctx, { gameId: 'g1', spawns: [spawn], updates: [] });
		for (let i = 0; i < 3; i++)
			await run(games.hitEnemy, db.ctx, {
				gameId: 'g1',
				weaponKey: 'arc_caster',
				hits: [{ key: spawn.key, multiplier: 1 }]
			});
		expect(db.tables.get('enemies')).toHaveLength(0);
		await run(games.syncEnemies, db.ctx, { gameId: 'g1', spawns: [spawn], updates: [] });
		expect(db.tables.get('enemies')).toHaveLength(0);
		expect(db.game.waveEnemiesRemaining).toBe(5);
		expect(db.player.kills).toBe(1);
	});

	it('infers spawn progress for an existing run with no receipts', async () => {
		const db = database();
		delete db.game.spawnedKeys;
		db.game.waveEnemiesRemaining = 4; // 2 dead, 2 alive, 2 not spawned
		db.insert('enemies', { gameId: 'g1', key: 'old-3' });
		db.insert('enemies', { gameId: 'g1', key: 'old-4' });
		const result = (await run(games.state, db.ctx, { gameId: 'g1' })) as {
			game: { spawnedKeys: string[] };
		};
		expect(result.game.spawnedKeys).toEqual([
			'7-w1-0',
			'7-w1-1',
			'7-w1-2',
			'7-w1-3',
			'old-3',
			'old-4'
		]);
	});

	it('rejects stale wave spawns and clears projectile snapshots', async () => {
		const db = database();
		const shot = {
			key: 'shot',
			ownerKey: 'drone',
			position: { x: 0, z: 0 },
			velocity: { x: 1, z: 0 },
			ttl: 2,
			damage: 8,
			radius: 0.25
		};
		await run(games.syncEnemies, db.ctx, {
			gameId: 'g1',
			spawns: [
				{
					key: 'old',
					type: 'scout',
					wave: 0,
					position: { x: 0, z: 0 },
					facing: 0,
					state: 'chase',
					extra: true
				}
			],
			updates: [],
			projectiles: [shot]
		});
		expect(db.tables.get('enemies') ?? []).toHaveLength(0);
		expect(db.tables.get('enemyProjectiles')?.[0].projectiles).toEqual([shot]);
		await run(games.syncEnemies, db.ctx, {
			gameId: 'g1',
			spawns: [],
			updates: [],
			projectiles: []
		});
		expect(db.tables.get('enemyProjectiles')?.[0].projectiles).toEqual([]);
	});
});
