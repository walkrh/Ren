<script lang="ts">
	import { T, useTask } from '@threlte/core';
	import type { Group } from 'three';
	import { useRuntime } from '#lib/game/session.svelte.js';
	import type { PickupKind } from '#lib/game/data/items.js';

	let { key }: { key: string } = $props();
	const { world } = useRuntime();
	let group = $state.raw<Group | undefined>();
	let kind = $state<PickupKind>('patch_kit');

	useTask(() => {
		const p = world.pickups.get(key);
		if (!p || !group) return;
		if (kind !== p.kind) kind = p.kind;
		group.position.set(p.pos.x, 0.6 + Math.sin(world.time * 4) * 0.1, p.pos.z);
		group.rotation.y = world.time * 1.5;
	});

	const colors: Record<PickupKind, string> = {
		patch_kit: '#7ad67a',
		overclock_chip: '#f2a93b',
		firewall_shard: '#79d1ff'
	};
</script>

<T.Group bind:ref={group}>
	<T.Mesh>
		<T.OctahedronGeometry args={[0.4]} />
		<T.MeshLambertMaterial color={colors[kind]} emissive={colors[kind]} emissiveIntensity={0.35} />
	</T.Mesh>
</T.Group>
