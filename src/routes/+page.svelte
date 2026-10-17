<script lang="ts">
	import { resolve } from '$app/paths';
	import { useQuery } from 'convex-svelte';
	import { api } from '../convex/_generated/api';
	import type { PageProps } from './$types';
	import PixelSprite from '#lib/components/PixelSprite.svelte';
	import { zombieHead, zombiePalette } from '#lib/game/sprites.js';

	let { data }: PageProps = $props();

	const character = useQuery(api.characters.mine, {});
	const hasCharacter = $derived(!!character.data);

	// Arrow keys move between menu entries, like a console title screen.
	let menu: HTMLElement | undefined = $state();
	function onkeydown(e: KeyboardEvent) {
		if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
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

<div class="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
	<!-- Title -->
	<div class="flex flex-col items-center gap-6 text-center">
		<PixelSprite rows={zombieHead} palette={zombiePalette} scale={6} />
		<h1 class="pixel text-6xl text-rot pixel-shadow sm:text-8xl">Ren</h1>
		<p class="pixel text-[10px] text-bone-2 sm:text-xs">Wave survival · co-op</p>
	</div>

	<!-- Menu -->
	<nav bind:this={menu} class="mt-12 flex w-full max-w-xs flex-col gap-5" aria-label="Main menu">
		{#if !data.user}
			<a href={resolve('/sign-in')} data-menu-item class="menu-item pixel-box-rot">
				<span class="arrow">▶</span> Play
			</a>
		{:else if hasCharacter}
			<button type="button" disabled data-menu-item class="menu-item" title="Lobbies are next">
				<span class="arrow">▶</span> Play <span class="ml-auto text-[8px] text-ash">soon</span>
			</button>
		{:else}
			<a href={resolve('/character')} data-menu-item class="menu-item pixel-box-rot">
				<span class="arrow">▶</span> Play
			</a>
		{/if}

		<a href={resolve('/character')} data-menu-item class="menu-item">
			<span class="arrow">▶</span> Customize
		</a>

		{#if data.user}
			<form method="POST" action={resolve('/sign-out')} class="contents">
				<button data-menu-item class="menu-item">
					<span class="arrow">▶</span> Sign out
				</button>
			</form>
		{:else}
			<a href={resolve('/sign-in')} data-menu-item class="menu-item">
				<span class="arrow">▶</span> Sign in
			</a>
		{/if}
	</nav>

	<p class="mt-10 h-4 pixel text-[8px] text-ash">
		{#if data.user}
			{#if character.isLoading}
				Loading survivor…
			{:else if character.data}
				Survivor: <span class="text-bone-2">{character.data.name}</span>
			{:else}
				No survivor yet. Customize to roll one.
			{/if}
		{:else}
			Press start
		{/if}
	</p>
</div>

<!-- Ground -->
<div class="pointer-events-none fixed inset-x-0 bottom-0 h-6 bg-rot-3"></div>
<div
	class="pointer-events-none fixed inset-x-0 bottom-6 h-2 bg-rot-2 [mask:repeating-linear-gradient(90deg,#000_0_8px,transparent_8px_24px)]"
></div>
