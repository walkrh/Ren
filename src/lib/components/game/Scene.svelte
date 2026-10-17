<script lang="ts">
	// Owns the per-frame tasks: aim -> sim -> camera. Entities are keyed components below.
	import { T, useTask, useThrelte } from '@threlte/core';
	import { useRuntime } from '#lib/game/session.svelte.js';
	import { localPlayer } from '#lib/game/world.js';
	import { ARENA } from '#lib/game/data/waves.js';
	import { groundPointFromNdc } from './aim';
	import Ground from './map/Ground.svelte';
	import Landmarks from './map/Landmarks.svelte';
	import PlayerMesh from './PlayerMesh.svelte';
	import EnemyMesh from './EnemyMesh.svelte';
	import PickupMesh from './PickupMesh.svelte';
	import Projectiles from './Projectiles.svelte';
	import AimCursor from './AimCursor.svelte';
	import type { OrthographicCamera } from 'three';

	const { session, world, loop, sync, input } = useRuntime();
	const { camera, size } = useThrelte();

	let cam = $state.raw<OrthographicCamera | undefined>();
	const VIEW_UNITS = 34; // arena units visible across the canvas width
	const zoom = $derived(Math.max(8, $size.width / VIEW_UNITS));

	// Camera rig: above and slightly behind the local player so bodies read as upright.
	const camOffset = { x: 0, y: 40, z: 18 };
	let camTarget = { x: 0, z: 0 };

	useTask(
		'aim',
		() => {
			if (camera.current) groundPointFromNdc(camera.current, input.ndc, input.aim);
		},
		{ before: 'sim' }
	);

	useTask('sim', (delta) => {
		loop.tick(delta);
		session.publish({ ready: sync.ready, error: sync.lastError });
	});

	useTask(
		'cam',
		() => {
			const me = localPlayer(world);
			if (!cam) return;
			if (me) {
				camTarget = {
					x: camTarget.x + (me.pos.x - camTarget.x) * 0.15,
					z: camTarget.z + (me.pos.z - camTarget.z) * 0.15
				};
			}
			cam.position.set(camTarget.x + camOffset.x, camOffset.y, camTarget.z + camOffset.z);
			cam.lookAt(camTarget.x, 0, camTarget.z);
		},
		{ after: 'sim' }
	);
</script>

<T.OrthographicCamera
	makeDefault
	bind:ref={cam}
	{zoom}
	near={0.1}
	far={200}
	position={[0, 40, 18]}
/>

<!-- Blackout: no grid power anywhere, only moonlight and whatever each faction burns -->
<T.AmbientLight color="#a4abc4" intensity={0.7} />
<T.DirectionalLight position={[-12, 30, 8]} color="#d0d8f0" intensity={1.6} />
<T.HemisphereLight args={[0x52608a, 0x2a1a12, 0.5]} />

<Ground halfWidth={ARENA.halfWidth} halfDepth={ARENA.halfDepth} />
<Landmarks halfWidth={ARENA.halfWidth} halfDepth={ARENA.halfDepth} />

{#each session.playerIds as id (id)}
	<PlayerMesh {id} />
{/each}
{#each session.enemyIds as id (id)}
	<EnemyMesh key={id} />
{/each}
{#each session.pickupIds as id (id)}
	<PickupMesh key={id} />
{/each}
<Projectiles />
<AimCursor />
