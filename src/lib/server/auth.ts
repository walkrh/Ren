import { redirect, type RequestEvent } from '@sveltejs/kit';
import { configure, CookieSessionStorage, createAuthService } from '@workos/authkit-session';
import {
	WORKOS_CLIENT_ID,
	WORKOS_API_KEY,
	WORKOS_REDIRECT_URI,
	WORKOS_COOKIE_PASSWORD
} from '$app/env/private';

export const authKitConfig = {
	clientId: WORKOS_CLIENT_ID,
	apiKey: WORKOS_API_KEY,
	redirectUri: WORKOS_REDIRECT_URI,
	cookiePassword: WORKOS_COOKIE_PASSWORD
};

// Use instead of authKit.withAuth(), which calls redirect() to an external URL
// and so throws `redirect_external_not_allowed` under SvelteKit 3
export function requireUser(event: RequestEvent) {
	const { auth } = event.locals;
	if (!auth.user) {
		const returnTo = event.url.pathname + event.url.search;
		redirect(302, `/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
	}
	return { ...auth, user: auth.user };
}

class RequestCookieStorage extends CookieSessionStorage<Request, Response> {
	async getCookie(request: Request, name: string) {
		const cookie = request.headers
			.get('cookie')
			?.split(/;\s*/)
			.find((c) => c.startsWith(`${name}=`));
		return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : null;
	}
}

// authKit.refreshSession() is a no-op, so force refreshes through the session library directly.
// @workos/authkit-sveltekit bundles its own copy of it, so it needs configuring separately.
configure(authKitConfig);
const sessions = createAuthService({
	sessionStorageFactory: (config) => new RequestCookieStorage(config)
});

// Refresh this far ahead of expiry so Convex never receives a token about to lapse
const MIN_TOKEN_LIFETIME_SECONDS = 60;

function expiresAt(token: string) {
	const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
	return payload.exp as number;
}

export async function getConvexToken(
	event: RequestEvent
): Promise<{ token: string | null; setCookies: string[] }> {
	const { auth } = event.locals;
	if (!auth.user || !auth.accessToken) return { token: null, setCookies: [] };

	if (expiresAt(auth.accessToken) - Date.now() / 1000 > MIN_TOKEN_LIFETIME_SECONDS) {
		return { token: auth.accessToken, setCookies: [] };
	}

	// If authKitHandle already refreshed this request, the cookie's refresh token is spent
	const session = await sessions.getSession(event.request);
	if (!session || session.accessToken !== auth.accessToken) {
		return { token: auth.accessToken, setCookies: [] };
	}

	const refreshed = await sessions.refreshSession(session, auth.organizationId ?? undefined);
	const { headers } = await sessions.saveSession(undefined, refreshed.encryptedSession);
	const setCookie = headers?.['Set-Cookie'] ?? headers?.['set-cookie'] ?? [];
	const token = refreshed.auth.user ? refreshed.auth.accessToken : null;
	return { token, setCookies: [setCookie].flat() };
}
