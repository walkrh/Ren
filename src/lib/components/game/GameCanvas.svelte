<script lang="ts">
	// Threlte canvas plus input capture. Everything inside <Canvas> runs only in the browser.
	import { Canvas } from '@threlte/core';
	import { NoToneMapping } from 'three';
	import Scene from './Scene.svelte';
	import { useRuntime } from '#lib/game/session.svelte.js';

	const { input } = useRuntime();

	function attach(el: HTMLElement) {
		input.attach(el);
		return () => input.detach();
	}
</script>

<div class="game-canvas absolute inset-0 cursor-crosshair select-none" {@attach attach}>
	<Canvas dpr={[0.75, 1.5]} toneMapping={NoToneMapping}>
		<Scene />
	</Canvas>
</div>

<style>
	.game-canvas :global(canvas) {
		image-rendering: pixelated;
	}
</style>
