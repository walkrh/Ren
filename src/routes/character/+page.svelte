<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { ConvexError } from 'convex/values';
	import { useMutation, useQuery } from 'convex-svelte';
	import { api } from '../../convex/_generated/api';
	import SpinReel from '#lib/components/SpinReel.svelte';
	import CharacterSheet from '#lib/components/CharacterSheet.svelte';
	import {
		CHARACTER_NAME_MAX,
		constellations,
		origins,
		races,
		validateCharacterName,
		type ConstellationId,
		type OriginId,
		type RaceId
	} from '#lib/game/traits.js';

	const existing = useQuery(api.characters.mine, () => ({}));
	const save = useMutation(api.characters.save);
	const lobby = useQuery(api.lobbies.mine, () => ({}));

	let name = $state('');
	let race = $state<RaceId | null>(null);
	let origin = $state<OriginId | null>(null);
	let constellation = $state<ConstellationId | null>(null);

	// Start from the saved survivor, once, so the player can re-roll from where they left off.
	let loaded = $state(false);
	$effect(() => {
		if (loaded || existing.isLoading) return;
		loaded = true;
		if (existing.data) {
			name = existing.data.name;
			race = existing.data.race;
			origin = existing.data.origin;
			constellation = existing.data.constellation;
		}
	});

	let saving = $state(false);
	let error = $state<string | null>(null);

	const spinsDone = $derived([race, origin, constellation].filter(Boolean).length);
	const nameError = $derived(name.trim() ? validateCharacterName(name) : null);
	const canSave = $derived(
		spinsDone === 3 && name.trim().length > 0 && nameError === null && !saving && !lobby.data
	);

	async function confirm() {
		if (!canSave || !race || !origin || !constellation) return;
		saving = true;
		error = null;
		try {
			await save({ name, race, origin, constellation });
			await goto(resolve('/'));
		} catch (e) {
			error =
				e instanceof ConvexError ? String(e.data) : 'Could not save your survivor. Try again.';
			saving = false;
		}
	}
</script>

<svelte:head>
	<title>Customize · REN</title>
</svelte:head>

<div class="mx-auto max-w-6xl px-4 py-8">
	<a href={resolve('/')} class="caps text-bone-2 transition-colors hover:text-gold-3">← Back</a>

	{#if !loaded}
		<p class="mt-10 animate-flicker text-ash italic">Loading…</p>
	{:else}
		<header class="mt-6 max-w-2xl">
			<h1 class="gilded font-display text-3xl font-bold sm:text-5xl">Roll your survivor</h1>
			<p class="mt-4 text-lg text-bone-2">
				Three spins: what you are, where you were born, and the stars above you. Not happy? Roll
				again as many times as you like, then save.
			</p>
		</header>

		<div class="mt-8 grid gap-8 xl:grid-cols-[1.4fr_1fr]">
			<div
				class="grid content-start gap-4 self-start sm:grid-cols-3 sm:grid-rows-[auto_auto_auto_auto]"
			>
				<SpinReel
					slot={1}
					label="Race"
					hint="Human luck. What you are."
					options={races}
					bind:value={race}
					disabled={saving}
				/>
				<SpinReel
					slot={2}
					label="Origin"
					hint="Earth luck. Where you were born."
					options={origins}
					bind:value={origin}
					disabled={saving}
				/>
				<SpinReel
					slot={3}
					label="Stars"
					hint="Heaven luck. Your ability."
					options={constellations}
					bind:value={constellation}
					disabled={saving}
				/>
			</div>

			<aside class="flex flex-col gap-6">
				<CharacterSheet {name} {race} {origin} {constellation} />

				<form
					class="flex flex-col gap-4 panel p-5"
					onsubmit={(e) => {
						e.preventDefault();
						confirm();
					}}
				>
					<label class="flex flex-col gap-2">
						<span class="caps text-ash">Name</span>
						<input
							type="text"
							bind:value={name}
							maxlength={CHARACTER_NAME_MAX}
							placeholder="What do they call you?"
							autocomplete="off"
							disabled={saving}
							class="rounded-[2px] border border-line-2 bg-ink-2 px-3 py-2 text-bone transition-colors placeholder:text-ash placeholder:italic focus:border-gold focus:outline-none"
						/>
					</label>
					{#if nameError}
						<p class="text-base text-blood">{nameError}</p>
					{/if}

					<div class="flex items-center justify-between text-base text-ash">
						<span>Spins</span>
						<span
							class={[
								'font-heading text-sm font-semibold',
								spinsDone === 3 ? 'text-gold-3' : 'text-bone-2'
							]}>{spinsDone} / 3</span
						>
					</div>

					<button type="submit" disabled={!canSave} class="btn btn-gold">
						{saving ? 'Saving…' : 'Save survivor'}
					</button>

					{#if lobby.data}
						<p class="text-base text-gold">
							Your survivor is locked while you're in
							<a
								href={resolve('/lobbies/[lobbyId]', { lobbyId: lobby.data._id })}
								class="underline hover:text-gold-3">{lobby.data.name}</a
							>. Leave the lobby to save changes.
						</p>
					{/if}
					{#if error}
						<p class="text-base text-blood" role="alert">{error}</p>
					{/if}
				</form>
			</aside>
		</div>
	{/if}
</div>
