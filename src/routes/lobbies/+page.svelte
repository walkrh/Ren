<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { ConvexError } from 'convex/values';
	import { useMutation, useQuery } from 'convex-svelte';
	import { api } from '../../convex/_generated/api';
	import type { Id } from '../../convex/_generated/dataModel';
	import { LOBBY_NAME_MAX } from '#lib/game/lobby.js';
	import { findConstellation, findOrigin, findRace } from '#lib/game/traits.js';

	const character = useQuery(api.characters.mine, () => ({}));
	const mine = useQuery(api.lobbies.mine, () => ({}));
	const lobbies = useQuery(api.lobbies.listOpen, () => ({}));
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

<div class="mx-auto max-w-5xl px-4 py-8">
	<a href={resolve('/')} class="caps text-bone-2 transition-colors hover:text-gold-3">← Back</a>

	<header class="mt-6 max-w-2xl">
		<p class="caps text-gold">The muster</p>
		<h1 class="mt-2 gilded font-display text-3xl font-bold sm:text-5xl">Find a party</h1>
		<p class="mt-4 text-lg text-bone-2">
			Three survivors to a banner. Ride under one already raised, or raise your own and lead it.
		</p>
	</header>

	{#if character.isLoading || mine.isLoading || mine.data}
		<p class="mt-10 animate-flicker text-ash italic">Loading…</p>
	{:else if !character.data}
		<div class="mt-8 flex max-w-md flex-col gap-4 panel p-5">
			<p class="text-bone-2">You need a survivor before you can join a party.</p>
			<a href={resolve('/character')} class="btn btn-gold">Roll a survivor</a>
		</div>
	{:else}
		<div class="mt-8 grid gap-8 lg:grid-cols-[1fr_20rem]">
			<!-- Open lobbies -->
			<section aria-labelledby="open-heading">
				<div class="flex items-center gap-4">
					<h2 id="open-heading" class="caps text-ash">Open banners</h2>
					<span class="h-px flex-1 bg-linear-to-r from-line-2 to-transparent"></span>
					{#if lobbies.data?.length}
						<span class="caps text-bone-2">{lobbies.data.length}</span>
					{/if}
				</div>

				{#if lobbies.isLoading}
					<p class="mt-6 animate-flicker text-ash italic">Loading…</p>
				{:else if lobbies.error}
					<p class="mt-6 text-blood" role="alert">Could not load lobbies. Refresh to try again.</p>
				{:else if !lobbies.data?.length}
					<div
						class="mt-4 flex flex-col items-center gap-2 border border-dashed border-line-2 px-6 py-12 text-center"
					>
						<span class="text-gold" aria-hidden="true">✠</span>
						<p class="text-bone-2 italic">No banners raised. Raise one and others can join.</p>
					</div>
				{:else}
					<ul class="mt-4 flex flex-col gap-3">
						{#each lobbies.data as lobby (lobby._id)}
							<li
								class="flex items-center gap-4 panel px-5 py-4 transition-colors hover:border-gold-2"
							>
								<div class="min-w-0 flex-1">
									<div class="truncate font-heading text-lg font-semibold text-bone">
										{lobby.name}
									</div>
									{#if lobby.hostName}
										<div class="truncate text-base text-ash italic">Led by {lobby.hostName}</div>
									{/if}
								</div>
								<div
									class="flex flex-col items-end gap-1"
									title="{lobby.playerCount} of {lobby.maxPlayers} seats taken"
								>
									<div class="flex gap-1.5" aria-hidden="true">
										{#each { length: lobby.maxPlayers }, i (i)}
											<span
												class={[
													'size-2.5 rotate-45 border',
													i < lobby.playerCount ? 'border-gold-2 bg-gold' : 'border-line-2'
												]}
											></span>
										{/each}
									</div>
									<span class="caps text-bone-2">{lobby.playerCount} / {lobby.maxPlayers}</span>
								</div>
								<button
									type="button"
									disabled={busy}
									onclick={() => enter(() => join({ lobbyId: lobby._id }))}
									class="btn btn-ghost px-4 py-2"
									aria-label="Join {lobby.name}"
								>
									Join
								</button>
							</li>
						{/each}
					</ul>
				{/if}

				{#if error}
					<p class="mt-4 text-base text-blood" role="alert">{error}</p>
				{/if}
			</section>

			<!-- Create + who you're riding as -->
			<aside class="flex flex-col gap-6">
				<form
					class="flex flex-col gap-4 panel panel-lit p-5"
					onsubmit={(e) => {
						e.preventDefault();
						enter(() => create({ name: name.trim() || undefined }));
					}}
				>
					<div>
						<h2 class="font-heading text-lg font-semibold text-bone">Raise a banner</h2>
						<p class="mt-1 text-base leading-tight text-bone-2 italic">
							You lead, and you start the run once everyone is ready.
						</p>
					</div>
					<label class="flex flex-col gap-2">
						<span class="caps text-ash">Lobby name</span>
						<input
							type="text"
							bind:value={name}
							maxlength={LOBBY_NAME_MAX}
							placeholder="{character.data.name}'s party"
							autocomplete="off"
							disabled={busy}
							class="rounded-[2px] border border-line-2 bg-ink-2 px-3 py-2 text-bone transition-colors placeholder:text-ash placeholder:italic focus:border-gold focus:outline-none"
						/>
					</label>
					<button type="submit" disabled={busy} class="btn btn-gold">Create lobby</button>
				</form>

				<div class="panel px-5 py-4">
					<div class="caps text-ash">Riding as</div>
					<div class="mt-1 truncate gilded font-display text-2xl font-bold">
						{character.data.name}
					</div>
					<div class="mt-1 text-base text-bone-2">
						{findRace(character.data.race).name} · {findOrigin(character.data.origin).name} ·
						{findConstellation(character.data.constellation).name}
					</div>
					<a
						href={resolve('/character')}
						class="mt-3 inline-block caps text-bone-2 transition-colors hover:text-gold-3"
					>
						Customize →
					</a>
				</div>
			</aside>
		</div>
	{/if}
</div>
