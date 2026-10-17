import { describe, expect, it } from 'vitest';
import * as lobbies from '../../convex/lobbies';
import * as characters from '../../convex/characters';
import { endGame } from '../../convex/lib';
import type { Doc } from '../../convex/_generated/dataModel';
import { memoryDb, run } from './convexFake';

const survivor = { race: 'human', origin: 'plains', constellation: 'libra' };

/** Three users with survivors; u1 creates the lobby and so leads it. */
async function party() {
	const db = memoryDb();
	for (const id of ['u1', 'u2', 'u3', 'u4'])
		db.insert('characters', { userId: id, name: `Name ${id}`, ...survivor }, `c-${id}`);
	const lobbyId = (await run(lobbies.create, db.as('u1'), {})) as string;
	const lobby = () => db.rows.get(lobbyId)!;
	const members = () => db.tables.get('lobbyMembers')!.filter((m) => m.lobbyId === lobbyId);
	const member = (userId: string) => members().find((m) => m.userId === userId);
	return { db, lobbyId, lobby, members, member };
}

describe('lobbies', () => {
	it('makes the creator a ready leader and gates Start on everyone being ready', async () => {
		const { db, lobbyId, lobby, member } = await party();
		expect(lobby()).toMatchObject({ hostUserId: 'u1', status: 'open', name: "Name u1's party" });
		expect(member('u1')?.ready).toBe(true);

		await run(lobbies.join, db.as('u2'), { lobbyId });
		expect(member('u2')?.ready).toBe(false);
		await expect(run(lobbies.start, db.as('u2'), { lobbyId })).rejects.toThrow(/leader/);
		await expect(run(lobbies.start, db.as('u1'), { lobbyId })).rejects.toThrow(/ready/);

		await run(lobbies.setReady, db.as('u2'), { lobbyId, ready: true });
		const gameId = await run(lobbies.start, db.as('u1'), { lobbyId });
		expect(lobby()).toMatchObject({ status: 'in_game', gameId });
		expect(db.tables.get('gamePlayers')).toHaveLength(2);
	});

	it('lets a solo leader start immediately', async () => {
		const { db, lobbyId, lobby } = await party();
		await run(lobbies.start, db.as('u1'), { lobbyId });
		expect(lobby().status).toBe('in_game');
	});

	it('lists only open lobbies with room', async () => {
		const { db, lobbyId } = await party();
		const list = () => run(lobbies.listOpen, db.as('u4'), {}) as Promise<{ _id: string }[]>;
		expect((await list()).map((l) => l._id)).toEqual([lobbyId]);
		await run(lobbies.join, db.as('u2'), { lobbyId });
		await run(lobbies.join, db.as('u3'), { lobbyId });
		expect(await list()).toEqual([]);
		await expect(run(lobbies.join, db.as('u4'), { lobbyId })).rejects.toThrow(/full/);
	});

	it('only the leader can kick, and a kicked player can rejoin', async () => {
		const { db, lobbyId, member } = await party();
		await run(lobbies.join, db.as('u2'), { lobbyId });
		await run(lobbies.join, db.as('u3'), { lobbyId });
		await expect(run(lobbies.kick, db.as('u2'), { lobbyId, userId: 'u3' })).rejects.toThrow(
			/leader/
		);
		await expect(run(lobbies.kick, db.as('u1'), { lobbyId, userId: 'u1' })).rejects.toThrow();

		await run(lobbies.kick, db.as('u1'), { lobbyId, userId: 'u3' });
		expect(member('u3')).toBeUndefined();
		await run(lobbies.join, db.as('u3'), { lobbyId });
		expect(member('u3')).toBeDefined();
	});

	it('only the leader can rename, and names are validated', async () => {
		const { db, lobbyId, lobby } = await party();
		await run(lobbies.join, db.as('u2'), { lobbyId });
		await expect(run(lobbies.rename, db.as('u2'), { lobbyId, name: 'Mine now' })).rejects.toThrow(
			/leader/
		);
		await expect(run(lobbies.rename, db.as('u1'), { lobbyId, name: '   ' })).rejects.toThrow();
		await expect(
			run(lobbies.rename, db.as('u1'), { lobbyId, name: 'x'.repeat(33) })
		).rejects.toThrow();
		await run(lobbies.rename, db.as('u1'), { lobbyId, name: '  Night shift ' });
		expect(lobby().name).toBe('Night shift');
	});

	it('promotes the longest-standing member when the leader leaves, and closes when empty', async () => {
		const { db, lobbyId, lobby, member } = await party();
		await run(lobbies.join, db.as('u2'), { lobbyId });
		await run(lobbies.join, db.as('u3'), { lobbyId });
		await run(lobbies.leave, db.as('u1'), { lobbyId });
		expect(lobby()).toMatchObject({ hostUserId: 'u2', status: 'open' });
		expect(member('u2')?.ready).toBe(true);

		await run(lobbies.leave, db.as('u3'), { lobbyId });
		await run(lobbies.leave, db.as('u2'), { lobbyId });
		expect(lobby().status).toBe('closed');
	});

	it('creating a new lobby hands off leadership of the old one', async () => {
		const { db, lobbyId, lobby } = await party();
		await run(lobbies.join, db.as('u2'), { lobbyId });
		await run(lobbies.create, db.as('u1'), { name: 'Another' });
		expect(lobby()).toMatchObject({ hostUserId: 'u2', status: 'open' });
	});

	it('reopens the lobby with the same party when the run ends', async () => {
		const { db, lobbyId, lobby, member } = await party();
		await run(lobbies.join, db.as('u2'), { lobbyId });
		await run(lobbies.setReady, db.as('u2'), { lobbyId, ready: true });
		const gameId = (await run(lobbies.start, db.as('u1'), { lobbyId })) as string;

		await endGame(db.ctx, db.rows.get(gameId) as unknown as Doc<'games'>, { status: 'defeat' });
		expect(db.rows.get(gameId)?.status).toBe('defeat');
		expect(lobby().status).toBe('open');
		expect(lobby().gameId).toBeUndefined();
		expect(member('u1')?.ready).toBe(true);
		expect(member('u2')?.ready).toBe(false);
		expect(await run(lobbies.mine, db.as('u2'), {})).toMatchObject({ _id: lobbyId });
	});

	it('locks the survivor while the player sits in a lobby', async () => {
		const { db, lobbyId } = await party();
		const save = () => run(characters.save, db.as('u1'), { name: 'Renamed', ...survivor });
		await expect(save()).rejects.toThrow(/lobby/);
		await run(lobbies.leave, db.as('u1'), { lobbyId });
		await save();
		expect(db.rows.get('c-u1')?.name).toBe('Renamed');
	});
});
