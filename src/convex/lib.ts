// Shared helpers for game and lobby mutations: who is calling, which game, which player row.
import { ConvexError } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';

export async function requireIdentity(ctx: QueryCtx | MutationCtx) {
	const identity = await ctx.auth.getUserIdentity();
	if (!identity) throw new ConvexError('Sign in first');
	return identity;
}

export async function requireGame(ctx: QueryCtx | MutationCtx, gameId: Id<'games'>) {
	const game = await ctx.db.get(gameId);
	if (!game) throw new ConvexError('Game not found');
	return game;
}

/** The caller's gamePlayers row in this game. */
export async function requirePlayer(ctx: QueryCtx | MutationCtx, gameId: Id<'games'>) {
	const identity = await requireIdentity(ctx);
	const game = await requireGame(ctx, gameId);
	const player = await ctx.db
		.query('gamePlayers')
		.withIndex('by_game_user', (q) => q.eq('gameId', gameId).eq('userId', identity.subject))
		.unique();
	if (!player) throw new ConvexError('You are not in this game');
	return { identity, game, player };
}

export async function requireHost(ctx: QueryCtx | MutationCtx, gameId: Id<'games'>) {
	const r = await requirePlayer(ctx, gameId);
	if (r.game.hostUserId !== r.identity.subject) throw new ConvexError('Only the host can do that');
	return r;
}

export function lobbyMembers(ctx: QueryCtx | MutationCtx, lobbyId: Id<'lobbies'>) {
	return ctx.db
		.query('lobbyMembers')
		.withIndex('by_lobby', (q) => q.eq('lobbyId', lobbyId))
		.collect();
}

/** Finish a run and reopen its lobby with the same party, everyone but the leader unready. */
export async function endGame(
	ctx: MutationCtx,
	game: Doc<'games'>,
	patch: Pick<Doc<'games'>, 'status'> & Partial<Doc<'games'>>
) {
	await ctx.db.patch(game._id, { endedAt: Date.now(), ...patch });
	const lobby = await ctx.db.get(game.lobbyId);
	if (!lobby || lobby.status !== 'in_game' || lobby.gameId !== game._id) return;
	await ctx.db.patch(lobby._id, { status: 'open', gameId: undefined });
	for (const m of await lobbyMembers(ctx, lobby._id))
		await ctx.db.patch(m._id, { ready: m.userId === lobby.hostUserId });
}

export function playersInGame(ctx: QueryCtx | MutationCtx, gameId: Id<'games'>) {
	return ctx.db
		.query('gamePlayers')
		.withIndex('by_game', (q) => q.eq('gameId', gameId))
		.collect();
}

export function enemyByKey(ctx: QueryCtx | MutationCtx, gameId: Id<'games'>, key: string) {
	return ctx.db
		.query('enemies')
		.withIndex('by_game_key', (q) => q.eq('gameId', gameId).eq('key', key))
		.unique();
}

export function transformOf(ctx: QueryCtx | MutationCtx, playerId: Id<'gamePlayers'>) {
	return ctx.db
		.query('playerTransforms')
		.withIndex('by_player', (q) => q.eq('playerId', playerId))
		.unique();
}

export function activeEffects(effects: Doc<'statusEffects'>[], now: number) {
	return effects.filter((e) => e.startsAt <= now && e.endsAt > now);
}

export function finite(n: number, fallback = 0) {
	return Number.isFinite(n) ? n : fallback;
}
