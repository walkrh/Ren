// Item catalog: weapons (main + melee), abilities (constellations), pickups.
// Static config shared by the client sim and the Convex functions. Every tunable
// number lives here; nothing numeric belongs in the schema or in mutations.
import type { ConstellationId, RaceId } from '../traits.js';

export type HotbarSlot = 'main' | 'melee' | 'ability';
export type Stat = 'luck' | 'vitality' | 'fortitude' | 'stealth' | 'speed' | 'damageReduction';

// ---------- Effects ----------
// Each effect type only allows the fields it actually uses.

interface EffectBase {
	/** Only triggers on every Nth hit with this item */
	everyNthHit?: number;
	/** 0–1 chance to trigger */
	chance?: number;
}

export type HitEffect =
	| (EffectBase & { type: 'stun'; durationMs: number })
	| (EffectBase & { type: 'slow'; value: number; durationMs: number }) // value = % slower (0–1)
	| (EffectBase & { type: 'chain'; value: number; radius: number; maxTargets: number }) // value = % of base damage
	| (EffectBase & { type: 'aoe'; value: number; radius: number }) // value = % of base damage at the edge
	| (EffectBase & { type: 'lifesteal'; value: number }) // value = % of damage dealt
	| (EffectBase & { type: 'knockback'; value: number }); // value = distance in units

export type PickupEffect =
	| { type: 'heal'; value: number } // value = % of max HP
	| { type: 'attackSpeed'; value: number; durationMs: number } // value = % faster
	| { type: 'shield'; value: number }; // value = hits blocked

export type AbilityEffect =
	| {
			// Capricorn: buff allies nearby, stronger the closer they are
			type: 'aura';
			stat: Stat;
			maxValue: number; // bonus at the caster's position
			radius: number; // bonus drops to 0 at this distance
			durationMs: number;
	  }
	| {
			// Libra: allies below threshold jump to it and can't drop below until it ends
			type: 'healthFloor';
			threshold: number; // 0.5 = 50% HP
			durationMs: number;
	  }
	| {
			// Aries: speed buff, then a slowdown
			type: 'speedBuffThenDebuff';
			buffValue: number; // 0.4 = 40% faster
			buffDurationMs: number;
			debuffValue: number; // 0.25 = 25% slower
			debuffDurationMs: number;
	  };

// ---------- Item definitions ----------

interface ItemBase {
	id: string; // stable key used by code and the DB, e.g. "pulse_rifle"
	name: string;
	description: string;
	icon: string; // asset path for hotbar / UI
}

export interface RangedWeapon extends ItemBase {
	kind: 'weapon';
	slot: 'main';
	race: RaceId; // fixed kit per race
	attackType: 'projectile' | 'hitscan';
	damage: number;
	cooldownMs: number; // time between shots
	range: number; // units
	projectileSpeed?: number; // projectile only, units/sec
	clipSize: number;
	reloadMs: number;
	model: string;
	effects: HitEffect[];
}

export interface MeleeWeapon extends ItemBase {
	kind: 'weapon';
	slot: 'melee';
	race: RaceId;
	damage: number;
	cooldownMs: number;
	range: number; // reach in units
	arcDegrees: number; // swing width, 360 = full spin
	model: string;
	effects: HitEffect[];
}

export interface Ability extends ItemBase {
	kind: 'ability';
	slot: 'ability';
	constellation: ConstellationId;
	cooldownMs: number;
	effect: AbilityEffect;
}

export interface Pickup extends ItemBase {
	kind: 'pickup';
	dropChance: number; // 0–1, rolled when an enemy dies
	despawnMs: number; // how long it stays on the ground
	model: string;
	effects: PickupEffect[];
}

export type Weapon = RangedWeapon | MeleeWeapon;
export type ItemDefinition = Weapon | Ability | Pickup;

export interface Hotbar {
	main: WeaponKey;
	melee: WeaponKey;
	ability: ConstellationId;
}

// ---------- Catalog ----------

