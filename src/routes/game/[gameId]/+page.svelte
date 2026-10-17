<script lang="ts">
	import { page } from '$app/state';
	import { useQuery } from 'convex-svelte';
	import { api } from '../../../convex/_generated/api';
	import GameView from '#lib/components/game/GameView.svelte';

	// The JWT subject is what every game row keys on; wait for it before building the world.
	const viewer = useQuery(api.users.viewer, {});
	const gameId = $derived(page.params.gameId ?? '');
</script>

<svelte:head>
	<title>REN · in game</title>
</svelte:head>

{#if viewer.data && gameId}
	{#key gameId}
		<GameView {gameId} userId={viewer.data.id} />
	{/key}
{:else}
	<div class="flex h-dvh items-center justify-center">
		<div class="pixel text-xs text-bone-2">Loading…</div>
	</div>
{/if}
