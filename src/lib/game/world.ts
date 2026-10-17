// The local, non-reactive game world. Plain objects and Maps: never wrap this in $state.
import type { Vec2 } from './vec.js';
import type { EnemyType } from './data/enemies.js';
import type { Hotbar, HotbarSlot, PickupKind, WeaponKey } from './data/items.js';
import type { BaseStats, TimedEffect } from './data/stats.js';
import type { ConstellationId, OriginId, RaceId } from './traits.js';
import { SnapshotBuffer } from './interp.js';

export type GameStatus = 'active' | 'victory' | 'defeat';
export type WaveState = 'intermission' | 'in_progress';
export type PlayerState = 'alive' | 'downed';

export type GameInfo = {
	hostUserId: string;
	status: GameStatus;
	wave: number;
	waveState: WaveState;
	waveEnemiesRemaining: number;
	nextWaveAt: number | null;
	bossSpawned: boolean;
	seed: number;
	/** ms epoch of the host's last write; non-hosts claim when stale */
	hostSeenAt: number;
	/** Spawn receipts survive enemy deletion, refresh, and host migration. */
	spawnedKeys?: string[];
};

export type WeaponState = {
	slot: HotbarSlot;
	ammo: number;
	/** seconds left on the current reload; 0 when not reloading */
	reloadT: number;
	/** seconds until the main weapon can fire again */
	cooldownT: number;
	/** seconds until the melee weapon can swing again (separate, so melee is never eaten by gun cooldown) */
	meleeCooldownT: number;
	/** seconds a melee press stays queued while melee is cooling down */
	meleeBufferT: number;
	/** ms epoch, from the server row */
	overclockUntil: number;
	/** ms epoch, from the server row */
	abilityReadyAt: number;
	/** local counter, drives muzzle flashes */
	shots: number;
};

export type Player = {
	id: string;
	userId: string;
	name: string;
	race: RaceId;
	origin: OriginId;
	constellation: ConstellationId;
	hotbar: Hotbar;
	local: boolean;
	pos: Vec2;
	facing: number;
	vel: Vec2;
	hp: number;
	maxHp: number;
	shieldCharges: number;
	state: PlayerState;
	/** the teammate currently reviving this player, from the server row */
	revivedBy: string | null;
	/** local ms epoch when this client saw revivedBy change; server times run on another clock */
	reviveSeenAt: number;
	stats: BaseStats;
	weapon: WeaponState;
	interp: SnapshotBuffer | null;
};

export type Enemy = {
	key: string;
	type: EnemyType;
	wave: number;
	pos: Vec2;
	facing: number;
	/** knockback impulse, decays each step */
	vel: Vec2;
	hp: number;
	maxHp: number;
	/** per-type FSM label: 'chase' | 'disguised' | 'revealed' | 'kite' | ... */
	state: string;
	stateT: number;
	targetPlayerId: string | null;
	/** seconds until next attack */
	cooldown: number;
	stunUntil: number;
	slowUntil: number;
	slowValue: number;
	knockbackAt: number;
	hovering: boolean;
	disguisedAs: string | null;
	bossPhase: number;
	/** overlord: seconds until the next add spawn */
	addT: number;
	/** host: seen in a subscription result at least once (insert acknowledged) */
	confirmed: boolean;
	/** predicted dead; stop rendering and colliding */
	dying: boolean;
	interp: SnapshotBuffer | null;
};

export type Projectile = {
	id: number;
	networkKey?: string;
	owner: 'player' | 'enemy';
	ownerKey: string;
	pos: Vec2;
	vel: Vec2;
	/** seconds of life left */
	ttl: number;
	damage: number;
	radius: number;
	weaponKey?: WeaponKey;
};

export type Pickup = {
	key: string;
	kind: PickupKind;
	pos: Vec2;
	despawnAt: number;
	confirmed: boolean;
};

/** The local player's revive, predicted ahead of the server row. */
export type LocalRevive = {
	targetId: string;
	/** ms epoch */
	startedAt: number;
	durationMs: number;
	/** ms epoch of the last finish request, for retries */
	finishSentAt: number;
};

export type SpawnEntry = { at: number; type: EnemyType; pos: Vec2; extra: boolean; key?: string };

export type Hit = { key: string; multiplier: number };

export type SimEvent =
	| { type: 'enemyHit'; weaponKey: WeaponKey; hits: Hit[] }
	| { type: 'playerHit'; playerId: string; amount: number; enemyKey: string }
	| { type: 'spawnEnemy'; enemy: Enemy; extra: boolean }
	| { type: 'pickupTouched'; key: string }
	| { type: 'startWave'; wave: number }
	| { type: 'waveCleared'; wave: number }
	| { type: 'useAbility' }
	| { type: 'revive'; action: ReviveAction; targetId: string };