export const weapons = {
	pulse_rifle: {
		kind: 'weapon',
		slot: 'main',
		race: 'human',
		id: 'pulse_rifle',
		name: 'Pulse Rifle',
		description: 'Steady shots. Every 5th shot stuns.',
		icon: 'icons/pulse_rifle.png',
		model: 'models/pulse_rifle.glb',
		attackType: 'projectile',
		damage: 12,
		cooldownMs: 250,
		range: 10,
		projectileSpeed: 25,
		clipSize: 30,
		reloadMs: 1500,
		effects: [{ type: 'stun', durationMs: 500, everyNthHit: 5 }]
	},
	arc_caster: {
		kind: 'weapon',
		slot: 'main',
		race: 'agarthan',
		id: 'arc_caster',
		name: 'Arc Caster',
		description: 'Short-range bolt that chains to one nearby enemy.',
		icon: 'icons/arc_caster.png',
		model: 'models/arc_caster.glb',
		attackType: 'hitscan',
		damage: 18,
		cooldownMs: 350,
		range: 7,
		clipSize: 12,
		reloadMs: 1800,
		effects: [{ type: 'chain', value: 0.5, radius: 4, maxTargets: 1 }]
	},
	shard_launcher: {
		kind: 'weapon',
		slot: 'main',
		race: 'forsaken',
		id: 'shard_launcher',
		name: 'Shard Launcher',
		description: 'Slow, heavy shots that explode in a small area.',
		icon: 'icons/shard_launcher.png',
		model: 'models/shard_launcher.glb',
		attackType: 'projectile',
		damage: 35,
		cooldownMs: 850,
		range: 12,
		projectileSpeed: 14,
		clipSize: 5,
		reloadMs: 2200,
		effects: [{ type: 'aoe', value: 0.5, radius: 2.5 }]
	},
	shock_baton: {
		kind: 'weapon',
		slot: 'melee',
		race: 'human',
		id: 'shock_baton',
		name: 'Shock Baton',
		description: 'Hits slow the enemy. Every 3rd hit stuns.',
		icon: 'icons/shock_baton.png',
		model: 'models/shock_baton.glb',
		damage: 20,
		cooldownMs: 500,
		range: 2,
		arcDegrees: 90,
		effects: [
			{ type: 'slow', value: 0.4, durationMs: 2000 },
			{ type: 'stun', durationMs: 500, everyNthHit: 3 }
		]
	},
	data_blade: {
		kind: 'weapon',
		slot: 'melee',
		race: 'agarthan',
		id: 'data_blade',
		name: 'Data Blade',
		description: 'Fast swings with a little lifesteal per hit.',
		icon: 'icons/data_blade.png',
		model: 'models/data_blade.glb',
		damage: 12,
		cooldownMs: 280,
		range: 1.8,
		arcDegrees: 90,
		effects: [{ type: 'lifesteal', value: 0.15 }]
	},
	breaker_hammer: {
		kind: 'weapon',
		slot: 'melee',
		race: 'forsaken',
		id: 'breaker_hammer',
		name: 'Breaker Hammer',
		description: 'Slow, heavy swing that knocks enemies back.',
		icon: 'icons/breaker_hammer.png',
		model: 'models/breaker_hammer.glb',
		damage: 35,
		cooldownMs: 1100,
		range: 1.8,
		arcDegrees: 120,
		effects: [{ type: 'knockback', value: 3 }]
	}
} as const satisfies Record<string, Weapon>;

export type WeaponKey = keyof typeof weapons;
export const weaponKeys = Object.keys(weapons) as [WeaponKey, ...WeaponKey[]];

export const abilities = {
	capricorn: {
		kind: 'ability',
		slot: 'ability',
		constellation: 'capricorn',
		id: 'capricorn',
		name: 'Leadership',
		description: 'Nearby allies gain fortitude. Closer = stronger.',
		icon: 'icons/capricorn.png',
		cooldownMs: 180_000,
		effect: { type: 'aura', stat: 'fortitude', maxValue: 0.3, radius: 8, durationMs: 30_000 }
	},
	libra: {
		kind: 'ability',
		slot: 'ability',
		constellation: 'libra',
		id: 'libra',
		name: 'Balance',
		description: 'Allies below 50% HP jump to 50% and stay there until it ends.',
		icon: 'icons/libra.png',
		cooldownMs: 150_000,
		effect: { type: 'healthFloor', threshold: 0.5, durationMs: 20_000 }
	},
	aries: {
		kind: 'ability',
		slot: 'ability',
		constellation: 'aries',
		id: 'aries',
		name: 'Impatience',
		description: 'Faster at everything for 45s, then 25% slower for 75s.',
		icon: 'icons/aries.png',
		cooldownMs: 0, // the debuff is the cost
		effect: {
			type: 'speedBuffThenDebuff',
			buffValue: 0.4,
			buffDurationMs: 45_000,
			debuffValue: 0.25,
			debuffDurationMs: 75_000
		}
	}
} as const satisfies Record<ConstellationId, Ability>;

export const pickups = {
	patch_kit: {
		kind: 'pickup',
		id: 'patch_kit',
		name: 'Patch Kit',
		description: 'Restores 25% HP.',
		icon: 'icons/patch_kit.png',
		model: 'models/patch_kit.glb',
		dropChance: 0.15,
		despawnMs: 20_000,
		effects: [{ type: 'heal', value: 0.25 }]
	},
	overclock_chip: {
		kind: 'pickup',
		id: 'overclock_chip',
		name: 'Overclock Chip',
		description: 'Faster attacks for 10 seconds.',
		icon: 'icons/overclock_chip.png',
		model: 'models/overclock_chip.glb',
		dropChance: 0.1,
		despawnMs: 20_000,
		effects: [{ type: 'attackSpeed', value: 0.4, durationMs: 10_000 }]
	},
	firewall_shard: {
		kind: 'pickup',
		id: 'firewall_shard',
		name: 'Firewall Shard',
		description: 'A short shield that blocks the next hit.',
		icon: 'icons/firewall_shard.png',
		model: 'models/firewall_shard.glb',
		dropChance: 0.08,
		despawnMs: 20_000,
		effects: [{ type: 'shield', value: 1 }]
	}
} as const satisfies Record<string, Pickup>;

export type PickupKind = keyof typeof pickups;
export const pickupKinds = Object.keys(pickups) as [PickupKind, ...PickupKind[]];

/** Every race has a fixed kit; the ability comes from the constellation. */
export function loadoutFor(race: RaceId, constellation: ConstellationId): Hotbar {
	const main = weaponKeys.find((k) => weapons[k].slot === 'main' && weapons[k].race === race)!;
	const melee = weaponKeys.find((k) => weapons[k].slot === 'melee' && weapons[k].race === race)!;
	return { main, melee, ability: constellation };
}

export function isWeaponKey(key: string): key is WeaponKey {
	return key in weapons;
}

export function isPickupKind(key: string): key is PickupKind {
	return key in pickups;
}
