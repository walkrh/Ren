<script lang="ts">
	import { fade } from 'svelte/transition';
	import { cubicInOut } from 'svelte/easing';

	/** The intro lore, paced one beat at a time. Enter, Escape or a click skips to the menu. */
	let { playing, ondone }: { playing: boolean; ondone: () => void } = $props();

	type Beat = {
		heading?: string;
		lines: string[];
		kind: 'plain' | 'year' | 'race' | 'enemy' | 'close';
	};

	const beats: Beat[] = [
		{
			kind: 'plain',
			lines: ['The Collapse came sometime in the 2030s.', 'No one knows the exact date.']
		},
		{
			kind: 'plain',
			lines: ['When it hit, the power went out across the world,', 'and it never came back.']
		},
		{ kind: 'year', lines: ['The year is now 2069.'] },
		{ kind: 'plain', lines: ['In the dark, four races rose to claim what was left of the earth.'] },
		{
			kind: 'race',
			heading: 'The Agarthans',
			lines: [
				'Keepers of the sacred timeline, who waited beneath the surface for this moment.',
				'They will do all they can to save humanity.'
			]
		},
		{
			kind: 'race',
			heading: 'The Forsaken',
			lines: [
				'Humans of the old world, who used AI and unknowingly helped bring on the Collapse.',
				'They know what they have done, and they fight the Overlords for redemption.'
			]
		},
		{
			kind: 'race',
			heading: 'The Humans',
			lines: [
				'They want the earth returned to the way it was before technology,',
				'and to save what little they have left.'
			]
		},
		{
			kind: 'enemy',
			heading: 'The AI Overlords',
			lines: [
				'Set on using the earth and its resources until there is nothing left,',
				'no matter what it costs the life on it.'
			]
		},
		{
			kind: 'plain',
			lines: [
				'With the cities dark, the stars have come back.',
				'Some say they are choosing who will fight.'
			]
		},
		{
			kind: 'close',
			lines: ['Will you be the ones to save them?', 'Or will they wait even longer?']
		}
	];

	// Longer beats stay up longer so there is time to read them
	const readMs = (beat: Beat) =>
		Math.min(Math.max(1100 + [beat.heading ?? '', ...beat.lines].join('').length * 30, 2200), 4600);

	const reducedMotion =
		typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

	let index = $state(0);
	let leaving = $state(false);
	const beat = $derived(beats[index]);

	function finish() {
		if (leaving) return;
		leaving = true;
		setTimeout(ondone, 700);
	}

	function next() {
		if (index < beats.length - 1) index++;
		else finish();
	}

	// Moves to the next beat once this one has been up long enough
	$effect(() => {
		if (!playing || leaving) return;
		const timer = setTimeout(next, readMs(beats[index]) + (index === 0 ? 300 : 0));
		return () => clearTimeout(timer);
	});

	function onkeydown(e: KeyboardEvent) {
		if (!playing || e.repeat) return;
		if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			finish();
		}
	}
</script>

<svelte:window {onkeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div
	onclick={() => playing && finish()}
	class={[
		'fixed inset-0 z-40 flex flex-col items-center justify-center bg-ink bg-[radial-gradient(ellipse_80%_45%_at_50%_110%,rgb(158_27_27/0.35),transparent_70%)] px-6 text-center transition-opacity duration-700',
		leaving && 'opacity-0'
	]}
>
	{#if playing}
		<div class="grid w-full max-w-2xl" aria-live="polite">
			{#key index}
				<div
					in:fade={{
						duration: reducedMotion ? 0 : 800,
						delay: reducedMotion ? 0 : 200,
						easing: cubicInOut
					}}
					out:fade={{ duration: reducedMotion ? 0 : 800, easing: cubicInOut }}
					class="col-start-1 row-start-1 flex flex-col items-center gap-5"
				>
					{#if beat.heading}
						<h2
							class={[
								'font-display text-4xl font-black tracking-[0.08em] sm:text-5xl',
								beat.kind === 'enemy' ? 'text-machine' : 'gilded'
							]}
						>
							{beat.heading}
						</h2>
						<span class="text-gold" aria-hidden="true">✠</span>
					{/if}
					{#each beat.lines as line, i (i)}
						<p
							class={[
								beat.kind === 'year' &&
									'gilded font-display text-4xl font-black tracking-[0.08em] sm:text-6xl',
								beat.kind === 'close' && 'text-2xl text-bone italic sm:text-3xl',
								(beat.kind === 'plain' || beat.kind === 'race' || beat.kind === 'enemy') &&
									'text-xl text-bone-2 sm:text-2xl'
							]}
						>
							{line}
						</p>
					{/each}
				</div>
			{/key}
		</div>

		<p class="absolute bottom-8 caps text-ash">Press Enter to skip</p>
	{/if}
</div>
