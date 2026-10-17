<script lang="ts">
	// North: an Overlord extraction rig, drilling the earth hollow. The red veins in the
	// arena floor run from here.
	import { T, useTask } from '@threlte/core';
	import type { Group, Mesh } from 'three';

	let { x, z }: { x: number; z: number } = $props();

	let rings = $state.raw<Group | undefined>();
	let beacon = $state.raw<Mesh | undefined>();
	let t = 0;
	useTask((delta) => {
		t += delta;
		// Rings ride the drill shaft like a pump stroke; the beacon blinks.
		rings?.children.forEach((r, i) => {
			r.position.y = 1 + ((t * 1.2 + i / 3) % 1) * 6;
		});
		if (beacon) beacon.visible = t % 1.4 < 0.7;
	});
</script>

<T.Group position={[x, 0, z]}>
	<T.Mesh position.y={0.15}>
		<T.CylinderGeometry args={[3.2, 3.6, 0.3, 8]} />
		<T.MeshLambertMaterial color="#1b1c20" flatShading />
	</T.Mesh>
	<!-- Hazard ring on the pad edge -->
	<T.Mesh position.y={0.31} rotation.x={-Math.PI / 2}>
		<T.RingGeometry args={[2.7, 3.0, 8]} />
		<T.MeshBasicMaterial color="#b3361f" />
	</T.Mesh>
	<!-- Derrick -->
	<T.Mesh position.y={4.5} rotation.y={Math.PI / 4}>
		<T.CylinderGeometry args={[0.5, 2.2, 8.5, 4, 5]} />
		<T.MeshBasicMaterial color="#4a4e56" wireframe />
	</T.Mesh>
	<T.Mesh position.y={4.5}>
		<T.CylinderGeometry args={[0.35, 0.35, 9, 6]} />
		<T.MeshLambertMaterial color="#5a5e66" flatShading />
	</T.Mesh>
	<T.Group bind:ref={rings}>
		{#each [0, 1, 2] as i (i)}
			<T.Mesh rotation.x={Math.PI / 2}>
				<T.TorusGeometry args={[0.9, 0.12, 6, 16]} />
				<T.MeshBasicMaterial color="#ff2a1f" />
			</T.Mesh>
		{/each}
	</T.Group>
	<!-- Boom arm and counterweight -->
	<T.Mesh position={[1.4, 8.4, 0]}>
		<T.BoxGeometry args={[5, 0.35, 0.35]} />
		<T.MeshLambertMaterial color="#2d3036" />
	</T.Mesh>
	<T.Mesh position={[-0.8, 8.1, 0]}>
		<T.BoxGeometry args={[0.9, 0.9, 0.9]} />
		<T.MeshLambertMaterial color="#1b1c20" />
	</T.Mesh>
	<T.Mesh bind:ref={beacon} position.y={9.3}>
		<T.SphereGeometry args={[0.3, 8, 6]} />
		<T.MeshBasicMaterial color="#ff4a3a" />
	</T.Mesh>
	<!-- Feed pipes running toward the arena -->
	{#each [-1.6, 1.6] as px (px)}
		<T.Mesh position={[px, 0.25, 2.6]} rotation.x={Math.PI / 2}>
			<T.CylinderGeometry args={[0.25, 0.25, 3, 6]} />
			<T.MeshLambertMaterial color="#2a2c31" flatShading />
		</T.Mesh>
	{/each}
	<T.PointLight position.y={3} color="#ff3020" intensity={60} distance={22} decay={1.6} />
</T.Group>
