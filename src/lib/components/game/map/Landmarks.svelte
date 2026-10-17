<script lang="ts">
	// What lies past the barricade: one landmark per faction, the dead city, and the dark
	// power pylons. Positions are relative to the arena edge so a resize keeps them outside.
	import { T } from '@threlte/core';
	import { createRng } from '#lib/game/rng.js';
	import { MAP_SEED } from './terrain';
	import OverlordRig from './OverlordRig.svelte';
	import AgarthanShrine from './AgarthanShrine.svelte';
	import ForsakenYard from './ForsakenYard.svelte';
	import HumanCamp from './HumanCamp.svelte';

	let { halfWidth, halfDepth }: { halfWidth: number; halfDepth: number } = $props();

	// Ruined blocks behind the rig. North only: tall things to the south would hide the arena.
	const ruins = $derived.by(() => {
		const rng = createRng(MAP_SEED + 30);
		const out: { x: number; z: number; w: number; d: number; h: number; color: string }[] = [];
		for (let x = -halfWidth - 10; x < halfWidth + 10; x += rng.range(5, 8)) {
			if (Math.abs(x - 4) < 6) continue; // leave the rig in the clear
			out.push({
				x,
				z: -halfDepth - rng.range(3.5, 7),
				w: rng.range(3, 5.5),
				d: rng.range(3, 5),
				h: rng.range(2.5, 8),
				color: rng.pick(['#26272b', '#2d2e33', '#222327', '#30302f'])
			});
		}
		return out;
	});

	const pylons = $derived([
		[-halfWidth - 6, -halfDepth - 4],
		[halfWidth + 6, -halfDepth - 4],
		[-halfWidth - 6, halfDepth + 5],
		[halfWidth + 6, halfDepth + 5]
	]);
</script>

<OverlordRig x={4} z={-halfDepth - 4.5} />
<AgarthanShrine x={halfWidth + 8} z={-3} />
<ForsakenYard x={-halfWidth - 9} z={2} />
<HumanCamp x={-2} z={halfDepth + 3} />

{#each ruins as r, i (i)}
	<T.Group position={[r.x, 0, r.z]}>
		<T.Mesh position.y={r.h / 2}>
			<T.BoxGeometry args={[r.w, r.h, r.d]} />
			<T.MeshLambertMaterial color={r.color} flatShading />
		</T.Mesh>
		<!-- Broken top floor, slumped to one side -->
		<T.Mesh position={[r.w * 0.2, r.h + 0.5, 0]} rotation.z={0.25}>
			<T.BoxGeometry args={[r.w * 0.6, 1, r.d * 0.8]} />
			<T.MeshLambertMaterial color={r.color} flatShading />
		</T.Mesh>
	</T.Group>
{/each}

<!-- Power pylons, dark since the blackout, lines snapped -->
{#each pylons as [px, pz], i (i)}
	<T.Group position={[px, 0, pz]} rotation.y={i * 0.7}>
		<T.Mesh position.y={4.5} rotation.y={Math.PI / 4}>
			<T.CylinderGeometry args={[0.2, 1.1, 9, 4, 6]} />
			<T.MeshBasicMaterial color="#4a4e56" wireframe />
		</T.Mesh>
		<T.Mesh position.y={8.2}>
			<T.BoxGeometry args={[3.4, 0.15, 0.15]} />
			<T.MeshLambertMaterial color="#3a3d42" />
		</T.Mesh>
		<T.Mesh position.y={6.8}>
			<T.BoxGeometry args={[2.4, 0.15, 0.15]} />
			<T.MeshLambertMaterial color="#3a3d42" />
		</T.Mesh>
		<T.Mesh position={[1.7, 5.8, 0.4]} rotation={[0.3, 0, 0.15]}>
			<T.CylinderGeometry args={[0.03, 0.03, 4.8, 3]} />
			<T.MeshBasicMaterial color="#111214" />
		</T.Mesh>
	</T.Group>
{/each}
