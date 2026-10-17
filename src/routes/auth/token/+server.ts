import { json } from '@sveltejs/kit';
import { getConvexToken } from '#lib/server/auth.js';
import type { RequestHandler } from './$types';

// The Convex client fetches its WorkOS access token from here
export const GET: RequestHandler = async (event) => {
	const { token, setCookies } = await getConvexToken(event);
	const response = json({ token }, { headers: { 'cache-control': 'no-store' } });
	for (const cookie of setCookies) response.headers.append('set-cookie', cookie);
	return response;
};
