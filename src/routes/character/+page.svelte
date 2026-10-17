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

	const existing = useQuery(api.characters.mine, {});
	const save = useMutation(api.characters.save);

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
		spinsDone === 3 && name.trim().length > 0 && nameError === null && !saving
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
	<a href={resolve('/')} class="pixel text-[10px] text-bone-2 hover:text-rot">◀ Back</a>

	{#if !loaded}
		<p class="mt-10 animate-blink pixel text-xs text-ash">Loading…</p>
	{:else}
		<header class="mt-6 max-w-2xl">
			<p class="pixel text-[10px] text-rot">Customize</p>
			<h1 class="mt-2 pixel text-2xl text-bone pixel-shadow-sm sm:text-3xl">Roll your survivor</h1>
			<p class="mt-3 text-bone-2">
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
					class="pixel-box flex flex-col gap-4 bg-surface p-5"
					onsubmit={(e) => {
						e.preventDefault();
						confirm();
					}}
				>
					<label class="flex flex-col gap-2">
						<span class="pixel text-[8px] text-ash">Name</span>
						<input
							type="text"
							bind:value={name}
							maxlength={CHARACTER_NAME_MAX}
							placeholder="What do they call you?"
							autocomplete="off"
							disabled={saving}
							class="pixel-box bg-ink-2 px-3 py-2 text-bone pixel-box-line-2 placeholder:text-ash focus:outline-none focus:[--px-color:var(--color-rot)]"
						/>
					</label>
					{#if nameError}
						<p class="text-base text-blood">{nameError}</p>
					{/if}

					<div class="flex items-center justify-between text-base text-ash">
						<span>Spins</span>
						<span class="pixel text-[10px] {spinsDone === 3 ? 'text-rot' : 'text-bone-2'}"
							>{spinsDone} / 3</span
						>
					</div>

					<button
						type="submit"
						disabled={!canSave}
						class="pixel-box pixel-btn bg-rot py-3 pixel text-[10px] text-ink pixel-box-rot-2 hover:bg-rot-2 disabled:opacity-40"
					>
						{saving ? 'Saving…' : 'Save survivor'}
					</button>

					{#if error}
						<p class="text-base text-blood" role="alert">{error}</p>
					{/if}
				</form>
			</aside>
		</div>
	{/if}
</div>
