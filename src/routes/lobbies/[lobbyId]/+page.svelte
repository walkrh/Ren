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
	const viewer = useQuery(api.users.viewer, {});
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
	const everyoneReady = $derived(members.length > 0 && members.every((m) => m.ready));
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
</script>

<svelte:head>
	<title>{lobby.data?.name ?? 'Lobby'} · REN</title>
</svelte:head>

<div class="mx-auto max-w-2xl px-4 py-8">
	{#if me}
		<button
			type="button"
			onclick={leaveLobby}
			disabled={busy}
			class="pixel text-[10px] text-bone-2 hover:text-blood disabled:opacity-40"
		>
			◀ Leave lobby
		</button>
	{:else}
		<a href={resolve('/lobbies')} class="pixel text-[10px] text-bone-2 hover:text-rot">◀ Lobbies</a>
	{/if}

	{#if lobby.isLoading || viewer.isLoading}
		<p class="mt-10 animate-blink pixel text-xs text-ash">Loading…</p>
	{:else if !lobby.data || lobby.data.status === 'closed'}
		<p class="mt-10 text-bone-2">This lobby has closed.</p>
	{:else}
		<header class="mt-6">
			<p class="pixel text-[10px] text-rot">
				{lobby.data.status === 'in_game' ? 'In game' : 'Lobby'}
			</p>
			{#if editing}
				<form
					class="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center"
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
						onkeydown={(e) => e.key === 'Escape' && (editing = false)}
						class="pixel-box flex-1 bg-ink-2 px-3 py-2 text-bone pixel-box-line-2 focus:outline-none focus:[--px-color:var(--color-rot)]"
					/>
					<div class="flex gap-2">
						<button
							type="submit"
							disabled={busy || !!draftError}
							class="pixel-box pixel-btn w-auto bg-rot px-4 py-2 pixel text-[10px] text-ink pixel-box-rot-2 disabled:opacity-40"
						>
							Save
						</button>
						<button
							type="button"
							onclick={() => (editing = false)}
							class="pixel-box pixel-btn w-auto bg-surface px-4 py-2 pixel text-[10px] text-bone-2"
						>
							Cancel
						</button>
					</div>
				</form>
				{#if draftError}<p class="mt-2 text-base text-blood">{draftError}</p>{/if}
			{:else}
				<div class="mt-2 flex items-center gap-3">
					<h1 class="min-w-0 truncate pixel text-2xl text-bone pixel-shadow-sm sm:text-3xl">
						{lobby.data.name}
					</h1>
					{#if isLeader && lobby.data.status === 'open'}
						<button
							type="button"
							onclick={startRename}
							class="pixel text-[8px] text-ash hover:text-rot">Rename</button
						>
					{/if}
				</div>
			{/if}
		</header>

		{#if kicked}
			<p class="mt-6 text-base text-blood" role="alert">The leader removed you from this lobby.</p>
		{/if}

		<ul class="mt-8 flex flex-col gap-3">
			{#each members as m (m._id)}
				{@const leader = m.userId === lobby.data.hostUserId}
				<li
					class="pixel-box flex items-center gap-4 bg-surface px-5 py-3"
					class:pixel-box-rot={m.userId === me?.userId}
				>
					<span class="w-4 text-gold" title={leader ? 'Leader' : undefined}
						>{leader ? '♛' : ''}</span
					>
					<div class="min-w-0 flex-1">
						<div class="truncate text-bone">{m.character?.name ?? 'Unknown survivor'}</div>
						<div class="truncate text-base text-ash">
							{traitName(races, m.character?.race)} · {traitName(origins, m.character?.origin)} ·
							{traitName(constellations, m.character?.constellation)}
						</div>
					</div>
					{#if leader}
						<span class="pixel text-[8px] text-gold">Leader</span>
					{:else}
						<span class="pixel text-[8px] {m.ready ? 'text-rot' : 'text-ash'}">
							{m.ready ? 'Ready' : 'Not ready'}
						</span>
					{/if}
					{#if isLeader && !leader && lobby.data.status === 'open'}
						<button
							type="button"
							disabled={busy}
							onclick={() => act(() => kick({ lobbyId, userId: m.userId }))}
							class="pixel text-[8px] text-ash hover:text-blood disabled:opacity-40">Kick</button
						>
					{/if}
				</li>
			{/each}
			{#each [...Array(emptySlots).keys()] as slot (slot)}
				<li class="pixel-box flex items-center gap-4 bg-ink-2 px-5 py-3 text-ash">
					<span class="w-4"></span>
					<span class="animate-blink">Waiting for a survivor…</span>
				</li>
			{/each}
		</ul>

		<div class="mt-8 flex flex-col gap-3">
			{#if lobby.data.status === 'in_game'}
				<p class="text-bone-2">This party is mid-run. Check back when they return.</p>
			{:else if isLeader}
				<button
					type="button"
					disabled={busy || !everyoneReady}
					onclick={() => act(() => start({ lobbyId }))}
					class="menu-item pixel-box-rot"
				>
					<span class="arrow">▶</span>
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
					class="menu-item {me.ready ? '' : 'pixel-box-rot'}"
				>
					<span class="arrow">▶</span>
					{me.ready ? 'Not ready' : 'Ready'}
				</button>
				<p class="text-base text-ash">The leader starts the run once everyone is ready.</p>
			{:else if isFull}
				<p class="text-bone-2">This lobby is full.</p>
			{:else}
				<button
					type="button"
					disabled={busy}
					onclick={() => act(() => join({ lobbyId }))}
					class="menu-item pixel-box-rot"
				>
					<span class="arrow">▶</span> Join lobby
				</button>
			{/if}

			{#if error}
				<p class="text-base text-blood" role="alert">{error}</p>
			{/if}
		</div>
	{/if}
</div>
