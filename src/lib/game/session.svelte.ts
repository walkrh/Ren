// The only runes-bearing game module. Holds the non-reactive World and republishes just the
// scalars and id lists the DOM/Threlte templates need, once per frame.
import type { World } from './world.js';
import { localPlayer, isHost } from './world.js';
import { weapons, type RangedWeapon } from './data/items.js';
import { BOSS_WAVE } from './data/waves.js';
import { getContext, setContext } from 'svelte';

export type Hud = {
	ready: boolean;
	hp: number;
	maxHp: number;
	ammo: number;
	clipSize: number;
	reloading: boolean;
	reloadFraction: number;
	slot: 'main' | 'melee' | 'ability';
	mainName: string;
	meleeName: string;
	abilityName: string;
	abilityCooldownMs: number;
	overclockMs: number;
	shieldCharges: number;
	wave: number;
	bossWave: number;
	waveState: 'intermission' | 'in_progress';
	nextWaveInMs: number;
	enemiesLeft: number;
	bossHp: number;
	bossMaxHp: number;
	bossPhase: number;
	status: 'active' | 'victory' | 'defeat';
	downed: boolean;
	isHost: boolean;
	error: string | null;
};

export class GameSession {
	/** Plain, never reactive. */
	readonly world: World;
	hud: Hud = $state(initialHud());
	enemyIds: string[] = $state.raw([]);
	playerIds: string[] = $state.raw([]);
	pickupIds: string[] = $state.raw([]);
	private lastMembership = -1;

	constructor(world: World) {
		this.world = world;
	}

	publish(opts: { ready: boolean; error: string | null }) {
		const w = this.world;
		if (w.membershipVersion !== this.lastMembership) {
			this.lastMembership = w.membershipVersion;
			this.enemyIds = [...w.enemies.keys()];
			this.playerIds = [...w.players.keys()];
			this.pickupIds = [...w.pickups.keys()];
		}
		const me = localPlayer(w);
		const h = this.hud;
		h.ready = opts.ready && !!me;
		h.error = opts.error;
		h.status = w.game.status;
		h.wave = w.game.wave;
		h.waveState = w.game.waveState;
		h.nextWaveInMs = w.game.nextWaveAt ? Math.max(0, w.game.nextWaveAt - w.now) : 0;
		h.enemiesLeft = w.game.waveEnemiesRemaining;
		h.isHost = isHost(w);
		let boss = null;
		for (const e of w.enemies.values()) if (e.type === 'overlord' && !e.dying) boss = e;
		h.bossHp = boss?.hp ?? 0;
		h.bossMaxHp = boss?.maxHp ?? 0;
		h.bossPhase = boss?.bossPhase ?? 0;
		if (!me) return;
		const main = weapons[me.hotbar.main] as RangedWeapon;
		h.hp = me.hp;
		h.maxHp = me.maxHp;
		h.ammo = me.weapon.ammo;
		h.clipSize = main.clipSize;
		h.reloading = me.weapon.reloadT > 0;
		h.reloadFraction = h.reloading
			? 1 - me.weapon.reloadT / ((main.reloadMs / 1000) * me.stats.reloadMultiplier)
			: 0;
		h.slot = me.weapon.slot;
		h.mainName = main.name;
		h.meleeName = weapons[me.hotbar.melee].name;
		h.abilityName = abilityName(me.constellation);
		h.abilityCooldownMs = Math.max(0, me.weapon.abilityReadyAt - w.now);
		h.overclockMs = Math.max(0, me.weapon.overclockUntil - w.now);
		h.shieldCharges = me.shieldCharges;
		h.downed = me.state === 'downed';
	}
}

function abilityName(c: 'capricorn' | 'libra' | 'aries') {
	return { capricorn: 'Leadership', libra: 'Balance', aries: 'Impatience' }[c];
}

function initialHud(): Hud {
	return {
		ready: false,
		hp: 0,
		maxHp: 1,
		ammo: 0,
		clipSize: 1,
		reloading: false,
		reloadFraction: 0,
		slot: 'main',
		mainName: '',
		meleeName: '',
		abilityName: '',
		abilityCooldownMs: 0,
		overclockMs: 0,
		shieldCharges: 0,
		wave: 0,
		bossWave: BOSS_WAVE,
		waveState: 'intermission',
		nextWaveInMs: 0,
		enemiesLeft: 0,
		bossHp: 0,
		bossMaxHp: 0,
		bossPhase: 0,
		status: 'active',
		downed: false,
		isHost: false,
		error: null
	};
}

const KEY = Symbol('game-session');
export function provideSession(s: GameSession) {
	setContext(KEY, s);
}
export function useSession(): GameSession {
	const s = getContext<GameSession>(KEY);
	if (!s) throw new Error('No game session in context');
	return s;
}

// ─── Runtime: everything the scene and HUD need, provided once by the game route ───
import type { GameLoop } from './loop.js';
import type { GameSync } from './sync.js';
import type { InputController } from './input.js';

export type GameRuntime = {
	session: GameSession;
	world: World;
	loop: GameLoop;
	sync: GameSync;
	input: InputController;
};

const RUNTIME_KEY = Symbol('game-runtime');
export function provideRuntime(r: GameRuntime) {
	setContext(RUNTIME_KEY, r);
	setContext(KEY, r.session);
}
export function useRuntime(): GameRuntime {
	const r = getContext<GameRuntime>(RUNTIME_KEY);
	if (!r) throw new Error('No game runtime in context');
	return r;
}
