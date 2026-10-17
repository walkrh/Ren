<script lang="ts">
	// West: a server graveyard the Forsaken tore out of the network. Racks pulled down and
	// burned on copper fires, which is why the flames run green.
	import { T, useTask } from '@threlte/core';
	import type { Group } from 'three';
	import { createRng } from '#lib/game/rng.js';
	import { MAP_SEED } from './terrain';

	let { x, z }: { x: number; z: number } = $props();

	const rng = createRng(MAP_SEED + 20);
	const racks = Array.from({ length: 11 }, (_, i) => ({
		x: (i % 3) * 1.6 + rng.range(-0.2, 0.2),
		z: Math.floor(i / 3) * 2.4 - 3.6 + rng.range(-0.3, 0.3),
		rotY: rng.range(-0.25, 0.25),
		toppled: rng.chance(0.4),
		lit: rng.chance(0.5)
	}));
	const cables = Array.from({ length: 8 }, () => ({
		x: rng.range(-2, 5),
		z: rng.range(-5, 5),
		r: rng.range(0.25, 0.5)
	}));

	let flame = $state.raw<Group | undefined>();
	let t = 0;
	useTask((delta) => {
		t += delta;
		if (flame) flame.scale.y = 1 + Math.sin(t * 13) * 0.15 + Math.sin(t * 7.3) * 0.1;
	});
</script>

<T.Group position={[x, 0, z]}>
	{#each racks as r, i (i)}
		<T.Group
			position={[r.x, r.toppled ? 0.4 : 1.1, r.z]}
			rotation={[r.toppled ? Math.PI / 2 : 0, r.rotY, 0]}
		>
			<T.Mesh>
				<T.BoxGeometry args={[0.8, 2.2, 0.8]} />
				<T.MeshLambertMaterial color="#18191c" />
			</T.Mesh>
			<!-- Status lights, still on where the Forsaken rewired them -->
			<T.Mesh position={[0.41, 0.3, 0]}>
				<T.BoxGeometry args={[0.02, 1.2, 0.5]} />
				<T.MeshBasicMaterial color={r.lit ? '#2ee6c4' : '#123a33'} />
			</T.Mesh>
			<T.Mesh position.y={1.11}>
				<T.BoxGeometry args={[0.6, 0.02, 0.6]} />
				<T.MeshBasicMaterial color={r.lit ? '#1b8f7c' : '#0f2420'} />
			</T.Mesh>
		</T.Group>
	{/each}
	{#each cables as c, i (i)}
		<T.Mesh position={[c.x, 0.06, c.z]} rotation.x={-Math.PI / 2}>
			<T.TorusGeometry args={[c.r, 0.06, 4, 10]} />
			<T.MeshLambertMaterial color="#101113" />
		</T.Mesh>
	{/each}
	<!-- Burn barrel -->
	<T.Group position={[5, 0, 0.5]}>
		<T.Mesh position.y={0.45}>
			<T.CylinderGeometry args={[0.45, 0.45, 0.9, 8]} />
			<T.MeshLambertMaterial color="#3a2f28" flatShading />
		</T.Mesh>
		<T.Group bind:ref={flame} position.y={0.9}>
			<T.Mesh position.y={0.35}>
				<T.ConeGeometry args={[0.38, 0.8, 6]} />
				<T.MeshBasicMaterial color="#2ee6a0" />
			</T.Mesh>
			<T.Mesh position.y={0.25}>
				<T.ConeGeometry args={[0.22, 0.55, 6]} />
				<T.MeshBasicMaterial color="#d6fff0" />
			</T.Mesh>
		</T.Group>
		<T.PointLight position.y={1.6} color="#2ee6b0" intensity={35} distance={15} decay={1.6} />
	</T.Group>
</T.Group>
