import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export const raceValidator = v.union(
	v.literal('human'),
	v.literal('agarthan'),
	v.literal('forsaken')
);
export const originValidator = v.union(
	v.literal('mountains'),
	v.literal('swamp'),
	v.literal('plains'),
	v.literal('desert')
);
export const constellationValidator = v.union(
	v.literal('capricorn'),
	v.literal('libra'),
	v.literal('aries')
);

export default defineSchema({
	characters: defineTable({
		// WorkOS user id (JWT subject)
		userId: v.string(),
		name: v.string(),
		race: raceValidator,
		origin: originValidator,
		constellation: constellationValidator
	}).index('by_user', ['userId'])
});
