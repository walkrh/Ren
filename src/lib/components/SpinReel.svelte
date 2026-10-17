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
	class={['row-span-4 grid grid-rows-subgrid gap-4 panel p-4', { 'panel-lit': value && !spinning }]}
	aria-live="polite"
>
	<header>
		<div class="caps text-ash">Spin {slot}</div>
		<h2 class="mt-1 font-heading text-lg font-semibold text-bone">{label}</h2>
		<p class="mt-1 text-base leading-tight text-bone-2 italic">{hint}</p>
	</header>

	<div
		class={[
			'flex h-44 flex-col items-center justify-center rounded-[2px] border border-line bg-ink-2 px-3 text-center',
			{ 'animate-land': value && !spinning }
		]}
	>
		{#if current}
			<div class="font-heading text-xl font-bold text-bone">{current.name}</div>
			<div class="mt-2 caps text-gold">{current.grant}</div>
			{#if !spinning}
				<p class="mt-3 text-base leading-tight text-bone-2 italic">{current.tagline}</p>
			{/if}
		{:else}
			<div class="animate-flicker font-display text-5xl text-line-2">?</div>
		{/if}
	</div>

	<ul
		class="flex flex-wrap content-start gap-x-3 gap-y-1 self-start"
		aria-label="Possible outcomes"
	>
		{#each options as option (option.id)}
			<li class={['text-base', current?.id === option.id ? 'text-gold-3' : 'text-ash']}>
				<span class="text-xs">{current?.id === option.id ? '◆' : '◇'}</span>
				{option.name}
			</li>
		{/each}
	</ul>

	<button
		type="button"
		onclick={spin}
		disabled={spinning || disabled}
		class={['btn', value ? 'btn-ghost' : 'btn-gold']}
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
