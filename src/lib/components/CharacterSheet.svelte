<script lang="ts">
	import {
		findConstellation,
		findOrigin,
		findRace,
		type ConstellationId,
		type OriginId,
		type RaceId
	} from '#lib/game/traits.js';

	let {
		name,
		race,
		origin,
		constellation
	}: {
		name: string;
		race: RaceId | null;
		origin: OriginId | null;
		constellation: ConstellationId | null;
	} = $props();

	const r = $derived(race ? findRace(race) : null);
	const o = $derived(origin ? findOrigin(origin) : null);
	const c = $derived(constellation ? findConstellation(constellation) : null);

	function seconds(n: number) {
		if (n >= 60 && n % 60 === 0) return `${n / 60} min`;
		if (n > 60) return `${Math.floor(n / 60)} min ${n % 60} s`;
		return `${n} s`;
	}
</script>

<div class="pixel-box bg-surface">
	<div class="border-b-4 border-line px-5 py-4">
		<div class="pixel text-[8px] text-ash">Survivor</div>
		<div class="mt-1 pixel text-lg pixel-shadow-sm {name.trim() ? 'text-bone' : 'text-ash'}">
			{name.trim() || 'Unnamed'}
		</div>
		<div class="mt-1 text-base text-bone-2">
			{r?.name ?? '—'} · {o?.name ?? '—'} · {c?.name ?? '—'}
		</div>
	</div>

	<dl class="divide-y-4 divide-line">
		<div class="grid gap-1 px-5 py-4 sm:grid-cols-[6rem_1fr]">
			<dt class="pixel text-[8px] text-ash">Race</dt>
			<dd>
				{#if r}
					<div class="pixel text-[10px] text-bone">
						{r.name} <span class="text-rot">{r.grant}</span>
					</div>
					<p class="mt-1 text-base leading-tight text-bone-2">{r.effect}</p>
				{:else}
					<span class="text-base text-ash">Not rolled yet</span>
				{/if}
			</dd>
		</div>
		<div class="grid gap-1 px-5 py-4 sm:grid-cols-[6rem_1fr]">
			<dt class="pixel text-[8px] text-ash">Origin</dt>
			<dd>
				{#if o}
					<div class="pixel text-[10px] text-bone">
						{o.name} <span class="text-rot">{o.grant}</span>
					</div>
					<p class="mt-1 text-base leading-tight text-bone-2">{o.effect}</p>
				{:else}
					<span class="text-base text-ash">Not rolled yet</span>
				{/if}
			</dd>
		</div>
		<div class="grid gap-1 px-5 py-4 sm:grid-cols-[6rem_1fr]">
			<dt class="pixel text-[8px] text-ash">Ability</dt>
			<dd>
				{#if c}
					<div class="pixel text-[10px] text-bone">
						{c.grant} <span class="text-gold">{c.name}</span>
					</div>
					<p class="mt-1 text-base leading-tight text-bone-2">{c.effect}</p>
					<ul class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-base text-bone-2">
						<li><span class="text-ash">Duration</span> {seconds(c.durationSeconds)}</li>
						<li>
							<span class="text-ash">Cooldown</span>
							{c.cooldownSeconds ? seconds(c.cooldownSeconds) : 'none'}
						</li>
					</ul>
					{#if c.debuff}
						<p class="mt-2 text-base leading-tight text-blood">Afterwards: {c.debuff}</p>
					{/if}
				{:else}
					<span class="text-base text-ash">Not rolled yet</span>
				{/if}
			</dd>
		</div>
	</dl>
</div>
