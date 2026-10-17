// Fixed-timestep game loop. Threlte's useTask feeds it frame deltas; it steps the pure sim,
// applies the resulting events locally (prediction) and forwards them to the sync port.
import { weapons } from './data/items.js';
import type { Rng } from './rng.js';
import {
	EMPTY_INPUT,
	stepHost,
	stepLocalPlayer,
	stepPickupTouch,
	stepProjectiles,
	type InputFrame
} from './sim.js';
import {
	isHost,
	localPlayer,
	type Enemy,
	type Hit,
	type ReviveAction,
	type SimEvent,
	type World
} from './world.js';
import { stepRevive } from './revive.js';
import type { WeaponKey } from './data/items.js';
import { abilities } from './data/items.js';
import { dist } from './vec.js';

export const STEP = 1 / 60;
const MAX_STEPS = 5;
const MAX_FRAME_DT = 0.25;

/** Everything the loop needs from the network layer. Tests pass a fake. */
export interface SyncPort {
	queueHit(weaponKey: WeaponKey, hits: Hit[]): void;
	queueDamage(playerId: string, amount: number, enemyKey: string): void;
	queueSpawn(enemy: Enemy, extra: boolean): void;
	queuePickup(key: string): void;
	startWave(wave: number): void;
	waveCleared(wave: number): void;
	useAbility(): void;
	revive(action: ReviveAction, targetId: string): void;
	flush(world: World, host: boolean): void;
}

export type GameLoop = { tick(frameDt: number): void; readonly steps: number };

export function createGameLoop(deps: {
	world: World;
	input: () => InputFrame;
	sync: SyncPort;
	rng: Rng;
	now?: () => number;
	ready?: () => boolean;
}): GameLoop {
	const { world, sync, rng } = deps;
	const now = deps.now ?? Date.now;
	let acc = 0;
	let steps = 0;
	return {
		get steps() {
			return steps;
		},
		tick(frameDt: number) {
			world.now = now();
			world.fx.length = 0;
			if (deps.ready && !deps.ready()) {
				acc = 0;
				return;
			}
			acc += Math.min(frameDt, MAX_FRAME_DT);
			// InputController consumes edges: read only when a step can use them.
			let frame = acc >= STEP ? deps.input() : EMPTY_INPUT;
			let n = 0;
			while (acc >= STEP && n < MAX_STEPS) {
				world.time += STEP;
				const host = isHost(world);
				// Combat and rendering must use the same interpolated remote positions.
				for (const p of world.players.values()) {
					if (p.local || !p.interp) continue;
					const pose = p.interp.sample(world.now);
					p.pos = { x: pose.x, z: pose.z };
					p.facing = pose.facing;
				}
				if (!host)
					for (const e of world.enemies.values()) {
						if (!e.interp) continue;
						const pose = e.interp.sample(world.now);
						e.pos = { x: pose.x, z: pose.z };
						e.facing = pose.facing;
					}
				stepRevive(world, frame.interact);
				stepLocalPlayer(world, frame, STEP);
				if (host) stepHost(world, STEP, rng);
				stepProjectiles(world, STEP);
				stepPickupTouch(world);
				applyEvents(world, sync, host);
				frame = heldOnly(frame);
				acc -= STEP;
				n++;
				steps++;
			}
			if (acc > STEP * MAX_STEPS) acc = 0; // fell too far behind; drop the backlog
			sync.flush(world, isHost(world));
		}
	};
}

/** Keep held keys for extra sim steps in one frame, but consume edge-triggered ones. */
function heldOnly(f: InputFrame): InputFrame {
	return { ...EMPTY_INPUT, move: f.move, aim: f.aim, fire: f.fire, interact: f.interact };
}

export function applyEvents(world: World, sync: SyncPort, host: boolean) {
	const events = world.events;
	world.events = [];
	const me = localPlayer(world);
	for (const ev of events) applyEvent(world, ev, sync, host, me);
}

function applyEvent(
	world: World,
	ev: SimEvent,
	sync: SyncPort,
	host: boolean,
	me: ReturnType<typeof localPlayer>
) {
	switch (ev.type) {
		case 'enemyHit': {
			// Predict: enemies never heal, so lowering hp locally can only ever be confirmed.
			const dmg = weapons[ev.weaponKey].damage * (me?.stats.damageMultiplier ?? 1);
			for (const h of ev.hits) {
				const e = world.enemies.get(h.key);
				if (!e || e.dying) continue;
				e.hp -= dmg * h.multiplier;
				if (e.hp <= 0) {
					e.hp = 0;
					e.dying = true;
					world.fx.push({ type: 'death', pos: e.pos, enemyType: e.type });
				}
			}
			sync.queueHit(ev.weaponKey, ev.hits);
			break;
		}
		case 'playerHit': {
			const target = world.players.get(ev.playerId);
			if (!target) break;
			if (target.local) {
				// Match server protection; only the server may change alive/downed state.
				if (target.shieldCharges > 0) target.shieldCharges--;
				else {
					const effects = world.effects.filter(
						(e) => e.startsAt <= world.now && e.endsAt > world.now
					);
					let fortitude = 0;
					for (const effect of effects) {
						if (effect.kind !== 'leadership') continue;
						const source = world.players.get(effect.sourcePlayerId);
						if (!source) continue;
						const def = abilities.capricorn.effect;
						fortitude = Math.max(
							fortitude,
							(effect.magnitude ?? def.maxValue) *
								Math.max(0, 1 - dist(source.pos, target.pos) / def.radius)
						);
					}
					let hp = Math.max(
						0,
						target.hp - ev.amount * (1 - target.stats.damageReduction) * (1 - fortitude)
					);
					const balance = effects.find((e) => e.kind === 'balance');
					const floor = target.maxHp * (balance?.magnitude ?? 0.5);
					if (balance && target.hp >= floor) hp = Math.max(hp, floor);
					target.hp = hp;
				}
			}
			if (host) sync.queueDamage(ev.playerId, ev.amount, ev.enemyKey);
			break;
		}
		case 'spawnEnemy':
			if (host) sync.queueSpawn(ev.enemy, ev.extra);
			break;
		case 'pickupTouched':
			sync.queuePickup(ev.key);
			break;
		case 'startWave':
			if (host) sync.startWave(ev.wave);
			break;
		case 'waveCleared':
			if (host) sync.waveCleared(ev.wave);
			break;
		case 'useAbility':
			// Debounce until the server row brings back the real cooldown.
			if (me) me.weapon.abilityReadyAt = world.now + 1000;
			sync.useAbility();
			break;
		case 'revive':
			sync.revive(ev.action, ev.targetId);
			break;
	}
}
