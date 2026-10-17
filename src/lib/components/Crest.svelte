<script lang="ts">
	/** Gold cross over a machine gear: the faithful against the machine. */
	let { size = 96, class: className = '' }: { size?: number; class?: string } = $props();

	const teeth = Array.from({ length: 12 }, (_, i) => i * 30);
	const arms = [0, 90, 180, 270];
</script>

<svg
	aria-hidden="true"
	class={className}
	width={size}
	height={size}
	viewBox="0 0 100 100"
	fill="none"
>
	<defs>
		<linearGradient id="crest-gold" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0" stop-color="var(--color-gold-3)" />
			<stop offset="0.55" stop-color="var(--color-gold)" />
			<stop offset="1" stop-color="var(--color-gold-2)" />
		</linearGradient>
	</defs>

	<g fill="var(--color-line-2)">
		{#each teeth as angle (angle)}
			<rect x="46" y="9" width="8" height="9" rx="1" transform="rotate({angle} 50 50)" />
		{/each}
	</g>
	<circle cx="50" cy="50" r="33" stroke="var(--color-line-2)" stroke-width="5" />

	<g fill="url(#crest-gold)" stroke="var(--color-ink)" stroke-width="1.2" stroke-linejoin="round">
		{#each arms as angle (angle)}
			<path d="M37 4 H63 L54 44 H46 Z" transform="rotate({angle} 50 50)" />
		{/each}
	</g>
	<rect x="45" y="45" width="10" height="10" fill="url(#crest-gold)" />
</svg>
