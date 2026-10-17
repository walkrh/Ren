import { redirect } from '@sveltejs/kit';
import { authKit } from '@workos/authkit-sveltekit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const signInUrl = await authKit.getSignInUrl({
		returnTo: url.searchParams.get('returnTo') ?? undefined
	});
	// SvelteKit 3 blocks external redirects unless the origin is allowlisted
	redirect(302, signInUrl, { external: ['https://api.workos.com'] });
};
