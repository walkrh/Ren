<script lang="ts" generics="Id extends string">
	import { rollFrom, type Trait } from '#lib/game/traits.js';

	let {
		slot,
		label,
		hint,
		options,
		value = $bindable(null),
		disabled = false
	}: {
		slot: number;
		label: string;
		hint: string;
		options: readonly Trait<Id>[];
		value: Id | null;
		disabled?: boolean;
	} = $props();

	let spinning = $state(false);
	let shown = $state<Trait<Id> | null>(null);
	let timers: ReturnType<typeof setTimeout>[] = [];

	const current = $derived(
		spinning ? shown : value ? (options.find((o) => o.id === value) ?? null) : null
	);

	$effect(() => () => timers.forEach(clearTimeout));

	function spin() {
		if (spinning || disabled) return;
		spinning = true;
		const target = rollFrom(options);
		// At least four full passes, then stop on the rolled option.
		const steps = options.length * 4 + options.indexOf(target);
		let i = 0;
		const step = () => {
			shown = options[i % options.length];
			if (i === steps) {
				value = target.id;
				spinning = false;
				return;
			}
			const t = i / steps;
			i++;
			timers.push(setTimeout(step, 60 + Math.pow(t, 2.2) * 460));
		};
		step();
	}
</script>

<section
	class="row-span-4 pixel-box grid grid-rows-subgrid gap-4 bg-surface p-4 {value && !spinning
		? 'pixel-box-rot-2'
		: ''}"
	aria-live="polite"
>
	<header>
		<div class="pixel text-[8px] text-ash">Spin {slot}</div>
		<h2 class="pixel text-sm text-bone">{label}</h2>
		<p class="mt-1 text-base leading-tight text-bone-2">{hint}</p>
	</header>

	<div
		class="pixel-box flex h-44 flex-col items-center justify-center bg-ink-2 px-3 text-center pixel-box-line-2 {value &&
		!spinning
			? 'animate-land'
			: ''}"
	>
		{#if current}
			<div class="pixel text-base text-bone sm:text-lg">{current.name}</div>
			<div class="mt-2 pixel text-[9px] text-rot">{current.grant}</div>
			{#if !spinning}
				<p class="mt-3 text-base leading-tight text-bone-2">{current.tagline}</p>
			{/if}
		{:else}
			<div class="animate-blink pixel text-4xl text-ash">?</div>
		{/if}
	</div>

	<ul
		class="flex flex-wrap content-start gap-x-3 gap-y-1 self-start"
		aria-label="Possible outcomes"
	>
		{#each options as option (option.id)}
			<li class="text-base {current?.id === option.id ? 'text-rot' : 'text-ash'}">
				{current?.id === option.id ? '■' : '□'}
				{option.name}
			</li>
		{/each}
	</ul>

	<button
		type="button"
		onclick={spin}
		disabled={spinning || disabled}
		class="pixel-box pixel-btn py-3 pixel text-[10px] disabled:opacity-60 {value
			? 'bg-surface-2 text-rot pixel-box-line-2 hover:bg-line'
			: 'bg-rot text-ink pixel-box-rot-2 hover:bg-rot-2'}"
	>
		{#if spinning}
			Rolling…
		{:else if value}
			Re-roll
		{:else}
			Roll
		{/if}
	</button>
</section>
