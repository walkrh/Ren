import { ConvexError, v } from 'convex/values';
import { mutation, query } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { lobbyMembers, requireIdentity } from './lib';
import { computeStats } from '../lib/game/data/stats';
import { START_INTERMISSION_MS } from '../lib/game/data/waves';
import { lobbyNameError } from '../lib/game/lobby';

const MAX_PLAYERS = 3;

async function requireCharacter(ctx: MutationCtx, userId: string) {
	const character = await ctx.db
		.query('characters')
		.withIndex('by_user', (q) => q.eq('userId', userId))
		.unique();
	if (!character) throw new ConvexError('Roll a survivor first');
	return character;
}

/** Open lobbies with room left, newest first. */
export const listOpen = query({
	args: {},
	handler: async (ctx) => {
		const lobbies = await ctx.db
			.query('lobbies')
			.withIndex('by_status', (q) => q.eq('status', 'open'))
			.order('desc')
			.take(50);
		const rows = await Promise.all(
			lobbies.map(async (l) => {
				const members = await lobbyMembers(ctx, l._id);
				const host = members.find((m) => m.userId === l.hostUserId);
				const hostCharacter = host ? await ctx.db.get(host.characterId) : null;
				return {
					_id: l._id,
					name: l.name,
					maxPlayers: l.maxPlayers,
					playerCount: members.length,
					hostName: hostCharacter?.name ?? null
				};
			})
		);
		return rows.filter((r) => r.playerCount > 0 && r.playerCount < r.maxPlayers);
	}
});

/** The lobby the signed-in user is sitting in, if any. */
export const mine = query({
	args: {},
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) return null;
		const member = await ctx.db
			.query('lobbyMembers')
			.withIndex('by_user', (q) => q.eq('userId', identity.subject))
			.first();
		if (!member) return null;
		const lobby = await ctx.db.get(member.lobbyId);
		return lobby && lobby.status !== 'closed' ? lobby : null;
	}
});

export const get = query({
	args: { lobbyId: v.id('lobbies') },
	handler: async (ctx, { lobbyId }) => {
		const lobby = await ctx.db.get(lobbyId);
		if (!lobby) return null;
		const members = await lobbyMembers(ctx, lobbyId);
		const withNames = await Promise.all(
			members.map(async (m) => ({ ...m, character: await ctx.db.get(m.characterId) }))
		);
		return { ...lobby, members: withNames };
	}
});

export const create = mutation({
	args: { name: v.optional(v.string()) },
	handler: async (ctx, args) => {
		const identity = await requireIdentity(ctx);
		const character = await requireCharacter(ctx, identity.subject);
		const name = args.name?.trim() ? validName(args.name) : `${character.name}'s party`;
		await leaveAll(ctx, identity.subject);
		const lobbyId = await ctx.db.insert('lobbies', {
			name,
			hostUserId: identity.subject,
			status: 'open',
			maxPlayers: MAX_PLAYERS,
			createdAt: Date.now()
		});
		await ctx.db.insert('lobbyMembers', {
			lobbyId,
			userId: identity.subject,
			characterId: character._id,
			ready: true,
			joinedAt: Date.now()
		});
		return lobbyId;
	}
});

export const join = mutation({
	args: { lobbyId: v.id('lobbies') },
	handler: async (ctx, { lobbyId }) => {
		const identity = await requireIdentity(ctx);
		const character = await requireCharacter(ctx, identity.subject);
		const lobby = await ctx.db.get(lobbyId);
		if (!lobby || lobby.status !== 'open') throw new ConvexError('That lobby is not open');
		const members = await lobbyMembers(ctx, lobbyId);
		if (members.some((m) => m.userId === identity.subject)) return lobbyId;
		if (members.length >= lobby.maxPlayers) throw new ConvexError('That lobby is full');
		await leaveAll(ctx, identity.subject);
		await ctx.db.insert('lobbyMembers', {
			lobbyId,
			userId: identity.subject,
			characterId: character._id,
			ready: false,
			joinedAt: Date.now()
		});
		return lobbyId;
	}
});

export const setReady = mutation({
	args: { lobbyId: v.id('lobbies'), ready: v.boolean() },
	handler: async (ctx, { lobbyId, ready }) => {
		const identity = await requireIdentity(ctx);
		const lobby = await requireOpenLobby(ctx, lobbyId);
		// The leader is always ready; their readiness is pressing Start.
		if (lobby.hostUserId === identity.subject) return;
		const member = await memberOf(ctx, lobbyId, identity.subject);
		await ctx.db.patch(member._id, { ready });
	}
});

export const leave = mutation({
	args: { lobbyId: v.id('lobbies') },
	handler: async (ctx, { lobbyId }) => {
		const identity = await requireIdentity(ctx);
		await removeMember(ctx, await memberOf(ctx, lobbyId, identity.subject));
	}
});

export const rename = mutation({
	args: { lobbyId: v.id('lobbies'), name: v.string() },
	handler: async (ctx, { lobbyId, name }) => {
		const identity = await requireIdentity(ctx);
		const lobby = await requireOpenLobby(ctx, lobbyId);
		requireLeader(lobby, identity.subject);
		await ctx.db.patch(lobbyId, { name: validName(name) });
	}
});

