<script lang="ts">
	import { resolve } from '$app/paths';
	import { useQuery } from 'convex-svelte';
	import { api } from '../convex/_generated/api';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const viewer = useQuery(api.users.viewer, {});
</script>

<h1>Welcome to SvelteKit</h1>
<p>Visit <a href="https://svelte.dev/docs/kit">svelte.dev/docs/kit</a> to read the documentation</p>

{#if data.user}
	<p>Signed in as {data.user.email}</p>
	<p>
		Convex sees:
		{#if viewer.isLoading}
			loading…
		{:else if viewer.error}
			error: {viewer.error.message}
		{:else}
			{viewer.data?.email ?? 'not authenticated'}
		{/if}
	</p>
	<form method="POST" action={resolve('/sign-out')}>
		<button>Sign out</button>
	</form>
{:else}
	<a href={resolve('/sign-in')}>Sign in</a>
{/if}
