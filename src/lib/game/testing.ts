// Builders for sim tests. Not shipped to the client bundle (only specs import it).
import { createRng } from './rng.js';
import { computeStats } from './data/stats.js';
import { loadoutFor, weapons, type RangedWeapon } from './data/items.js';
import { SnapshotBuffer } from './interp.js';
import type { SyncPort } from './loop.js';
import type { ConstellationId, OriginId, RaceId } from './traits.js';
import type { Vec2 } from './vec.js';
import {
	addPlayer,
	createWorld,
	type Enemy,
	type GameInfo,
	type Hit,
	type Player,
	type World
} from './world.js';
import type { WeaponKey } from './data/items.js';

export function testGame(over: Partial<GameInfo> = {}): GameInfo {
	return {
		hostUserId: 'u1',
		status: 'active',
		wave: 1,
		waveState: 'in_progress',
		waveEnemiesRemaining: 0,
		nextWaveAt: null,
		bossSpawned: false,
		seed: 7,
		hostSeenAt: 1_000_000,
		...over
	};
}

export function testWorld(over: Partial<GameInfo> = {}): World {
	const w = createWorld({ gameId: 'g1', localUserId: 'u1', game: testGame(over) });
	w.now = 1_000_000;
	return w;
}

export function testPlayer(
	world: World,
	opts: {
		id?: string;
		userId?: string;
		race?: RaceId;
		origin?: OriginId;
		constellation?: ConstellationId;
		pos?: Vec2;
		local?: boolean;
	} = {}
): Player {
	const race = opts.race ?? 'human';
	const origin = opts.origin ?? 'plains';
	const constellation = opts.constellation ?? 'aries';
	const stats = computeStats(race, origin);
	const hotbar = loadoutFor(race, constellation);
	const main = weapons[hotbar.main] as RangedWeapon;
	const local = opts.local ?? true;
	const p: Player = {
		id: opts.id ?? 'p1',
		userId: opts.userId ?? (local ? world.localUserId : 'u2'),
		name: 'Tester',
		race,
		origin,
		constellation,
		hotbar,
		local,
		pos: opts.pos ?? { x: 0, z: 0 },
		facing: 0,
		vel: { x: 0, z: 0 },
		hp: stats.maxHp,
		maxHp: stats.maxHp,
		shieldCharges: 0,
		state: 'alive',
		stats,
		weapon: {
			slot: 'main',
			ammo: main.clipSize,
			reloadT: 0,
			cooldownT: 0,
			meleeCooldownT: 0,
			meleeBufferT: 0,
			overclockUntil: 0,
			abilityReadyAt: 0,
			shots: 0
		},
		interp: local ? null : new SnapshotBuffer(150)
	};
	addPlayer(world, p);
	return p;
}

export type FakeSync = SyncPort & {
	hits: { weaponKey: WeaponKey; hits: Hit[] }[];
	damage: { playerId: string; amount: number; enemyKey: string }[];
	spawns: { enemy: Enemy; extra: boolean }[];
	pickups: string[];
	waves: number[];
	cleared: number[];
	abilities: number;
	flushes: number;
};

export function fakeSync(): FakeSync {
	const s: FakeSync = {
		hits: [],
		damage: [],
		spawns: [],
		pickups: [],
		waves: [],
		cleared: [],
		abilities: 0,
		flushes: 0,
		queueHit: (weaponKey, hits) => void s.hits.push({ weaponKey, hits }),
		queueDamage: (playerId, amount, enemyKey) => void s.damage.push({ playerId, amount, enemyKey }),
		queueSpawn: (enemy, extra) => void s.spawns.push({ enemy, extra }),
		queuePickup: (key) => void s.pickups.push(key),
		startWave: (wave) => void s.waves.push(wave),
		waveCleared: (wave) => void s.cleared.push(wave),
		useAbility: () => void s.abilities++,
		flush: () => void s.flushes++
	};
	return s;
}

export const rng = () => createRng(42);
