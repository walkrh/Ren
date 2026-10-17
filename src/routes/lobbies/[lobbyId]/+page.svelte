<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { ConvexError } from 'convex/values';
	import { useMutation, useQuery } from 'convex-svelte';
	import { api } from '../../../convex/_generated/api';
	import type { Id } from '../../../convex/_generated/dataModel';
	import { LOBBY_NAME_MAX, lobbyNameError } from '#lib/game/lobby.js';
	import { constellations, origins, races } from '#lib/game/traits.js';

	const lobbyId = $derived(page.params.lobbyId as Id<'lobbies'>);
	const viewer = useQuery(api.users.viewer, () => ({}));
	const lobby = useQuery(api.lobbies.get, () => ({ lobbyId }));
	const join = useMutation(api.lobbies.join);
	const leave = useMutation(api.lobbies.leave);
	const setReady = useMutation(api.lobbies.setReady);
	const rename = useMutation(api.lobbies.rename);
	const kick = useMutation(api.lobbies.kick);
	const start = useMutation(api.lobbies.start);

	const members = $derived(
		[...(lobby.data?.members ?? [])].sort((a, b) => a.joinedAt - b.joinedAt)
	);
	const me = $derived(members.find((m) => m.userId === viewer.data?.id));
	const isLeader = $derived(!!me && lobby.data?.hostUserId === me.userId);
	const readyCount = $derived(members.filter((m) => m.ready).length);
	const everyoneReady = $derived(members.length > 0 && readyCount === members.length);
	const isFull = $derived(!!lobby.data && members.length >= lobby.data.maxPlayers);
	const emptySlots = $derived(Math.max(0, (lobby.data?.maxPlayers ?? 0) - members.length));

	// When the leader starts, every member's page follows them into the run.
	$effect(() => {
		const l = lobby.data;
		if (me && l?.status === 'in_game' && l.gameId)
			goto(resolve('/game/[gameId]', { gameId: l.gameId }), { replaceState: true });
	});

	// Dropping out of the member list without pressing Leave means the leader kicked us.
	let wasMember = $state(false);
	let kicked = $state(false);
	let leaving = false;
	$effect(() => {
		if (me) {
			wasMember = true;
			kicked = false;
		} else if (wasMember && lobby.data && !leaving) {
			wasMember = false;
			kicked = true;
		}
	});

	let busy = $state(false);
	let error = $state<string | null>(null);
	async function act(action: () => Promise<unknown>) {
		if (busy) return false;
		busy = true;
		error = null;
		try {
			await action();
			return true;
		} catch (e) {
			error = e instanceof ConvexError ? String(e.data) : 'Something went wrong. Try again.';
			return false;
		} finally {
			busy = false;
		}
	}

	async function leaveLobby() {
		leaving = true;
		if (await act(() => leave({ lobbyId }))) await goto(resolve('/lobbies'));
		else leaving = false;
	}

	let editing = $state(false);
	let draftName = $state('');
	const draftError = $derived(editing ? lobbyNameError(draftName) : null);
	function startRename() {
		draftName = lobby.data?.name ?? '';
		editing = true;
	}
	async function saveName() {
		if (draftError) return;
		if (await act(() => rename({ lobbyId, name: draftName }))) editing = false;
	}

	const traitName = (list: readonly { id: string; name: string }[], id: string | undefined) =>
		list.find((t) => t.id === id)?.name ?? '?';

	// Seats are numbered like a manuscript's chapters.
	const numerals = ['I', 'II', 'III', 'IV', 'V', 'VI'];
</script>

<svelte:head>
	<title>{lobby.data?.name ?? 'Lobby'} · REN</title>
</svelte:head>