/** Leader removes a member. Kicked players may rejoin. */
export const kick = mutation({
	args: { lobbyId: v.id('lobbies'), userId: v.string() },
	handler: async (ctx, { lobbyId, userId }) => {
		const identity = await requireIdentity(ctx);
		const lobby = await requireOpenLobby(ctx, lobbyId);
		requireLeader(lobby, identity.subject);
		if (userId === identity.subject) throw new ConvexError('Leave instead of kicking yourself');
		await removeMember(ctx, await memberOf(ctx, lobbyId, userId));
	}
});

/** Leader starts the run once everyone is ready. Returns the new game id. */
export const start = mutation({
	args: { lobbyId: v.id('lobbies') },
	handler: async (ctx, { lobbyId }) => {
		const identity = await requireIdentity(ctx);
		return startGame(ctx, lobbyId, identity.subject);
	}
});

function validName(raw: string) {
	const error = lobbyNameError(raw);
	if (error) throw new ConvexError(error);
	return raw.trim();
}

function requireLeader(lobby: Doc<'lobbies'>, userId: string) {
	if (lobby.hostUserId !== userId) throw new ConvexError('Only the leader can do that');
}

async function requireOpenLobby(ctx: QueryCtx | MutationCtx, lobbyId: Id<'lobbies'>) {
	const lobby = await ctx.db.get(lobbyId);
	if (!lobby || lobby.status !== 'open') throw new ConvexError('That lobby is not open');
	return lobby;
}

async function memberOf(ctx: MutationCtx, lobbyId: Id<'lobbies'>, userId: string) {
	const memberships = await ctx.db
		.query('lobbyMembers')
		.withIndex('by_user', (q) => q.eq('userId', userId))
		.collect();
	const member = memberships.find((m) => m.lobbyId === lobbyId);
	if (!member) throw new ConvexError('Not a member of that lobby');
	return member;
}

/** Drop a membership. Leadership passes to the longest-standing member; an empty lobby closes. */
async function removeMember(ctx: MutationCtx, member: Doc<'lobbyMembers'>) {
	await ctx.db.delete(member._id);
	const lobby = await ctx.db.get(member.lobbyId);
	if (!lobby || lobby.status === 'closed') return;
	const rest = await lobbyMembers(ctx, lobby._id);
	if (rest.length === 0) {
		await ctx.db.patch(lobby._id, { status: 'closed' });
	} else if (lobby.hostUserId === member.userId) {
		const next = rest.reduce((a, b) => (b.joinedAt < a.joinedAt ? b : a));
		await ctx.db.patch(lobby._id, { hostUserId: next.userId });
		await ctx.db.patch(next._id, { ready: true });
	}
}

/** A user is in at most one lobby; drop stale memberships before creating/joining. */
async function leaveAll(ctx: MutationCtx, userId: string) {
	const stale = await ctx.db
		.query('lobbyMembers')
		.withIndex('by_user', (q) => q.eq('userId', userId))
		.collect();
	for (const m of stale) await removeMember(ctx, m);
}

async function startGame(ctx: MutationCtx, lobbyId: Id<'lobbies'>, callerId: string) {
	const lobby = await requireOpenLobby(ctx, lobbyId);
	if (lobby.hostUserId !== callerId) throw new ConvexError('Only the leader can start');
	const members = await lobbyMembers(ctx, lobbyId);
	if (members.length === 0) throw new ConvexError('Nobody in the lobby');
	if (!members.every((m) => m.ready)) throw new ConvexError('Everyone must be ready');

	const now = Date.now();
	const gameId = await ctx.db.insert('games', {
		lobbyId,
		hostUserId: lobby.hostUserId,
		hostSeenAt: now,
		lastTickAt: now,
		seed: Math.floor(Math.random() * 2 ** 31),
		status: 'active',
		wave: 0,
		waveState: 'intermission',
		waveEnemiesRemaining: 0,
		nextWaveAt: now + START_INTERMISSION_MS,
		bossSpawned: false,
		startedAt: now
	});

	for (let i = 0; i < members.length; i++) {
		const m = members[i];
		const character = await ctx.db.get(m.characterId);
		if (!character) throw new ConvexError('A member has no survivor');
		const stats = computeStats(character.race, character.origin);
		const playerId = await ctx.db.insert('gamePlayers', {
			gameId,
			userId: m.userId,
			characterId: character._id,
			name: character.name,
			race: character.race,
			origin: character.origin,
			constellation: character.constellation,
			stats,
			hp: stats.maxHp,
			maxHp: stats.maxHp,
			state: 'alive',
			points: 0,
			kills: 0,
			downs: 0,
			revives: 0,
			activeSlot: 'main',
			abilityReadyAt: 0,
			shieldCharges: 0,
			hitCounters: { main: 0, melee: 0 }
		});
		// Spread the party around the centre.
		const theta = (i / members.length) * Math.PI * 2;
		await ctx.db.insert('playerTransforms', {
			gameId,
			playerId,
			position: { x: Math.cos(theta) * 2, z: Math.sin(theta) * 2 },
			facing: 0,
			updatedAt: now
		});
	}

	await ctx.db.patch(lobbyId, { status: 'in_game', gameId });
	return gameId;
}
