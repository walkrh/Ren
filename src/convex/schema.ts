import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

// ─── Shared validators ──────────────────────────────────────────────

export const raceValidator = v.union(
	v.literal('human'),
	v.literal('agarthan'),
	v.literal('forsaken')
);
export const originValidator = v.union(
	v.literal('mountains'),
	v.literal('swamp'),
	v.literal('plains'),
	v.literal('desert')
);
export const constellationValidator = v.union(
	v.literal('capricorn'),
	v.literal('libra'),
	v.literal('aries')
);

export const enemyTypeValidator = v.union(
	v.literal('mobile_tank'),
	v.literal('gun_drone'),
	v.literal('scout'), // hovers: melee cannot reach it
	v.literal('id_stealer'), // disguised as a teammate until it attacks
	v.literal('overlord') // final boss
);

export const pickupKindValidator = v.union(
	v.literal('patch_kit'),
	v.literal('overclock_chip'),
	v.literal('firewall_shard')
);

export const hotbarSlotValidator = v.union(
	v.literal('main'),
	v.literal('melee'),
	v.literal('ability')
);

export const effectKindValidator = v.union(
	v.literal('leadership'), // Capricorn aura, scales with distance to source
	v.literal('balance'), // Libra 50% health floor
	v.literal('impatience'), // Aries speed buff
	v.literal('impatience_fatigue') // Aries slow debuff afterwards
);

// Movement happens on a flat ground plane, so x/z is enough.
export const vec2Validator = v.object({ x: v.number(), z: v.number() });

export const projectileValidator = v.object({
	key: v.string(),
	ownerKey: v.string(),
	position: vec2Validator,
	velocity: vec2Validator,
	ttl: v.number(),
	damage: v.number(),
	radius: v.number()
});

// Snapshot of computeStats() taken when the game starts.
export const statsValidator = v.object({
	maxHp: v.number(),
	moveSpeed: v.number(),
	damageReduction: v.number(),
	aggroRadius: v.number(),
	critChance: v.number(),
	dropMultiplier: v.number(),
	regenPerSecond: v.number(),
	damageMultiplier: v.number(),
	reloadMultiplier: v.number()
});

// ─── Schema ─────────────────────────────────────────────────────────