<div class="mx-auto max-w-5xl px-4 py-8">
	{#if me}
		<button
			type="button"
			onclick={leaveLobby}
			disabled={busy}
			class="caps text-bone-2 transition-colors hover:text-blood disabled:opacity-40"
		>
			← Leave lobby
		</button>
	{:else}
		<a href={resolve('/lobbies')} class="caps text-bone-2 transition-colors hover:text-gold-3"
			>← Lobbies</a
		>
	{/if}

	{#if lobby.isLoading || viewer.isLoading}
		<p class="mt-10 animate-flicker text-ash italic">Loading…</p>
	{:else if lobby.error}
		<p class="mt-10 text-blood" role="alert">Could not load this lobby. Refresh to try again.</p>
	{:else if !lobby.data || lobby.data.status === 'closed'}
		<div class="mt-10 flex max-w-md flex-col gap-4 panel p-5">
			<p class="text-bone-2">This lobby has closed.</p>
			<a href={resolve('/lobbies')} class="btn btn-ghost">Find another party</a>
		</div>
	{:else}
		<header class="mt-6">
			<p class={['caps', lobby.data.status === 'in_game' ? 'text-blood' : 'text-gold']}>
				{lobby.data.status === 'in_game' ? 'In battle' : 'Gathering'}
			</p>
			{#if editing}
				<form
					class="mt-3 flex max-w-2xl flex-col gap-2 sm:flex-row sm:items-center"
					onsubmit={(e) => {
						e.preventDefault();
						saveName();
					}}
				>
					<!-- svelte-ignore a11y_autofocus -->
					<input
						type="text"
						bind:value={draftName}
						maxlength={LOBBY_NAME_MAX}
						autocomplete="off"
						autofocus
						disabled={busy}
						aria-label="Lobby name"
						onkeydown={(e) => e.key === 'Escape' && (editing = false)}
						class="flex-1 rounded-[2px] border border-line-2 bg-ink-2 px-3 py-2 font-heading text-lg text-bone transition-colors focus:border-gold focus:outline-none"
					/>
					<div class="flex gap-2">
						<button
							type="submit"
							disabled={busy || !!draftError}
							class="btn flex-1 btn-gold px-4 py-2 sm:flex-none"
						>
							Save
						</button>
						<button
							type="button"
							onclick={() => (editing = false)}
							class="btn flex-1 btn-ghost px-4 py-2 sm:flex-none"
						>
							Cancel
						</button>
					</div>
				</form>
				{#if draftError}<p class="mt-2 text-base text-blood">{draftError}</p>{/if}
			{:else}
				<div class="mt-2 flex items-baseline gap-4">
					<h1 class="min-w-0 truncate gilded font-display text-3xl font-bold sm:text-5xl">
						{lobby.data.name}
					</h1>
					{#if isLeader && lobby.data.status === 'open'}
						<button
							type="button"
							onclick={startRename}
							class="shrink-0 caps text-ash transition-colors hover:text-gold-3">Rename</button
						>
					{/if}
				</div>
			{/if}
			<div class="mt-4 flex items-center gap-4 text-gold-2" aria-hidden="true">
				<span class="h-px w-16 bg-linear-to-r from-transparent to-gold-2"></span>
				<span class="text-gold">✠</span>
				<span class="h-px flex-1 bg-linear-to-r from-gold-2 to-transparent"></span>
			</div>
		</header>

		{#if kicked}
			<p class="mt-6 text-base text-blood" role="alert">The leader removed you from this lobby.</p>
		{/if}

		<!-- The party: one card per seat -->
		<ul class="mt-8 grid gap-4 sm:grid-cols-3" aria-label="Party">
			{#each members as m, i (m._id)}
				{@const leader = m.userId === lobby.data.hostUserId}
				{@const you = m.userId === me?.userId}
				<li
					class={[
						'relative flex flex-col panel p-5 transition-[border-color,box-shadow] duration-300',
						(m.ready || leader) && 'panel-lit'
					]}
				>
					<div class="flex items-center justify-between">
						<span class="font-display text-lg font-bold text-gold-2">{numerals[i]}</span>
						{#if leader}
							<span class="caps text-gold">♛ Leader</span>
						{:else}
							<span class={['caps', m.ready ? 'text-gold-3' : 'text-ash']}>
								{m.ready ? '✓ Ready' : 'Not ready'}
							</span>
						{/if}
					</div>

					<div class="mt-5 flex items-baseline gap-2">
						<span
							class={[
								'min-w-0 truncate font-display text-2xl font-bold',
								m.ready || leader ? 'gilded' : 'text-bone'
							]}
						>
							{m.character?.name ?? 'Unknown survivor'}
						</span>
						{#if you}<span class="shrink-0 caps text-bone-2">(you)</span>{/if}
					</div>

					<dl class="mt-3 grid grid-cols-[4.5rem_1fr] gap-y-1 text-base">
						<dt class="pt-0.5 caps text-ash">Race</dt>
						<dd class="text-bone-2">{traitName(races, m.character?.race)}</dd>
						<dt class="pt-0.5 caps text-ash">Origin</dt>
						<dd class="text-bone-2">{traitName(origins, m.character?.origin)}</dd>
						<dt class="pt-0.5 caps text-ash">Stars</dt>
						<dd class="text-bone-2">
							{traitName(constellations, m.character?.constellation)}
						</dd>
					</dl>

					{#if isLeader && !leader && lobby.data.status === 'open'}
						<button
							type="button"
							disabled={busy}
							onclick={() => act(() => kick({ lobbyId, userId: m.userId }))}
							class="mt-4 self-start caps text-ash transition-colors hover:text-blood disabled:opacity-40"
						>
							Remove from party
						</button>
					{/if}
				</li>
			{/each}
			{#each { length: emptySlots }, slot (slot)}
				<li
					class="flex min-h-48 flex-col border border-dashed border-line-2 p-5 text-ash"
					aria-label="Empty seat"
				>
					<span class="font-display text-lg font-bold text-line-2">
						{numerals[members.length + slot]}
					</span>
					<span class="m-auto animate-flicker italic">Awaiting a survivor…</span>
				</li>
			{/each}
		</ul>

		<!-- Action bar -->
		<div class="mt-8 flex flex-col gap-4 panel p-5 sm:flex-row sm:items-center sm:justify-between">
			<div>
				{#if lobby.data.status === 'in_game'}
					<p class="text-bone-2">This party is mid-run. Check back when they return.</p>
				{:else}
					<p class="font-heading font-semibold text-bone">
						<span class={everyoneReady ? 'text-gold-3' : 'text-bone'}>{readyCount}</span>
						/ {members.length} ready
					</p>
					<p class="text-base text-ash italic">
						{#if isLeader}
							{everyoneReady ? 'Your party awaits the order.' : 'Waiting on your party.'}
						{:else if me}
							The leader starts the run once everyone is ready.
						{:else if isFull}
							This lobby is full.
						{:else}
							There's a seat open for you.
						{/if}
					</p>
				{/if}
			</div>

			{#if lobby.data.status === 'open'}
				{#if isLeader}
					<button
						type="button"
						disabled={busy || !everyoneReady}
						onclick={() => act(() => start({ lobbyId }))}
						class="btn btn-gold sm:min-w-56"
					>
						{everyoneReady
							? members.length === 1
								? 'Start solo'
								: 'Start run'
							: 'Waiting for ready…'}
					</button>
				{:else if me}
					<button
						type="button"
						disabled={busy}
						onclick={() => act(() => setReady({ lobbyId, ready: !me.ready }))}
						class={['btn sm:min-w-56', me.ready ? 'btn-ghost' : 'btn-gold']}
					>
						{me.ready ? 'Not ready' : 'Ready'}
					</button>
				{:else if !isFull}
					<button
						type="button"
						disabled={busy}
						onclick={() => act(() => join({ lobbyId }))}
						class="btn btn-gold sm:min-w-56"
					>
						Join lobby
					</button>
				{/if}
			{/if}
		</div>

		{#if error}
			<p class="mt-4 text-base text-blood" role="alert">{error}</p>
		{/if}
	{/if}
</div>
