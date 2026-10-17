<script lang="ts">
	// One mesh per enemy. Every Overlord machine shares gunmetal plate and a red eye, so
	// anything with a red eye is a target; the silhouette tells you which kind.
	// The ID stealer renders as the player it copies until it is revealed; the scout floats
	// over its own shadow; the overlord grows and spins up with each phase.
	import { T, useTask } from '@threlte/core';
	import type { Group, Mesh } from 'three';
	import { useRuntime } from '#lib/game/session.svelte.js';
	import { renderEnemyPose } from '#lib/game/sync.js';
	import { enemies as defs, type EnemyType } from '#lib/game/data/enemies.js';
	import type { RaceId } from '#lib/game/traits.js';
	import RaceBody from './RaceBody.svelte';

	let { key }: { key: string } = $props();
	const { world } = useRuntime();

	let group = $state.raw<Group | undefined>();
	let spinner = $state.raw<Group | undefined>();
	let shadow = $state.raw<Mesh | undefined>();
	let bar = $state.raw<Group | undefined>();
	let type = $state<EnemyType>('mobile_tank');
	let disguise = $state<RaceId | null>(null);
	let phase = $state(1);
	let hpFrac = $state(1);
	let stunned = $state(false);
	let flashing = $state(false);
	let lastHp = -1;
	let flashUntil = 0;
	let visible = $state(true);

	useTask(
		(delta) => {
			const e = world.enemies.get(key);
			if (!e || !group) return;
			const pose = renderEnemyPose(e, world.now);
			const hover = e.hovering ? 1.6 + Math.sin(world.time * 3 + pose.pos.x) * 0.15 : 0;
			group.position.set(pose.pos.x, hover, pose.pos.z);
			group.rotation.y = -pose.facing;
			if (shadow) shadow.position.y = 0.03 - hover;
			// Undo the body's yaw so the health bar always lies flat and level on screen.
			bar?.rotation.set(-Math.PI / 2, pose.facing, 0, 'YXZ');
			if (type !== e.type) type = e.type;
			// A disguise whose target has left still has to look like someone: fall back to human.
			const d = e.disguisedAs ? (world.players.get(e.disguisedAs)?.race ?? 'human') : null;
			if (disguise !== d) disguise = d;
			if (phase !== e.bossPhase) phase = e.bossPhase;
			const f = Math.max(0, e.hp / e.maxHp);
			if (Math.abs(f - hpFrac) > 0.01) hpFrac = f;
			const s = e.stunUntil > world.now;
			if (stunned !== s) stunned = s;
			// Flash white for a moment whenever hp drops, so every landed hit is visible.
			if (lastHp >= 0 && e.hp < lastHp) flashUntil = world.time + 0.1;
			lastHp = e.hp;
			const fl = world.time < flashUntil;
			if (flashing !== fl) flashing = fl;
			if (visible === e.dying) visible = !e.dying;
			// Drill bits, rotors and the overlord's rings; stunned machines stop turning.
			if (spinner && !s) spinner.rotation.x += delta * (type === 'overlord' ? phase * 1.2 : 14);
		},
		{ after: 'sim' }
	);

	const EYE = '#ff2a1f';
	const plate = $derived(
		stunned || flashing
			? '#ffffff'
			: {
					mobile_tank: '#5a5f68',
					gun_drone: '#4a4f58',
					scout: '#646a74',
					id_stealer: '#a6acb6',
					overlord: '#2e3138'
				}[type]
	);
	const bossScale = $derived(type === 'overlord' ? 1 + (phase - 1) * 0.15 : 1);
	const radius = $derived(defs[type].radius);
	const barY = $derived(
		{ mobile_tank: 1.9, gun_drone: 1.9, scout: 1.0, id_stealer: 2.5, overlord: 4.6 * bossScale }[
			type
		]
	);
</script>

