<script lang="ts">
	import './layout.css';
	import favicon from '#lib/assets/favicon.svg';
	import type { LayoutProps } from './$types';
	import { untrack } from 'svelte';
	import { setupAuth, setupConvex } from 'convex-svelte';
	import { resolve } from '$app/paths';
	import { PUBLIC_CONVEX_URL } from '$app/env/public';

	let { data, children }: LayoutProps = $props();

	setupConvex(PUBLIC_CONVEX_URL);

	async function fetchAccessToken() {
		const response = await fetch(resolve('/auth/token'));
		if (!response.ok) return null;
		const { token } = (await response.json()) as { token: string | null };
		return token;
	}

	setupAuth(() => ({ isLoading: false, isAuthenticated: data.user !== null, fetchAccessToken }), {
		initialState: { isAuthenticated: untrack(() => data.user !== null) }
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
