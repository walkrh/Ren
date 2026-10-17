<script lang="ts">
	import { T, useTask } from '@threlte/core';
	import type { Mesh } from 'three';
	import { useRuntime } from '#lib/game/session.svelte.js';

	const { input } = useRuntime();
	let ring = $state.raw<Mesh | undefined>();
	useTask(
		() => {
			if (ring) ring.position.set(input.aim.x, 0.05, input.aim.z);
		},
		{ after: 'aim' }
	);
</script>

<T.Mesh bind:ref={ring} rotation.x={-Math.PI / 2}>
	<T.RingGeometry args={[0.35, 0.5, 16]} />
	<T.MeshBasicMaterial color="#d9d9c7" transparent opacity={0.8} />
</T.Mesh>
