<script lang="ts">
	import { asset } from '$app/paths';
	import type { Attachment } from 'svelte/attachments';
	import { createTitleFire, sampleLetters, type TitleFire } from '#lib/game/burn.js';

	/** Title screen over the parchment map; on Enter the letters ash, the page burns, and ondone fires. */
	let { onburn, ondone }: { onburn?: () => void; ondone: () => void } = $props();

	const hero = asset('art/hero.jpg');
	const title = 'Ren';
	const prompt = 'Press Enter';

	let phase: 'idle' | 'ashing' | 'burning' | 'fading' = $state('idle');
	let ready = $state(false);
	let root: HTMLElement | undefined = $state();
	let glCanvas: HTMLCanvasElement | undefined = $state();
	let ashCanvas: HTMLCanvasElement | undefined = $state();
	let fire: TitleFire | null = null;
	let reducedMotion = false;

	// Starts the fire once both canvases exist, and stops it when the screen goes away.
	const scene: Attachment = () => {
		if (!glCanvas || !ashCanvas) return;
		reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
		fire = createTitleFire({
			gl: glCanvas,
			ash: ashCanvas,
			image: hero,
			reducedMotion,
			onready: () => (ready = true)
		});
		return () => fire?.destroy();
	};

	async function enter() {
		if (phase !== 'idle') return;

		// Without the fire or with reduced motion, the screen simply fades out
		if (!fire || reducedMotion) {
			phase = 'fading';
			onburn?.();
			setTimeout(ondone, 500);
			return;
		}

		phase = 'ashing';
		await document.fonts.ready;
		const letters = [...(root?.querySelectorAll<HTMLElement>('[data-letter]') ?? [])];
		const ember = getComputedStyle(document.documentElement).getPropertyValue('--color-flame');
		const ash = getComputedStyle(document.documentElement).getPropertyValue('--color-ash');
		let longest = 0;

		// Each letter smoulders, greys to ash, then breaks apart in its own shape
		for (const el of letters) {
			const points = sampleLetters([el]);
			const delay = Math.random() * 400;
			el.animate(
				[
					{ color: getComputedStyle(el).color, textShadow: 'none' },
					{ color: ember, textShadow: `0 0 14px ${ember}`, offset: 0.4 },
					{ color: ash, textShadow: 'none' }
				],
				{ duration: 650, delay, easing: 'ease-in', fill: 'forwards' }
			);
			setTimeout(() => {
				fire?.ashLetters(points);
				el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' });
			}, delay + 600);
			longest = Math.max(longest, delay + 760);
		}

		setTimeout(() => {
			phase = 'burning';
			onburn?.();
			fire?.burn(ondone);
		}, longest + 250);
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.repeat) {
			e.preventDefault();
			enter();
		}
	}
</script>

<svelte:window {onkeydown} />

<div
	bind:this={root}
	class={[
		'fixed inset-0 z-50 overflow-hidden transition-opacity duration-500',
		phase === 'fading' && 'opacity-0'
	]}
>
	<!-- Plain parchment shows until the fire canvas has drawn its first frame -->
	<div
		aria-hidden="true"
		class={[
			'absolute inset-0 bg-ink bg-cover bg-center transition-opacity duration-300',
			ready && 'opacity-0'
		]}
		style:background-image="url({hero})"
	></div>
	<canvas bind:this={glCanvas} aria-hidden="true" class="absolute inset-0 size-full"></canvas>

	<div
		class="relative flex h-dvh flex-col items-center justify-between px-4 pt-[6vh] pb-[17vh] text-center"
	>
		<h1
			aria-label={title}
			class="font-display text-[min(9rem,15vh,22vw)] leading-none font-black tracking-[0.12em] text-crimson-2 [text-shadow:0_1px_0_rgb(236_224_196/0.4)]"
		>
			{#each [...title] as letter, i (i)}<span data-letter aria-hidden="true">{letter}</span>{/each}
		</h1>

		<button
			type="button"
			aria-label={prompt}
			onclick={enter}
			disabled={phase !== 'idle'}
			class="flex cursor-pointer items-center gap-4 px-4 py-2 font-heading text-lg font-bold tracking-[0.3em] text-ink uppercase outline-none focus-visible:text-crimson-2 sm:text-xl"
		>
			<span data-letter aria-hidden="true" class="text-crimson-2">✠</span>
			<span class={[phase === 'idle' && 'animate-flicker']}>
				{#each [...prompt] as letter, i (i)}<span data-letter aria-hidden="true">{letter}</span
					>{/each}
			</span>
			<span data-letter aria-hidden="true" class="text-crimson-2">✠</span>
		</button>
	</div>

	<canvas
		bind:this={ashCanvas}
		{@attach scene}
		aria-hidden="true"
		class="pointer-events-none absolute inset-0 size-full"
	></canvas>
</div>
