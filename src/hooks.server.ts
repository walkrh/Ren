import { sequence, type Handle } from '@sveltejs/kit/hooks';
import { configureAuthKit, authKitHandle } from '@workos/authkit-sveltekit';
import { withServerConvexToken } from 'convex-svelte/sveltekit/server';
import { authKitConfig } from '#lib/server/auth.js';

configureAuthKit(authKitConfig);

// Authenticates server-side Convex calls (convexLoad, createConvexHttpClient) as the signed-in user
const convexAuth: Handle = ({ event, resolve }) =>
	withServerConvexToken(event.locals.auth.accessToken, () => resolve(event));

export const handle = sequence(authKitHandle(), convexAuth);
