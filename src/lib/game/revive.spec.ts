import { describe, expect, it } from 'vitest';
import { applyEvents, STEP } from './loop.js';
import { EMPTY_INPUT, stepLocalPlayer } from './sim.js';
import { REVIVE_MS } from './data/waves.js';
import { reviveProgress, stepRevive } from './revive.js';
import { fakeSync, testPlayer, testWorld } from './testing.js';

function setup() {
	const world = testWorld();
	const me = testPlayer(world);
	const mate = testPlayer(world, { id: 'p2', local: false, pos: { x: 1.5, z: 0 } });
	mate.state = 'downed';
	mate.hp = 0;
	const sync = fakeSync();
	const step = (interact: boolean, ms = STEP * 1000) => {
		world.now += ms;
		stepRevive(world, interact);
		stepLocalPlayer(world, { ...EMPTY_INPUT, interact, move: { x: 1, z: 0 } }, STEP);
		applyEvents(world, sync, true);
	};
	return { world, me, mate, sync, step };
}

describe('revives', () => {
	it('holds still next to a downed teammate and finishes once the server agrees', () => {
		const { world, me, mate, sync, step } = setup();
		step(true);
		expect(sync.revives).toEqual([{ action: 'start', targetId: 'p2' }]);
		expect(me.pos).toEqual({ x: 0, z: 0 }); // rooted despite holding D
		mate.revivedBy = me.id;
		mate.reviveSeenAt = world.now;
		step(true, REVIVE_MS / 2);
		expect(reviveProgress(world, mate)?.progress).toBeCloseTo(0.5, 1);
		expect(sync.revives).toHaveLength(1);
		step(true, REVIVE_MS / 2);
		expect(sync.revives.at(-1)).toEqual({ action: 'finish', targetId: 'p2' });
	});

	it('cancels when the key is released', () => {
		const { world, sync, step } = setup();
		step(true);
		step(false);
		expect(sync.revives.map((r) => r.action)).toEqual(['start', 'cancel']);
		expect(world.revive).toBeNull();
	});

	it('leaves a teammate alone while someone else is reviving them', () => {
		const { world, mate, sync, step } = setup();
		testPlayer(world, { id: 'p3', local: false, pos: { x: 2, z: 1 } });
		mate.revivedBy = 'p3';
		mate.reviveSeenAt = world.now;
		step(true);
		expect(sync.revives).toEqual([]);
	});

	it('starts over when the server never took the start', () => {
		const { sync, step } = setup();
		step(true);
		step(true, REVIVE_MS);
		expect(sync.revives.map((r) => r.action)).toEqual(['start', 'start']);
	});

	it('ignores teammates out of reach', () => {
		const { mate, sync, step } = setup();
		mate.pos = { x: 6, z: 0 };
		step(true);
		expect(sync.revives).toEqual([]);
	});
});
