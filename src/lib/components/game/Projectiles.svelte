<script lang="ts">
	// All projectiles in one InstancedMesh; tracers (hitscan) are short-lived stretched boxes.
	import { T, useTask } from '@threlte/core';
	import { InstancedMesh, Matrix4, Object3D, Color } from 'three';
	import { useRuntime } from '#lib/game/session.svelte.js';

	const { world } = useRuntime();
	const CAP = 256;
	let shots = $state.raw<InstancedMesh | undefined>();
	let tracers = $state.raw<InstancedMesh | undefined>();
	const dummy = new Object3D();
	const hidden = new Matrix4().makeScale(0, 0, 0);
	const playerColor = new Color('#ffe9a8');
	const enemyColor = new Color('#ff5a5a');

	type Tracer = { fx: number; fz: number; tx: number; tz: number; ttl: number };
	let live: Tracer[] = [];

	useTask(
		(delta) => {
			if (shots) {
				let i = 0;
				for (const pr of world.projectiles) {
					if (i >= CAP) break;
					dummy.position.set(pr.pos.x, 1.0, pr.pos.z);
					dummy.rotation.set(0, -Math.atan2(pr.vel.z, pr.vel.x), 0);
					const s = pr.owner === 'player' ? 1 : 1.3;
					dummy.scale.set(s, s, s);
					dummy.updateMatrix();
					shots.setMatrixAt(i, dummy.matrix);
					shots.setColorAt(i, pr.owner === 'player' ? playerColor : enemyColor);
					i++;
				}
				for (; i < CAP; i++) shots.setMatrixAt(i, hidden);
				shots.instanceMatrix.needsUpdate = true;
				if (shots.instanceColor) shots.instanceColor.needsUpdate = true;
			}
			for (const fx of world.fx) {
				if (fx.type === 'tracer')
					live.push({ fx: fx.from.x, fz: fx.from.z, tx: fx.to.x, tz: fx.to.z, ttl: 0.07 });
			}
			if (tracers) {
				let i = 0;
				const keep: Tracer[] = [];
				for (const t of live) {
					t.ttl -= delta;
					if (t.ttl <= 0) continue;
					keep.push(t);
					if (i >= CAP) continue;
					const dx = t.tx - t.fx;
					const dz = t.tz - t.fz;
					const len = Math.hypot(dx, dz);
					dummy.position.set((t.fx + t.tx) / 2, 1.0, (t.fz + t.tz) / 2);
					dummy.rotation.set(0, -Math.atan2(dz, dx), 0);
					dummy.scale.set(len, 1, 1);
					dummy.updateMatrix();
					tracers.setMatrixAt(i, dummy.matrix);
					i++;
				}
				live = keep;
				for (; i < CAP; i++) tracers.setMatrixAt(i, hidden);
				tracers.instanceMatrix.needsUpdate = true;
			}
		},
		{ after: 'sim' }
	);
</script>

<T.InstancedMesh bind:ref={shots} args={[undefined, undefined, CAP]} frustumCulled={false}>
	<T.SphereGeometry args={[0.18, 6, 5]} />
	<T.MeshBasicMaterial color="#ffffff" />
</T.InstancedMesh>
<T.InstancedMesh bind:ref={tracers} args={[undefined, undefined, CAP]} frustumCulled={false}>
	<T.BoxGeometry args={[1, 0.06, 0.06]} />
	<T.MeshBasicMaterial color="#9fe8ff" />
</T.InstancedMesh>
