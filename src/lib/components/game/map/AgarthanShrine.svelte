<script lang="ts">
	// East: an Agarthan shrine where the crust has split open. Crystals from below, and the
	// timeline ring they keep turning above the altar.
	import { T, useTask } from '@threlte/core';
	import type { Group, Mesh } from 'three';
	import { createRng } from '#lib/game/rng.js';
	import { MAP_SEED } from './terrain';

	let { x, z }: { x: number; z: number } = $props();

	const rng = createRng(MAP_SEED + 10);
	const crystals = Array.from({ length: 14 }, () => {
		const a = rng.range(0, Math.PI * 2);
		const d = rng.range(2.6, 5);
		return {
			x: Math.cos(a) * d,
			z: Math.sin(a) * d * 1.4,
			h: rng.range(0.8, 2.2),
			tilt: rng.range(-0.35, 0.35),
			rotY: rng.range(0, Math.PI),
			pale: rng.chance(0.3)
		};
	});

	let ring = $state.raw<Group | undefined>();
	let core = $state.raw<Mesh | undefined>();
	let t = 0;
	useTask((delta) => {
		t += delta;
		if (ring) ring.rotation.y = t * 0.5;
		if (core) {
			core.rotation.y = -t * 1.2;
			core.position.y = 2.2 + Math.sin(t * 2) * 0.15;
		}
	});
</script>

<T.Group position={[x, 0, z]}>
	<!-- The split in the crust -->
	<T.Mesh position.y={0.02} rotation={[-Math.PI / 2, 0, Math.PI / 2 + 0.2]}>
		<T.PlaneGeometry args={[14, 0.3]} />
		<T.MeshBasicMaterial color="#4a33a8" />
	</T.Mesh>
	{#each crystals as c, i (i)}
		<T.Mesh
			position={[c.x, c.h * 0.6, c.z]}
			rotation={[c.tilt, c.rotY, c.tilt * 0.5]}
			scale={[0.45, c.h, 0.45]}
		>
			<T.OctahedronGeometry args={[1, 0]} />
			<T.MeshLambertMaterial
				color={c.pale ? '#d9ccff' : '#8f6bff'}
				emissive="#4b30b8"
				emissiveIntensity={0.7}
				flatShading
			/>
		</T.Mesh>
	{/each}
	<!-- Stepped altar -->
	<T.Mesh position.y={0.25}>
		<T.CylinderGeometry args={[2, 2.2, 0.5, 6]} />
		<T.MeshLambertMaterial color="#4a4658" flatShading />
	</T.Mesh>
	<T.Mesh position.y={0.7}>
		<T.CylinderGeometry args={[1.3, 1.5, 0.4, 6]} />
		<T.MeshLambertMaterial color="#5a5570" flatShading />
	</T.Mesh>
	<T.Group bind:ref={ring} position.y={2.2}>
		<T.Mesh rotation.x={Math.PI / 2 - 0.35}>
			<T.TorusGeometry args={[1.5, 0.07, 6, 32]} />
			<T.MeshBasicMaterial color="#f0c64a" />
		</T.Mesh>
		<T.Mesh rotation={[Math.PI / 2 + 0.35, 0, 0.6]}>
			<T.TorusGeometry args={[1.2, 0.05, 6, 32]} />
			<T.MeshBasicMaterial color="#c9a43e" />
		</T.Mesh>
	</T.Group>
	<T.Mesh bind:ref={core} scale={[0.45, 0.8, 0.45]}>
		<T.OctahedronGeometry args={[1, 0]} />
		<T.MeshBasicMaterial color="#cbb8ff" />
	</T.Mesh>
	<T.PointLight position.y={2.5} color="#8a6bff" intensity={45} distance={18} decay={1.6} />
</T.Group>
