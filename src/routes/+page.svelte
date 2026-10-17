<script lang="ts">
	import { resolve } from '$app/paths';
	import { useQuery } from 'convex-svelte';
	import { api } from '../convex/_generated/api';
	import type { PageProps } from './$types';
	import Crest from '#lib/components/Crest.svelte';
	import TitleBurn from '#lib/components/TitleBurn.svelte';
	import LoreIntro from '#lib/components/LoreIntro.svelte';
	import { tick } from 'svelte';

	let { data }: PageProps = $props();

	// Title screen burns away, the lore plays once per session, then the menu takes over.
	const LORE_KEY = 'ren:lore-seen';
	let titleDone = $state(false);
	let lore = $state<'off' | 'waiting' | 'done'>('off');
	const entered = $derived(titleDone && lore !== 'waiting');

	function startLore() {
		try {
			if (sessionStorage.getItem(LORE_KEY)) return;
			sessionStorage.setItem(LORE_KEY, '1');
		} catch {
			// Storage can be blocked; the lore then plays every visit
		}
		lore = 'waiting';
	}

	async function focusMenu() {
		await tick();
		menu?.querySelector<HTMLElement>('[data-menu-item]')?.focus();
	}

	const character = useQuery(api.characters.mine, () => ({}));
	const hasCharacter = $derived(!!character.data);

	// Shared look for every title-screen menu entry and its hover ornaments.
	const menuItem =
		'group flex w-full cursor-pointer items-center justify-center gap-4 px-5 py-3 font-heading text-base font-semibold tracking-[0.22em] uppercase outline-none transition-colors duration-200 not-disabled:hover:text-gold-3 focus-visible:text-gold-3 disabled:cursor-not-allowed disabled:text-ash';
	const mark =
		'text-sm text-gold opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100';

	// Arrow keys move between menu entries, like a console title screen.
	let menu: HTMLElement | undefined = $state();
	function onkeydown(e: KeyboardEvent) {
		if (!entered || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
		const items = [...(menu?.querySelectorAll<HTMLElement>('[data-menu-item]') ?? [])];
		if (!items.length) return;
		const i = items.indexOf(document.activeElement as HTMLElement);
		const next =
			e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
		items[next].focus();
		e.preventDefault();
	}
</script>

<svelte:window {onkeydown} />

<!-- Hero art from /static/art/hero.jpg; the gradient shows until it exists -->
<div
	aria-hidden="true"
	class="pointer-events-none fixed inset-0 bg-ink bg-[url(/art/hero.jpg)] bg-cover bg-center"
></div>
<div
	aria-hidden="true"
	class="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_70%_55%_at_50%_45%,rgb(12_10_8/0.35),rgb(12_10_8/0.92)),linear-gradient(to_bottom,rgb(12_10_8/0.2),rgb(90_14_14/0.25)_70%,rgb(12_10_8))]"
></div>

{#if !titleDone}
	<TitleBurn
		onburn={startLore}
		ondone={() => {
			titleDone = true;
			if (lore !== 'waiting') focusMenu();
		}}
	/>
{/if}

{#if lore === 'waiting'}
	<LoreIntro
		playing={titleDone}
		ondone={() => {
			lore = 'done';
			focusMenu();
		}}
	/>
{/if}

<div
	inert={!entered}
	class="relative flex min-h-dvh flex-col items-center justify-center px-4 py-12"
>
	<!-- Title -->
	<div class="flex flex-col items-center gap-5 text-center">
		<Crest size={88} class="drop-shadow-[0_0_18px_rgb(201_162_74/0.35)]" />
		<h1 class="gilded font-display text-7xl font-black tracking-[0.12em] sm:text-9xl">Ren</h1>
		<div class="flex items-center gap-4 text-gold-2" aria-hidden="true">
			<span class="h-px w-16 bg-linear-to-r from-transparent to-gold-2"></span>
			<span class="text-gold">✠</span>
			<span class="h-px w-16 bg-linear-to-l from-transparent to-gold-2"></span>
		</div>
		<p class="text-xl text-bone-2 italic">Wave survival · co-op</p>
	</div>

	<!-- Menu -->
	<nav bind:this={menu} class="mt-12 flex w-full max-w-xs flex-col gap-1" aria-label="Main menu">
		{#if !data.user}
			<a href={resolve('/sign-in')} data-menu-item class={[menuItem, 'text-gold-3']}>
				<span class={mark}>❖</span> Play <span class={mark}>❖</span>
			</a>
		{:else if hasCharacter}
			<a href={resolve('/lobbies')} data-menu-item class={[menuItem, 'text-gold-3']}>
				<span class={mark}>❖</span> Play <span class={mark}>❖</span>
			</a>
		{:else}
			<a href={resolve('/character')} data-menu-item class={[menuItem, 'text-gold-3']}>
				<span class={mark}>❖</span> Play <span class={mark}>❖</span>
			</a>
		{/if}

		<a href={resolve('/character')} data-menu-item class={[menuItem, 'text-bone']}>
			<span class={mark}>❖</span> Customize <span class={mark}>❖</span>
		</a>

		{#if data.user}
			<form method="POST" action={resolve('/sign-out')} class="contents">
				<button data-menu-item class={[menuItem, 'text-bone']}>
					<span class={mark}>❖</span> Sign out <span class={mark}>❖</span>
				</button>
			</form>
		{:else}
			<a href={resolve('/sign-in')} data-menu-item class={[menuItem, 'text-bone']}>
				<span class={mark}>❖</span> Sign in <span class={mark}>❖</span>
			</a>
		{/if}
	</nav>

	<p class="mt-10 h-6 text-base text-ash italic">
		{#if data.user}
			{#if character.isLoading}
				Loading survivor…
			{:else if character.data}
				Survivor: <span class="text-bone-2 not-italic">{character.data.name}</span>
			{:else}
				No survivor yet. Customize to roll one.
			{/if}
		{:else}
			<span class="animate-flicker">Press start</span>
		{/if}
	</p>
</div>
