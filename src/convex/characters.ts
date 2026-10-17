import { ConvexError, v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { constellationValidator, originValidator, raceValidator } from './schema';
import { validateCharacterName } from '../lib/game/traits';

/** The signed-in user's character, or null if they have not created one yet. */
export const mine = query({
	args: {},
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) return null;
		return await ctx.db
			.query('characters')
			.withIndex('by_user', (q) => q.eq('userId', identity.subject))
			.unique();
	}
});

/**
 * Save the player's survivor. Players can re-roll and rename as often as they like,
 * so this creates on first save and overwrites afterwards. The three slots are
 * rolled on the client; this only validates and stores them.
 */
export const save = mutation({
	args: {
		name: v.string(),
		race: raceValidator,
		origin: originValidator,
		constellation: constellationValidator
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new ConvexError('Sign in to save a survivor');

		// The lobby shows this survivor to the party, so it is locked while you sit in one.
		const membership = await ctx.db
			.query('lobbyMembers')
			.withIndex('by_user', (q) => q.eq('userId', identity.subject))
			.first();
		if (membership) throw new ConvexError('Leave your lobby to change your survivor');

		const nameError = validateCharacterName(args.name);
		if (nameError) throw new ConvexError(nameError);

		const fields = {
			name: args.name.trim(),
			race: args.race,
			origin: args.origin,
			constellation: args.constellation
		};

		const existing = await ctx.db
			.query('characters')
			.withIndex('by_user', (q) => q.eq('userId', identity.subject))
			.unique();
		if (existing) {
			await ctx.db.patch(existing._id, fields);
			return existing._id;
		}
		return await ctx.db.insert('characters', { userId: identity.subject, ...fields });
	}
});
