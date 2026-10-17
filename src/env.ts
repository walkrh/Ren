import { defineEnvVars } from '@sveltejs/kit/env';

const required = (name: string) => (value: string | undefined) => {
	if (!value) throw new Error(`${name} is not set. Add it to .env.local`);
	return value;
};

export const variables = defineEnvVars({
	PUBLIC_CONVEX_URL: { public: true, description: 'Convex deployment URL' },
	WORKOS_CLIENT_ID: {
		description: 'WorkOS Client ID (client_...)',
		schema: required('WORKOS_CLIENT_ID')
	},
	WORKOS_API_KEY: { description: 'WorkOS API key (sk_...)', schema: required('WORKOS_API_KEY') },
	WORKOS_REDIRECT_URI: {
		description: 'AuthKit callback URL, e.g. http://localhost:5173/callback',
		schema: required('WORKOS_REDIRECT_URI')
	},
	WORKOS_COOKIE_PASSWORD: {
		description: 'Session cookie encryption password',
		schema: (value) => {
			if (!value || value.length < 32)
				throw new Error('WORKOS_COOKIE_PASSWORD must be at least 32 characters');
			return value;
		}
	}
});
