<script lang="ts">
	// Arena floor, the wasteland beyond it, and the barricade ring on the arena edge.
	import { T } from '@threlte/core';
	import { Color, Object3D, type InstancedMesh } from 'three';
	import { arenaFloor, barricade, debris, wasteland } from './terrain';

	let { halfWidth, halfDepth }: { halfWidth: number; halfDepth: number } = $props();

	const floor = $derived(arenaFloor(halfWidth, halfDepth));
	const outside = wasteland(40);
	const blocks = $derived(barricade(halfWidth, halfDepth));
	const rubble = $derived(debris(halfWidth, halfDepth, 140));

	const dummy = new Object3D();
	const color = new Color();

	function placeBlocks(mesh: InstancedMesh) {
		blocks.forEach((b, i) => {
			dummy.position.set(b.x, b.h / 2, b.z);
			dummy.rotation.set(0, b.rotY, 0);
			dummy.scale.set(b.len, b.h, b.t);
			dummy.updateMatrix();
			mesh.setMatrixAt(i, dummy.matrix);
			mesh.setColorAt(i, color.set(b.color));
		});
		mesh.instanceMatrix.needsUpdate = true;
	}

	function placeRubble(mesh: InstancedMesh) {
		rubble.forEach((r, i) => {
			dummy.position.set(r.x, r.s * 0.3, r.z);
			dummy.rotation.set(0, r.rotY, 0);
			dummy.scale.set(r.s * 1.4, r.s, r.s);
			dummy.updateMatrix();
			mesh.setMatrixAt(i, dummy.matrix);
			mesh.setColorAt(i, color.set(r.color));
		});
		mesh.instanceMatrix.needsUpdate = true;
	}
</script>

<!-- Wasteland under and around everything -->
<T.Mesh rotation.x={-Math.PI / 2} position.y={-0.03}>
	<T.PlaneGeometry args={[200, 200]} />
	<T.MeshLambertMaterial map={outside} />
</T.Mesh>

<!-- The crossroads -->
<T.Mesh rotation.x={-Math.PI / 2} position.y={-0.01}>
	<T.PlaneGeometry args={[halfWidth * 2, halfDepth * 2]} />
	<T.MeshLambertMaterial
		map={floor.map}
		emissiveMap={floor.emissiveMap}
		emissive="#ffffff"
		emissiveIntensity={0.9}
	/>
</T.Mesh>

<T.InstancedMesh args={[undefined, undefined, blocks.length]} oncreate={placeBlocks}>
	<T.BoxGeometry />
	<T.MeshLambertMaterial flatShading />
</T.InstancedMesh>

<T.InstancedMesh args={[undefined, undefined, rubble.length]} oncreate={placeRubble}>
	<T.DodecahedronGeometry args={[1, 0]} />
	<T.MeshLambertMaterial flatShading />
</T.InstancedMesh>
