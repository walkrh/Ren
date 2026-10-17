<script lang="ts">
	// South: a human camp. No wires, no screens. Canvas, firewood, and a windmill.
	// Everything here stays low so it never hides the arena from the camera.
	import { T, useTask } from '@threlte/core';
	import type { Group, PointLight } from 'three';

	let { x, z }: { x: number; z: number } = $props();

	const tents = [
		{ x: -4, z: 1, s: 1, color: '#7d6e4f' },
		{ x: -1.2, z: 3, s: 0.85, color: '#6b5f45' },
		{ x: 3.5, z: 2.4, s: 1.1, color: '#8a7550' }
	];
	const stones = Array.from({ length: 8 }, (_, i) => (i / 8) * Math.PI * 2);

	let flame = $state.raw<Group | undefined>();
	let light = $state.raw<PointLight | undefined>();
	let blades = $state.raw<Group | undefined>();
	let t = 0;
	useTask((delta) => {
		t += delta;
		const f = 1 + Math.sin(t * 11) * 0.12 + Math.sin(t * 6.1) * 0.1;
		if (flame) flame.scale.set(1, f, 1);
		if (light) light.intensity = 40 * f;
		if (blades) blades.rotation.z = t * 1.5;
	});
</script>

<T.Group position={[x, 0, z]}>
	{#each tents as tent, i (i)}
		<T.Mesh position={[tent.x, 0.7 * tent.s, tent.z]} rotation.y={Math.PI / 4} scale={tent.s}>
			<T.ConeGeometry args={[1.3, 1.4, 4]} />
			<T.MeshLambertMaterial color={tent.color} flatShading />
		</T.Mesh>
	{/each}

	<!-- Campfire -->
	<T.Group position={[0.5, 0, 0]}>
		{#each stones as a, i (i)}
			<T.Mesh position={[Math.cos(a) * 0.7, 0.12, Math.sin(a) * 0.7]} scale={0.18}>
				<T.DodecahedronGeometry args={[1, 0]} />
				<T.MeshLambertMaterial color="#5f5e58" flatShading />
			</T.Mesh>
		{/each}
		<T.Mesh position.y={0.12} rotation={[0, 0.5, Math.PI / 2]}>
			<T.CylinderGeometry args={[0.1, 0.1, 1, 5]} />
			<T.MeshLambertMaterial color="#4a3020" />
		</T.Mesh>
		<T.Mesh position.y={0.12} rotation={[0, -0.6, Math.PI / 2]}>
			<T.CylinderGeometry args={[0.1, 0.1, 1, 5]} />
			<T.MeshLambertMaterial color="#4a3020" />
		</T.Mesh>
		<T.Group bind:ref={flame} position.y={0.15}>
			<T.Mesh position.y={0.35}>
				<T.ConeGeometry args={[0.35, 0.75, 6]} />
				<T.MeshBasicMaterial color="#ff7a1a" />
			</T.Mesh>
			<T.Mesh position.y={0.25}>
				<T.ConeGeometry args={[0.2, 0.5, 6]} />
				<T.MeshBasicMaterial color="#ffd27a" />
			</T.Mesh>
		</T.Group>
		<T.PointLight bind:ref={light} position.y={1.2} color="#ff9a40" distance={16} decay={1.6} />
	</T.Group>

	<!-- Supply crates -->
	<T.Mesh position={[-2.6, 0.35, -0.6]} rotation.y={0.3}>
		<T.BoxGeometry args={[0.7, 0.7, 0.7]} />
		<T.MeshLambertMaterial color="#6b4a2b" />
	</T.Mesh>
	<T.Mesh position={[-1.9, 0.3, -0.9]} rotation.y={-0.2}>
		<T.BoxGeometry args={[0.6, 0.6, 0.6]} />
		<T.MeshLambertMaterial color="#7a5532" />
	</T.Mesh>

	<!-- Pre-collapse car, stripped for parts -->
	<T.Group position={[8.5, 0, 1.5]} rotation.y={0.4}>
		<T.Mesh position.y={0.45}>
			<T.BoxGeometry args={[3.6, 0.6, 1.6]} />
			<T.MeshLambertMaterial color="#5e3b26" />
		</T.Mesh>
		<T.Mesh position={[-0.2, 1.0, 0]}>
			<T.BoxGeometry args={[1.8, 0.5, 1.4]} />
			<T.MeshLambertMaterial color="#4a3224" />
		</T.Mesh>
	</T.Group>

	<!-- Windmill: the only power they trust -->
	<T.Group position={[-7, 0, 2]}>
		<T.Mesh position.y={1.5}>
			<T.CylinderGeometry args={[0.08, 0.14, 3, 5]} />
			<T.MeshLambertMaterial color="#6b4a2b" />
		</T.Mesh>
		<T.Group bind:ref={blades} position={[0, 3, 0.15]}>
			{#each [0, 1, 2, 3] as i (i)}
				<T.Mesh rotation.z={(i * Math.PI) / 2} position={[0, 0, 0]}>
					<T.BoxGeometry args={[0.18, 1.6, 0.04]} />
					<T.MeshLambertMaterial color="#b2ad95" />
				</T.Mesh>
			{/each}
		</T.Group>
	</T.Group>
</T.Group>
