// Character trait tables. Every character is rolled once from these three slots.
// Keep the ids stable: they are stored in Convex on each character.

export type RaceId = 'human' | 'agarthan' | 'forsaken';
export type OriginId = 'mountains' | 'swamp' | 'plains' | 'desert';
export type ConstellationId = 'capricorn' | 'libra' | 'aries';

export type Trait<Id extends string> = {
	id: Id;
	name: string;
	/** Short label for the stat or ability this trait grants */
	grant: string;
	/** One-line flavor shown under the name */
	tagline: string;
	/** Mechanical explanation shown on the character sheet */
	effect: string;
};

export type Ability = Trait<ConstellationId> & {
	durationSeconds: number;
	cooldownSeconds: number;
	debuff: string | null;
};

export const races: readonly Trait<RaceId>[] = [
	{
		id: 'human',
		name: 'Human',
		grant: '+ Faith',
		tagline: 'Stubborn, ordinary, and somehow still alive.',
		effect: 'Faith raises your luck: better drops, more crits, kinder dice.'
	},
	{
		id: 'agarthan',
		name: 'Agarthan',
		grant: '+ Spirit',
		tagline: 'Keepers of the sacred timeline, waiting beneath the crust for this moment.',
		effect: 'Spirit slowly heals you over time, even in the middle of a wave.'
	},
	{
		id: 'forsaken',
		name: 'Forsaken',
		grant: '+ Rage',
		tagline: 'They helped build the machines. Now they fight to tear them down.',
		effect: 'Rage adds bonus damage to every hit you land.'
	}
];

export const origins: readonly Trait<OriginId>[] = [
	{
		id: 'mountains',
		name: 'Mountains',
		grant: '+ Vitality',
		tagline: 'Thin air builds thick lungs.',
		effect: 'Bonus vitality: a larger health pool to burn through.'
	},
	{
		id: 'swamp',
		name: 'Swamp',
		grant: '+ Stealth',
		tagline: 'Nothing sees you until it is too late.',
		effect: "Bonus stealth: the Overlords' machines notice you from a shorter distance."
	},
	{
		id: 'plains',
		name: 'Plains',
		grant: '+ Speed',
		tagline: 'Nowhere to hide, so you learned to run.',
		effect: 'Bonus movement speed, on foot and while reloading.'
	},
	{
		id: 'desert',
		name: 'Desert',
		grant: '− Damage taken',
		tagline: 'The sun hardened you before the machines could.',
		effect: 'Reduced damage taken from every source.'
	}
];

export const constellations: readonly Ability[] = [
	{
		id: 'capricorn',
		name: 'Capricorn',
		grant: 'Leadership',
		tagline: 'The goat climbs, and the herd follows.',
		effect:
			'Grants fortitude to allies based on distance from you: closer allies gain more, farther allies gain less.',
		durationSeconds: 30,
		cooldownSeconds: 180,
		debuff: null
	},
	{
		id: 'libra',
		name: 'Libra',
		grant: 'Balance',
		tagline: 'The scales do not care who deserves it.',
		effect:
			'Any ally below 50% health is instantly set to 50% and cannot drop below it while this is active.',
		durationSeconds: 20,
		cooldownSeconds: 150,
		debuff: null
	},
	{
		id: 'aries',
		name: 'Aries',
		grant: 'Impatience',
		tagline: 'Faster. Faster. Pay for it later.',
		effect: 'Every task you do is faster for the duration: reloads, revives, repairs, movement.',
		durationSeconds: 45,
		cooldownSeconds: 0,
		debuff: '+25% slower at all tasks for 1 minute 15 seconds afterwards.'
	}
];

export const raceIds = races.map((r) => r.id) as [RaceId, ...RaceId[]];
export const originIds = origins.map((o) => o.id) as [OriginId, ...OriginId[]];
export const constellationIds = constellations.map((c) => c.id) as [
	ConstellationId,
	...ConstellationId[]
];

export function findRace(id: RaceId) {
	return races.find((r) => r.id === id)!;
}
export function findOrigin(id: OriginId) {
	return origins.find((o) => o.id === id)!;
}
export function findConstellation(id: ConstellationId) {
	return constellations.find((c) => c.id === id)!;
}

export const CHARACTER_NAME_MIN = 2;
export const CHARACTER_NAME_MAX = 20;
export const CHARACTER_NAME_PATTERN = /^[A-Za-z0-9 _'-]+$/;

export function validateCharacterName(raw: string): string | null {
	const name = raw.trim();
	if (name.length < CHARACTER_NAME_MIN)
		return `Name must be at least ${CHARACTER_NAME_MIN} characters`;
	if (name.length > CHARACTER_NAME_MAX)
		return `Name must be at most ${CHARACTER_NAME_MAX} characters`;
	if (!CHARACTER_NAME_PATTERN.test(name)) return 'Letters, numbers, spaces, _ ’ and - only';
	return null;
}

/** Uniform random pick using the Web Crypto API (available in browsers and Convex). */
export function rollFrom<T>(options: readonly T[]): T {
	const buf = new Uint32Array(1);
	crypto.getRandomValues(buf);
	return options[buf[0] % options.length];
}