export default defineSchema({
	// Persistent survivor, one per account, re-rollable between games.
	characters: defineTable({
		// WorkOS user id (JWT subject)
		userId: v.string(),
		name: v.string(),
		race: raceValidator,
		origin: originValidator,
		constellation: constellationValidator
	}).index('by_user', ['userId']),

	// All lobbies are public. Host is the party leader.
	lobbies: defineTable({
		name: v.string(),
		hostUserId: v.string(),
		status: v.union(v.literal('open'), v.literal('in_game'), v.literal('closed')),
		maxPlayers: v.number(),
		gameId: v.optional(v.id('games')),
		createdAt: v.number()
	})
		.index('by_status', ['status'])
		.index('by_host', ['hostUserId']),

	lobbyMembers: defineTable({
		lobbyId: v.id('lobbies'),
		userId: v.string(),
		characterId: v.id('characters'),
		ready: v.boolean(),
		joinedAt: v.number()
	})
		.index('by_lobby', ['lobbyId'])
		.index('by_user', ['userId']),

	// One run. The host client simulates enemies; these rows hold the shared truth.
	games: defineTable({
		lobbyId: v.id('lobbies'),
		hostUserId: v.string(),
		hostSeenAt: v.number(), // stamped by every host write; stale => claimable
		lastTickAt: v.number(), // 1 Hz housekeeping (regen, expiries) runs off this
		seed: v.number(),
		status: v.union(v.literal('active'), v.literal('victory'), v.literal('defeat')),
		wave: v.number(),
		waveState: v.union(v.literal('intermission'), v.literal('in_progress')),
		waveEnemiesRemaining: v.number(), // alive + not yet spawned for this wave
		spawnedKeys: v.optional(v.array(v.string())), // current wave receipts, including dead enemies
		nextWaveAt: v.optional(v.number()),
		bossSpawned: v.boolean(),
		startedAt: v.number(),
		endedAt: v.optional(v.number())
	}).index('by_lobby', ['lobbyId']),

	// A player's state inside one game (everything except fast-changing position).
	gamePlayers: defineTable({
		gameId: v.id('games'),
		userId: v.string(),
		characterId: v.id('characters'),
		name: v.string(),
		race: raceValidator,
		origin: originValidator,
		constellation: constellationValidator,
		stats: statsValidator,

		hp: v.number(),
		maxHp: v.number(),
		state: v.union(v.literal('alive'), v.literal('downed')),
		bleedOutAt: v.optional(v.number()),
		revivedBy: v.optional(v.id('gamePlayers')), // set while a teammate is reviving
		reviveCompletesAt: v.optional(v.number()),

		points: v.number(), // earned from kills; spent on doors later
		kills: v.number(),
		downs: v.number(),
		revives: v.number(),

		activeSlot: hotbarSlotValidator,
		abilityReadyAt: v.number(),
		shieldCharges: v.number(), // firewall shard: hits blocked
		overclockUntil: v.optional(v.number()),
		// Server-side hit counters so "every Nth hit" effects cannot be gamed.
		hitCounters: v.object({ main: v.number(), melee: v.number() })
	})
		.index('by_game', ['gameId'])
		.index('by_game_user', ['gameId', 'userId'])
		.index('by_user', ['userId']),

	// Split out so every position write doesn't re-run HUD/score queries.
	playerTransforms: defineTable({
		gameId: v.id('games'),
		playerId: v.id('gamePlayers'),
		position: vec2Validator,
		facing: v.number(), // radians
		updatedAt: v.number()
	})
		.index('by_game', ['gameId'])
		.index('by_player', ['playerId']),

	// Live enemies only; deleted on death. Keys are generated by the host client.
	// The host owns position/facing/state; hitEnemy owns hp and the status fields.
	enemies: defineTable({
		gameId: v.id('games'),
		key: v.string(),
		type: enemyTypeValidator,
		wave: v.number(),
		hp: v.number(),
		maxHp: v.number(),
		position: vec2Validator,
		facing: v.number(),
		state: v.string(),
		targetPlayerId: v.optional(v.id('gamePlayers')),
		hovering: v.optional(v.boolean()), // scout
		disguisedAs: v.optional(v.id('gamePlayers')), // id_stealer, cleared when it attacks
		bossPhase: v.optional(v.number()), // overlord
		stunUntil: v.optional(v.number()),
		slowUntil: v.optional(v.number()),
		slowValue: v.optional(v.number()),
		knockbackAt: v.optional(v.number()),
		knockbackDir: v.optional(vec2Validator),
		updatedAt: v.number()
	})
		.index('by_game', ['gameId'])
		.index('by_game_key', ['gameId', 'key']),

	// One batched snapshot per game; guests render these, only the host applies damage.
	enemyProjectiles: defineTable({
		gameId: v.id('games'),
		projectiles: v.array(projectileValidator),
		updatedAt: v.number()
	}).index('by_game', ['gameId']),

	// Consumables dropped on kills. Taking one deletes the row atomically.
	pickups: defineTable({
		gameId: v.id('games'),
		key: v.string(),
		kind: pickupKindValidator,
		position: vec2Validator,
		despawnAt: v.number()
	})
		.index('by_game', ['gameId'])
		.index('by_game_key', ['gameId', 'key']),

	// Timed constellation buffs/debuffs. Housekeeping deletes rows after endsAt.
	statusEffects: defineTable({
		gameId: v.id('games'),
		kind: effectKindValidator,
		sourcePlayerId: v.id('gamePlayers'),
		// Empty = aura affecting all allies (Capricorn, Libra); set = single target (Aries).
		targetPlayerId: v.optional(v.id('gamePlayers')),
		magnitude: v.optional(v.number()),
		startsAt: v.number(),
		endsAt: v.number()
	}).index('by_game', ['gameId'])
});