export type ReviveAction = 'start' | 'cancel' | 'finish';

export type Fx =
	| { type: 'tracer'; from: Vec2; to: Vec2 }
	| { type: 'muzzle'; playerId: string }
	| { type: 'hit'; pos: Vec2 }
	| { type: 'swing'; playerId: string }
	| { type: 'death'; pos: Vec2; enemyType: EnemyType };

export type World = {
	gameId: string;
	localUserId: string;
	localPlayerId: string | null;
	/** sim seconds since the loop started */
	time: number;
	/** ms epoch, refreshed once per frame */
	now: number;
	game: GameInfo;
	players: Map<string, Player>;
	enemies: Map<string, Enemy>;
	pickups: Map<string, Pickup>;
	projectiles: Projectile[];
	effects: TimedEffect[];
	revive: LocalRevive | null;
	wave: {
		/** highest wave this host has asked the server to start */
		requested: number;
		/** sim time of the last startWave / waveCleared request, for retries */
		requestedAt: number;
		/** sim seconds the arena has been empty with nothing left to spawn */
		emptyFor: number;
		/** wave number the spawn queue was planned for */
		planned: number;
		spawnQueue: SpawnEntry[];
		/** sim seconds since the planned wave started */
		elapsed: number;
		/** seconds until the next boss add batch */
		addT: number;
	};
	events: SimEvent[];
	fx: Fx[];
	membershipVersion: number;
	nextProjectileId: number;
	nextKey: number;
	spawnEpoch: string;
};

export function createWorld(opts: { gameId: string; localUserId: string; game: GameInfo }): World {
	return {
		gameId: opts.gameId,
		localUserId: opts.localUserId,
		localPlayerId: null,
		time: 0,
		now: Date.now(),
		game: opts.game,
		players: new Map(),
		enemies: new Map(),
		pickups: new Map(),
		projectiles: [],
		effects: [],
		revive: null,
		wave: {
			requested: 0,
			requestedAt: -Infinity,
			planned: 0,
			spawnQueue: [],
			elapsed: 0,
			addT: 0,
			emptyFor: 0
		},
		events: [],
		fx: [],
		membershipVersion: 0,
		nextProjectileId: 1,
		nextKey: 1,
		spawnEpoch: crypto.randomUUID()
	};
}

export function localPlayer(world: World): Player | null {
	return world.localPlayerId ? (world.players.get(world.localPlayerId) ?? null) : null;
}

export function isHost(world: World): boolean {
	return world.game.hostUserId === world.localUserId;
}

export function addPlayer(world: World, p: Player) {
	world.players.set(p.id, p);
	if (p.local) world.localPlayerId = p.id;
	world.membershipVersion++;
}

export function removePlayer(world: World, id: string) {
	if (world.players.delete(id)) world.membershipVersion++;
}

export function addEnemy(world: World, e: Enemy) {
	world.enemies.set(e.key, e);
	world.membershipVersion++;
}

export function removeEnemy(world: World, key: string) {
	if (world.enemies.delete(key)) world.membershipVersion++;
}

export function addPickup(world: World, p: Pickup) {
	world.pickups.set(p.key, p);
	world.membershipVersion++;
}

export function removePickup(world: World, key: string) {
	if (world.pickups.delete(key)) world.membershipVersion++;
}

/** Enemies that can still be hit, targeted, or rendered. */
export function liveEnemies(world: World): Enemy[] {
	const out: Enemy[] = [];
	for (const e of world.enemies.values()) if (!e.dying) out.push(e);
	return out;
}

export function alivePlayers(world: World): Player[] {
	const out: Player[] = [];
	for (const p of world.players.values()) if (p.state === 'alive') out.push(p);
	return out;
}

export function makeEnemy(
	key: string,
	type: EnemyType,
	wave: number,
	pos: Vec2,
	hp: number,
	opts: Partial<Enemy> = {}
): Enemy {
	return {
		key,
		type,
		wave,
		pos,
		facing: 0,
		vel: { x: 0, z: 0 },
		hp,
		maxHp: hp,
		state: 'chase',
		stateT: 0,
		targetPlayerId: null,
		cooldown: 0,
		stunUntil: 0,
		slowUntil: 0,
		slowValue: 0,
		knockbackAt: 0,
		hovering: false,
		disguisedAs: null,
		bossPhase: 1,
		addT: 0,
		confirmed: false,
		dying: false,
		interp: null,
		...opts
	};
}