<T.Group bind:ref={group} {visible}>
	{#if disguise}
		<!-- Looks exactly like the teammate it copies, ally ring and all -->
		<T.Mesh rotation.x={-Math.PI / 2} position.y={0.04}>
			<T.RingGeometry args={[0.6, 0.72, 24]} />
			<T.MeshBasicMaterial color="#6aa0d6" transparent opacity={0.8} />
		</T.Mesh>
		<RaceBody race={disguise} />
	{:else if type === 'mobile_tank'}
		<!-- Harvester: tracked hull with a mining drill where a cannon would be -->
		{#each [-0.62, 0.62] as tz (tz)}
			<T.Mesh position={[0, 0.25, tz]}>
				<T.BoxGeometry args={[1.9, 0.5, 0.45]} />
				<T.MeshLambertMaterial color="#1b1d21" />
			</T.Mesh>
		{/each}
		<T.Mesh position.y={0.7}>
			<T.BoxGeometry args={[1.5, 0.55, 0.9]} />
			<T.MeshLambertMaterial color={plate} flatShading />
		</T.Mesh>
		<T.Mesh position={[0.78, 0.6, 0]}>
			<T.BoxGeometry args={[0.08, 0.35, 0.85]} />
			<T.MeshLambertMaterial color="#d49a1c" />
		</T.Mesh>
		<T.Mesh position={[-0.15, 1.2, 0]}>
			<T.BoxGeometry args={[0.8, 0.45, 0.7]} />
			<T.MeshLambertMaterial color={plate} flatShading />
		</T.Mesh>
		<T.Mesh position={[0.26, 1.24, 0]}>
			<T.BoxGeometry args={[0.04, 0.1, 0.5]} />
			<T.MeshBasicMaterial color={EYE} />
		</T.Mesh>
		<T.Group bind:ref={spinner} position={[1.25, 0.7, 0]}>
			<T.Mesh rotation.z={-Math.PI / 2}>
				<T.ConeGeometry args={[0.3, 0.9, 6]} />
				<T.MeshLambertMaterial color="#9aa0a8" flatShading />
			</T.Mesh>
		</T.Group>
	{:else if type === 'gun_drone'}
		<!-- Quad drone: four rotors on a cross, gun slung underneath -->
		<T.Group position.y={1.1}>
			<T.Mesh scale={[1, 0.65, 1]}>
				<T.SphereGeometry args={[0.32, 10, 8]} />
				<T.MeshLambertMaterial color={plate} flatShading />
			</T.Mesh>
			<T.Mesh position.x={0.28}>
				<T.SphereGeometry args={[0.11, 8, 6]} />
				<T.MeshBasicMaterial color={EYE} />
			</T.Mesh>
			{#each [Math.PI / 4, -Math.PI / 4] as a (a)}
				<T.Mesh rotation.y={a}>
					<T.BoxGeometry args={[1.35, 0.06, 0.08]} />
					<T.MeshLambertMaterial color="#25282d" />
				</T.Mesh>
			{/each}
			{#each [[0.48, 0.48], [0.48, -0.48], [-0.48, 0.48], [-0.48, -0.48]] as [rx, rz], i (i)}
				<T.Mesh position={[rx, 0.06, rz]}>
					<T.CylinderGeometry args={[0.24, 0.24, 0.02, 12]} />
					<T.MeshBasicMaterial color="#aab3bd" transparent opacity={0.35} />
				</T.Mesh>
			{/each}
			<T.Mesh position={[0.3, -0.22, 0]}>
				<T.BoxGeometry args={[0.5, 0.08, 0.08]} />
				<T.MeshLambertMaterial color="#1b1d21" />
			</T.Mesh>
		</T.Group>
	{:else if type === 'scout'}
		<!-- Dart: fast and out of melee reach, so it gets a ground shadow -->
		<T.Mesh bind:ref={shadow} rotation.x={-Math.PI / 2}>
			<T.CircleGeometry args={[0.45, 12]} />
			<T.MeshBasicMaterial color="#000000" transparent opacity={0.35} depthWrite={false} />
		</T.Mesh>
		<T.Group position.y={0.4}>
			<T.Mesh rotation={[Math.PI / 4, 0, -Math.PI / 2]} scale={[1, 1, 0.5]}>
				<T.ConeGeometry args={[0.32, 1.0, 4]} />
				<T.MeshLambertMaterial color={plate} flatShading />
			</T.Mesh>
			<T.Mesh position.x={-0.15}>
				<T.BoxGeometry args={[0.45, 0.04, 1.1]} />
				<T.MeshLambertMaterial color="#2f3339" />
			</T.Mesh>
			<T.Mesh position={[0.22, 0.08, 0]}>
				<T.SphereGeometry args={[0.08, 6, 5]} />
				<T.MeshBasicMaterial color={EYE} />
			</T.Mesh>
			<T.Mesh position.x={-0.52}>
				<T.SphereGeometry args={[0.12, 6, 5]} />
				<T.MeshBasicMaterial color="#ffb347" />
			</T.Mesh>
		</T.Group>
	{:else if type === 'id_stealer'}
		<!-- Faceless chrome mimic: a visor where the face should be, claws reaching out -->
		<T.Mesh position.y={1.0}>
			<T.CapsuleGeometry args={[0.36, 1.0, 4, 8]} />
			<T.MeshLambertMaterial color={plate} />
		</T.Mesh>
		<T.Mesh position.y={2.0}>
			<T.SphereGeometry args={[0.26, 10, 8]} />
			<T.MeshLambertMaterial color={plate} />
		</T.Mesh>
		<T.Mesh position.y={2.0} rotation.x={Math.PI / 2}>
			<T.TorusGeometry args={[0.26, 0.045, 4, 16]} />
			<T.MeshBasicMaterial color="#ff3df0" />
		</T.Mesh>
		<T.Mesh position={[0.24, 2.0, 0]}>
			<T.BoxGeometry args={[0.06, 0.07, 0.3]} />
			<T.MeshBasicMaterial color={EYE} />
		</T.Mesh>
		{#each [-0.38, 0.38] as az (az)}
			<T.Mesh position={[0.45, 1.25, az]}>
				<T.BoxGeometry args={[0.9, 0.09, 0.09]} />
				<T.MeshLambertMaterial color="#6c7280" />
			</T.Mesh>
			<T.Mesh position={[0.95, 1.25, az]} rotation.z={-Math.PI / 2}>
				<T.ConeGeometry args={[0.08, 0.25, 4]} />
				<T.MeshBasicMaterial color="#ff3df0" />
			</T.Mesh>
		{/each}
	{:else}
		<!-- The Overlord itself: a monolith with one eye, its rings spinning faster each phase -->
		<T.Group scale={bossScale}>
			<T.Mesh position.y={0.25}>
				<T.CylinderGeometry args={[1.8, 1.9, 0.5, 8]} />
				<T.MeshLambertMaterial color="#1b1d22" flatShading />
			</T.Mesh>
			<T.Mesh position.y={1.85}>
				<T.CylinderGeometry args={[0.85, 1.35, 2.7, 6]} />
				<T.MeshLambertMaterial
					color={plate}
					emissive={phase === 3 ? '#ff4a1a' : '#000000'}
					emissiveIntensity={0.4}
					flatShading
				/>
			</T.Mesh>
			<T.Mesh position={[1.0, 2.35, 0]}>
				<T.SphereGeometry args={[0.5, 12, 10]} />
				<T.MeshBasicMaterial color={phase === 3 ? '#ff8a3a' : EYE} />
			</T.Mesh>
			{#each [-1.2, 1.2] as cz (cz)}
				<T.Mesh position={[0.5, 2.3, cz]}>
					<T.BoxGeometry args={[1.5, 0.35, 0.35]} />
					<T.MeshLambertMaterial color="#3a3e46" />
				</T.Mesh>
				<T.Mesh position={[1.27, 2.3, cz]}>
					<T.BoxGeometry args={[0.05, 0.2, 0.2]} />
					<T.MeshBasicMaterial color={EYE} />
				</T.Mesh>
			{/each}
			{#each [-0.35, 0, 0.35] as sz (sz)}
				<T.Mesh position={[-0.1, 3.5, sz]}>
					<T.ConeGeometry args={[0.1, 0.7, 4]} />
					<T.MeshLambertMaterial color="#1b1d22" />
				</T.Mesh>
			{/each}
			<T.Group bind:ref={spinner} position.y={2.0}>
				<T.Mesh rotation.y={0.4}>
					<T.TorusGeometry args={[2.1, 0.06, 4, 32]} />
					<T.MeshBasicMaterial color={EYE} />
				</T.Mesh>
				{#if phase >= 2}
					<T.Mesh rotation.y={-0.6}>
						<T.TorusGeometry args={[2.35, 0.05, 4, 32]} />
						<T.MeshBasicMaterial color="#ff6a3a" />
					</T.Mesh>
				{/if}
			</T.Group>
		</T.Group>
	{/if}
	<!-- Health bar: a bar that shrinks from the right -->
	{#if !disguise && hpFrac < 1}
		<T.Group bind:ref={bar} position.y={barY}>
			<T.Mesh>
				<T.PlaneGeometry args={[radius * 2.2, 0.14]} />
				<T.MeshBasicMaterial color="#111" />
			</T.Mesh>
			<T.Mesh position.x={(-radius * 2.2 * (1 - hpFrac)) / 2} position.z={0.01}>
				<T.PlaneGeometry args={[radius * 2.2 * hpFrac, 0.14]} />
				<T.MeshBasicMaterial color="#e0453a" />
			</T.Mesh>
		</T.Group>
	{/if}
</T.Group>
