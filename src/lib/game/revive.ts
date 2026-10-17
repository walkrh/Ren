// Co-op revives. Hold interact next to a downed teammate; the server owns the outcome.
// The reviver predicts its own progress; everyone else times it from when the row changed.
import { resolveModifiers } from './data/stats.js';
import { REVIVE_MS, REVIVE_RANGE, REVIVE_STALE_MS } from './data/waves.js';
import { dist } from './vec.js';
import { localPlayer, type Player, type World } from './world.js';

/** Wait between finish requests while the server has not yet agreed the revive is done. */
const FINISH_RETRY_MS = 250;

/** Aries' Impatience speeds revives up and its fatigue slows them down, like reloads. */
export function reviveDurationMs(world: World, reviverId: string): number {
	return REVIVE_MS * resolveModifiers(reviverId, world.effects, world.now).reload;
}

/** Someone else holds this revive, and they still look like they are doing it. */
function heldByOther(world: World, target: Player, me: Player): boolean {
	if (!target.revivedBy || target.revivedBy === me.id) return false;
	const reviver = world.players.get(target.revivedBy);
	if (!reviver || reviver.state !== 'alive') return false;
	return world.now - target.reviveSeenAt < REVIVE_MS * 2 + REVIVE_STALE_MS;
}

/** The downed teammate `me` would revive right now: the current one if still valid, else the nearest. */
export function reviveTarget(world: World, me: Player): Player | null {
	if (me.state !== 'alive') return null;
	const valid = (p: Player | undefined): p is Player =>
		!!p &&
		p.id !== me.id &&
		p.state === 'downed' &&
		dist(p.pos, me.pos) <= REVIVE_RANGE &&
		!heldByOther(world, p, me);
	const current = world.revive ? world.players.get(world.revive.targetId) : undefined;
	if (valid(current)) return current;
	let best: Player | null = null;
	for (const p of world.players.values()) {
		if (valid(p) && (!best || dist(p.pos, me.pos) < dist(best.pos, me.pos))) best = p;
	}
	return best;
}

/** Start, keep, finish, or drop the local player's revive from the held interact key. */
export function stepRevive(world: World, interact: boolean) {
	const me = localPlayer(world);
	const target = me && interact && world.game.status === 'active' ? reviveTarget(world, me) : null;
	const r = world.revive;
	if (r && r.targetId !== target?.id) {
		world.revive = null;
		// A finished revive has already cleared itself on the server.
		if (world.players.get(r.targetId)?.state === 'downed')
			world.events.push({ type: 'revive', action: 'cancel', targetId: r.targetId });
	}
	if (!me || !target) return;
	if (!world.revive) {
		begin(world, me, target);
		return;
	}
	const cur = world.revive;
	if (world.now - cur.startedAt < cur.durationMs) return;
	if (target.revivedBy !== me.id) {
		// The server never took our start (we were a step too far, or someone beat us): go again.
		begin(world, me, target);
		return;
	}
	if (world.now - cur.finishSentAt < FINISH_RETRY_MS) return;
	cur.finishSentAt = world.now;
	world.events.push({ type: 'revive', action: 'finish', targetId: target.id });
}

function begin(world: World, me: Player, target: Player) {
	world.revive = {
		targetId: target.id,
		startedAt: world.now,
		durationMs: reviveDurationMs(world, me.id),
		finishSentAt: -Infinity
	};
	world.events.push({ type: 'revive', action: 'start', targetId: target.id });
}

/** Who is reviving `target` and how far along, as this client should draw it. */
export function reviveProgress(
	world: World,
	target: Player
): { reviverId: string; progress: number } | null {
	if (target.state !== 'downed') return null;
	const me = localPlayer(world);
	const r = world.revive;
	if (me && r?.targetId === target.id) {
		return { reviverId: me.id, progress: Math.min(1, (world.now - r.startedAt) / r.durationMs) };
	}
	if (!target.revivedBy) return null;
	const elapsed = world.now - target.reviveSeenAt;
	return {
		reviverId: target.revivedBy,
		progress: Math.min(1, elapsed / reviveDurationMs(world, target.revivedBy))
	};
}

/** The downed player this one is reviving, if any. */
export function revivingWhom(world: World, reviverId: string): Player | null {
	for (const p of world.players.values()) {
		if (p.state === 'downed' && reviveProgress(world, p)?.reviverId === reviverId) return p;
	}
	return null;
}
