// Base stats and the bonus each race / origin grants. Snapshotted onto gamePlayers at game start.
import type { OriginId, RaceId } from '../traits.js';

export type BaseStats = {
	maxHp: number;
	/** units per second */
	moveSpeed: number;
	/** 0–1, fraction of incoming damage removed (Desert) */
	damageReduction: number;
	/** enemies notice the player inside this radius (Swamp lowers it) */
	aggroRadius: number;
	/** 0–1 (Human) */
	critChance: number;
	/** multiplies every pickup's dropChance (Human) */
	dropMultiplier: number;
	/** hp per second, always on (Agarthan) */
	regenPerSecond: number;
	/** multiplies damage dealt (Forsaken) */
	damageMultiplier: number;
	/** multiplies reload time (Plains) */
	reloadMultiplier: number;
};

export const BASE_STATS: BaseStats = {
	maxHp: 100,
	moveSpeed: 6,
	damageReduction: 0,
	aggroRadius: 12,
	critChance: 0.05,
	dropMultiplier: 1,
	regenPerSecond: 0,
	damageMultiplier: 1,
	reloadMultiplier: 1
};

export const CRIT_MULTIPLIER = 1.5;

const raceBonus: Record<RaceId, Partial<BaseStats>> = {
	human: { critChance: 0.15, dropMultiplier: 1.6 },
	agarthan: { regenPerSecond: 0.5 },
	forsaken: { damageMultiplier: 1.15 }
};

const originBonus: Record<OriginId, Partial<BaseStats>> = {
	mountains: { maxHp: 125 },
	swamp: { aggroRadius: 8 },
	plains: { moveSpeed: 7.2, reloadMultiplier: 0.8 },
	desert: { damageReduction: 0.2 }
};

export function computeStats(race: RaceId, origin: OriginId): BaseStats {
	return { ...BASE_STATS, ...raceBonus[race], ...originBonus[origin] };
}

// ---------- Timed modifiers ----------
// Status-effect rows (Convex) and local timers (overclock) resolve to these multipliers.

export type EffectKind = 'leadership' | 'balance' | 'impatience' | 'impatience_fatigue';

export type TimedEffect = {
	kind: EffectKind;
	sourcePlayerId: string;
	targetPlayerId?: string;
	magnitude?: number;
	startsAt: number;
	endsAt: number;
};

export type Modifiers = {
	speed: number;
	attackSpeed: number;
	reload: number;
};

export const NO_MODIFIERS: Modifiers = { speed: 1, attackSpeed: 1, reload: 1 };

/**
 * Multipliers that apply to one player right now. Aries affects the caster only;
 * overclock is a local timer passed in as "until" so the sim need not know pickups.
 */
export function resolveModifiers(
	playerId: string,
	effects: readonly TimedEffect[],
	now: number,
	overclockUntil = 0
): Modifiers {
	let speed = 1;
	let attackSpeed = 1;
	let reload = 1;
	for (const e of effects) {
		if (now < e.startsAt || now >= e.endsAt) continue;
		if (e.targetPlayerId !== playerId) continue;
		if (e.kind === 'impatience') {
			const v = 1 + (e.magnitude ?? 0);
			speed *= v;
			attackSpeed *= v;
			reload /= v;
		} else if (e.kind === 'impatience_fatigue') {
			const v = 1 - (e.magnitude ?? 0);
			speed *= v;
			attackSpeed *= v;
			reload /= v;
		}
	}
	if (overclockUntil > now) attackSpeed *= 1.4;
	return { speed, attackSpeed, reload };
}

export function isEffectActive(e: TimedEffect, now: number) {
	return now >= e.startsAt && now < e.endsAt;
}
