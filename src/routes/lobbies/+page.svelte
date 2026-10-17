<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { ConvexError } from 'convex/values';
	import { useMutation, useQuery } from 'convex-svelte';
	import { api } from '../../convex/_generated/api';
	import type { Id } from '../../convex/_generated/dataModel';
	import { LOBBY_NAME_MAX } from '#lib/game/lobby.js';

	const character = useQuery(api.characters.mine, {});
	const mine = useQuery(api.lobbies.mine, {});
	const lobbies = useQuery(api.lobbies.listOpen, {});
	const create = useMutation(api.lobbies.create);
	const join = useMutation(api.lobbies.join);

	// A player is in at most one lobby, so the browser sends them straight back to it.
	$effect(() => {
		if (mine.data)
			goto(resolve('/lobbies/[lobbyId]', { lobbyId: mine.data._id }), { replaceState: true });
	});

	let name = $state('');
	let busy = $state(false);
	let error = $state<string | null>(null);

	async function enter(action: () => Promise<Id<'lobbies'>>) {
		if (busy) return;
		busy = true;
		error = null;
		try {
			const lobbyId = await action();
			await goto(resolve('/lobbies/[lobbyId]', { lobbyId }));
		} catch (e) {
			error = e instanceof ConvexError ? String(e.data) : 'Something went wrong. Try again.';
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>Lobbies · REN</title>
</svelte:head>

<div class="mx-auto max-w-2xl px-4 py-8">
	<a href={resolve('/')} class="pixel text-[10px] text-bone-2 hover:text-rot">◀ Back</a>

	<header class="mt-6">
		<p class="pixel text-[10px] text-rot">Play</p>
		<h1 class="mt-2 pixel text-2xl text-bone pixel-shadow-sm sm:text-3xl">Find a party</h1>
		<p class="mt-3 text-bone-2">Join an open lobby, or start your own and lead it.</p>
	</header>

	{#if character.isLoading || mine.isLoading || mine.data}
		<p class="mt-10 animate-blink pixel text-xs text-ash">Loading…</p>
	{:else if !character.data}
		<div class="pixel-box mt-8 flex flex-col gap-4 bg-surface p-5">
			<p class="text-bone-2">You need a survivor before you can join a party.</p>
			<a href={resolve('/character')} class="menu-item pixel-box-rot">
				<span class="arrow">▶</span> Roll a survivor
			</a>
		</div>
	{:else}
		<form
			class="pixel-box mt-8 flex flex-col gap-3 bg-surface p-5 sm:flex-row sm:items-end"
			onsubmit={(e) => {
				e.preventDefault();
				enter(() => create({ name: name.trim() || undefined }));
			}}
		>
			<label class="flex flex-1 flex-col gap-2">
				<span class="pixel text-[8px] text-ash">Lobby name</span>
				<input
					type="text"
					bind:value={name}
					maxlength={LOBBY_NAME_MAX}
					placeholder="{character.data.name}'s party"
					autocomplete="off"
					disabled={busy}
					class="pixel-box bg-ink-2 px-3 py-2 text-bone pixel-box-line-2 placeholder:text-ash focus:outline-none focus:[--px-color:var(--color-rot)]"
				/>
			</label>
			<button
				type="submit"
				disabled={busy}
				class="pixel-box pixel-btn bg-rot px-5 py-3 pixel text-[10px] text-ink pixel-box-rot-2 hover:bg-rot-2 disabled:opacity-40 sm:w-auto"
			>
				Create lobby
			</button>
		</form>

		{#if error}
			<p class="mt-4 text-base text-blood" role="alert">{error}</p>
		{/if}

		<section class="mt-8">
			<h2 class="pixel text-[10px] text-ash">Open lobbies</h2>
			{#if lobbies.isLoading}
				<p class="mt-4 animate-blink pixel text-xs text-ash">Loading…</p>
			{:else if !lobbies.data?.length}
				<p class="mt-4 text-bone-2">No open lobbies right now. Create one and others can join.</p>
			{:else}
				<ul class="mt-4 flex flex-col gap-3">
					{#each lobbies.data as lobby (lobby._id)}
						<li class="pixel-box flex items-center gap-4 bg-surface px-5 py-3">
							<div class="min-w-0 flex-1">
								<div class="truncate text-bone">{lobby.name}</div>
								{#if lobby.hostName}
									<div class="text-base text-ash">Led by {lobby.hostName}</div>
								{/if}
							</div>
							<span class="pixel text-[10px] text-bone-2">
								{lobby.playerCount} / {lobby.maxPlayers}
							</span>
							<button
								type="button"
								disabled={busy}
								onclick={() => enter(() => join({ lobbyId: lobby._id }))}
								class="pixel-box pixel-btn w-auto bg-surface-2 px-4 py-2 pixel text-[10px] text-rot pixel-box-rot hover:bg-rot-3 disabled:opacity-40"
							>
								Join
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/if}
</div>
