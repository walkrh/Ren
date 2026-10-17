import type { PageServerLoad } from './$types';
import { requireUser } from '#lib/server/auth.js';

export const load: PageServerLoad = (event) => {
	requireUser(event);
	return {};
};
