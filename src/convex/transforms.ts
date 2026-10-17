import { v } from 'convex/values';
import { mutation } from './_generated/server';
import { vec2Validator } from './schema';
import { requirePlayer } from './lib';
import { writeTransform } from './games';

/** A non-host player's own position, throttled client-side to ~12 Hz. The host's rides in syncEnemies. */
export const update = mutation({
	args: { gameId: v.id('games'), position: vec2Validator, facing: v.number() },
	handler: async (ctx, { gameId, position, facing }) => {
		const { player } = await requirePlayer(ctx, gameId);
		await writeTransform(ctx, gameId, player._id, position, facing, Date.now());
	}
});
