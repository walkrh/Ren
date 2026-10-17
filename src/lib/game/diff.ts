// Only send what moved. lastSent is updated by the caller once the mutation resolves,
// so a dropped call is naturally re-sent on the next flush.
import { angleDiff, dist } from './vec.js';
import type { Enemy, Player, World } from './world.js';

export type EnemySent = {
	x: number;
	z: number;
	facing: number;
	state: string;
	target: string | null;
	hovering: boolean;
	disguisedAs: string | null;
	bossPhase: number;
};

export type SelfSent = { x: number; z: number; facing: number };

const MOVE_EPS = 0.05;
const TURN_EPS = 0.05;

export function enemySnapshot(e: Enemy): EnemySent {
	return {
		x: e.pos.x,
		z: e.pos.z,
		facing: e.facing,
		state: e.state,
		target: e.targetPlayerId,
		hovering: e.hovering,
		disguisedAs: e.disguisedAs,
		bossPhase: e.bossPhase
	};
}

export function enemyChanged(e: Enemy, last: EnemySent | undefined): boolean {
	if (!last) return true;
	if (dist(e.pos, { x: last.x, z: last.z }) > MOVE_EPS) return true;
	if (Math.abs(angleDiff(last.facing, e.facing)) > TURN_EPS) return true;
	return (
		e.state !== last.state ||
		e.targetPlayerId !== last.target ||
		e.hovering !== last.hovering ||
		e.disguisedAs !== last.disguisedAs ||
		e.bossPhase !== last.bossPhase
	);
}

/** Confirmed enemies whose transform or state differs from what was last acknowledged. */
export function diffEnemies(world: World, lastSent: Map<string, EnemySent>): Enemy[] {
	const out: Enemy[] = [];
	for (const e of world.enemies.values()) {
		if (e.dying || !e.confirmed) continue;
		if (enemyChanged(e, lastSent.get(e.key))) out.push(e);
	}
	return out;
}

export function selfChanged(p: Player, last: SelfSent | null): boolean {
	if (!last) return true;
	return (
		dist(p.pos, { x: last.x, z: last.z }) > MOVE_EPS ||
		Math.abs(angleDiff(last.facing, p.facing)) > TURN_EPS
	);
}
