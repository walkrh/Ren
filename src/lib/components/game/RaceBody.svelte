<script lang="ts">
	// A race's body and main weapon, facing +x. Shared by players and by the ID Stealer's
	// disguise, so a copy is always exactly what the real player looks like.
	//   Human:    matte and low-tech. Olive jacket, tan helmet, red bandana, pack and bedroll.
	//   Agarthan: indigo robe with a gold hem, pale skin, and the timeline halo.
	//   Forsaken: hooded, one arm rebuilt in steel, a teal visor where the jack used to be.
	import { T, useTask } from '@threlte/core';
	import { DoubleSide, type Mesh } from 'three';
	import type { RaceId } from '#lib/game/traits.js';

	let { race, armed = true }: { race: RaceId; armed?: boolean } = $props();

	let halo = $state.raw<Mesh | undefined>();
	let t = 0;
	useTask((delta) => {
		t += delta;
		if (halo) halo.rotation.z = t * 0.8;
	});
</script>

{#if race === 'human'}
	<T.Mesh position.y={0.85}>
		<T.CapsuleGeometry args={[0.42, 0.7, 4, 8]} />
		<T.MeshLambertMaterial color="#6b7445" />
	</T.Mesh>
	<T.Mesh position.y={1.38} rotation.x={Math.PI / 2}>
		<T.TorusGeometry args={[0.28, 0.08, 4, 10]} />
		<T.MeshLambertMaterial color="#b8432f" />
	</T.Mesh>
	<T.Mesh position.y={1.6}>
		<T.SphereGeometry args={[0.25, 10, 8]} />
		<T.MeshLambertMaterial color="#c89a74" />
	</T.Mesh>
	<T.Mesh position.y={1.74}>
		<T.SphereGeometry args={[0.29, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
		<T.MeshLambertMaterial color="#525c36" />
	</T.Mesh>
	<T.Mesh position.y={1.74}>
		<T.CylinderGeometry args={[0.36, 0.36, 0.05, 12]} />
		<T.MeshLambertMaterial color="#4a5330" />
	</T.Mesh>
	<T.Mesh position={[-0.42, 1.0, 0]}>
		<T.BoxGeometry args={[0.3, 0.6, 0.55]} />
		<T.MeshLambertMaterial color="#5b3f27" />
	</T.Mesh>
	<T.Mesh position={[-0.42, 1.38, 0]} rotation.x={Math.PI / 2}>
		<T.CylinderGeometry args={[0.13, 0.13, 0.6, 8]} />
		<T.MeshLambertMaterial color="#8c3b2e" />
	</T.Mesh>
	{#if armed}
		<!-- Pulse rifle: wood stock, dull steel barrel -->
		<T.Group position={[0, 1.05, 0.2]}>
			<T.Mesh position.x={0.45}>
				<T.BoxGeometry args={[0.5, 0.16, 0.14]} />
				<T.MeshLambertMaterial color="#6b4a2b" />
			</T.Mesh>
			<T.Mesh position.x={0.95}>
				<T.BoxGeometry args={[0.6, 0.1, 0.1]} />
				<T.MeshLambertMaterial color="#5f6066" />
			</T.Mesh>
		</T.Group>
	{/if}
{:else if race === 'agarthan'}
	<T.Mesh position.y={0.7}>
		<T.CylinderGeometry args={[0.24, 0.55, 1.4, 10]} />
		<T.MeshLambertMaterial color="#3d3070" />
	</T.Mesh>
	<T.Mesh position.y={0.06}>
		<T.CylinderGeometry args={[0.57, 0.57, 0.1, 10]} />
		<T.MeshLambertMaterial color="#c9a43e" />
	</T.Mesh>
	<!-- Stole: a gold band down the front -->
	<T.Mesh position={[0.36, 0.8, 0]} rotation.z={0.2}>
		<T.BoxGeometry args={[0.06, 1.1, 0.16]} />
		<T.MeshLambertMaterial color="#c9a43e" />
	</T.Mesh>
	<T.Mesh position.y={1.55}>
		<T.SphereGeometry args={[0.25, 10, 8]} />
		<T.MeshLambertMaterial color="#c3cde0" />
	</T.Mesh>
	<T.Mesh position={[-0.07, 1.6, 0]} scale={[1, 1.05, 1.05]}>
		<T.SphereGeometry args={[0.29, 10, 8, Math.PI / 2, Math.PI]} />
		<T.MeshLambertMaterial color="#2c2353" side={DoubleSide} />
	</T.Mesh>
	<T.Mesh bind:ref={halo} position.y={2.0} rotation.x={Math.PI / 2}>
		<T.TorusGeometry args={[0.4, 0.045, 4, 24]} />
		<T.MeshBasicMaterial color="#f0c64a" />
	</T.Mesh>
	{#if armed}
		<!-- Arc caster: a staff with a crystal tip -->
		<T.Group position={[0, 1.05, 0.2]}>
			<T.Mesh position.x={0.6}>
				<T.BoxGeometry args={[1.0, 0.07, 0.07]} />
				<T.MeshLambertMaterial color="#c9a43e" />
			</T.Mesh>
			<T.Mesh position.x={1.15} scale={[0.22, 0.13, 0.13]}>
				<T.OctahedronGeometry args={[1, 0]} />
				<T.MeshBasicMaterial color="#cbb8ff" />
			</T.Mesh>
		</T.Group>
	{/if}
{:else}
	<T.Mesh position.y={0.85}>
		<T.CapsuleGeometry args={[0.44, 0.7, 4, 8]} />
		<T.MeshLambertMaterial color="#4c515b" />
	</T.Mesh>
	<!-- Tattered cloak tail -->
	<T.Mesh position={[-0.35, 0.7, 0]} rotation.z={-0.15}>
		<T.BoxGeometry args={[0.14, 1.1, 0.7]} />
		<T.MeshLambertMaterial color="#33363d" />
	</T.Mesh>
	<T.Mesh position.y={1.6}>
		<T.SphereGeometry args={[0.3, 10, 8]} />
		<T.MeshLambertMaterial color="#3d414a" />
	</T.Mesh>
	<T.Mesh position={[0.24, 1.6, 0]}>
		<T.BoxGeometry args={[0.1, 0.09, 0.36]} />
		<T.MeshBasicMaterial color="#38f0d0" />
	</T.Mesh>
	<!-- Severed jack cables off the back of the skull -->
	<T.Mesh position={[-0.32, 1.45, 0.1]} rotation.z={0.9}>
		<T.CylinderGeometry args={[0.035, 0.035, 0.5, 4]} />
		<T.MeshLambertMaterial color="#111214" />
	</T.Mesh>
	<T.Mesh position={[-0.32, 1.45, -0.1]} rotation.z={0.7}>
		<T.CylinderGeometry args={[0.035, 0.035, 0.45, 4]} />
		<T.MeshLambertMaterial color="#111214" />
	</T.Mesh>
	<!-- Steel arm and pauldron on the weapon side -->
	<T.Mesh position={[0, 1.3, 0.42]}>
		<T.BoxGeometry args={[0.42, 0.26, 0.34]} />
		<T.MeshLambertMaterial color="#7a828c" flatShading />
	</T.Mesh>
	<T.Mesh position={[0, 1.31, 0.42]}>
		<T.BoxGeometry args={[0.44, 0.04, 0.36]} />
		<T.MeshBasicMaterial color="#1fb39a" />
	</T.Mesh>
	{#if armed}
		<!-- Shard launcher: a heavy tube with a teal bore -->
		<T.Group position={[0, 1.05, 0.2]}>
			<T.Mesh position.x={0.7} rotation.z={Math.PI / 2}>
				<T.CylinderGeometry args={[0.13, 0.15, 0.9, 6]} />
				<T.MeshLambertMaterial color="#4f565f" flatShading />
			</T.Mesh>
			<T.Mesh position.x={1.16} rotation.z={Math.PI / 2}>
				<T.CylinderGeometry args={[0.09, 0.09, 0.04, 6]} />
				<T.MeshBasicMaterial color="#38f0d0" />
			</T.Mesh>
		</T.Group>
	{/if}
{/if}
