<script lang="ts">
	/**
	 * Draws a sprite from a text grid using one box-shadow per pixel.
	 * Each character in `rows` maps to a colour in `palette`; '.' is transparent.
	 */
	let {
		rows,
		palette,
		scale = 6,
		class: className = ''
	}: {
		rows: readonly string[];
		palette: Record<string, string>;
		scale?: number;
		class?: string;
	} = $props();

	const width = $derived(Math.max(...rows.map((r) => r.length)));
	const shadow = $derived(
		rows
			.flatMap((row, y) =>
				[...row].flatMap((ch, x) =>
					ch === '.' || !palette[ch] ? [] : [`${x * scale}px ${y * scale}px 0 0 ${palette[ch]}`]
				)
			)
			.join(',')
	);
</script>

<div
	aria-hidden="true"
	class={className}
	style="width:{width * scale}px;height:{rows.length * scale}px"
>
	<div style="width:{scale}px;height:{scale}px;box-shadow:{shadow}"></div>
</div>
