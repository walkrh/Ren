<script lang="ts">
	// Race body with its weapon out front so facing is readable; a ground ring marks you (green)
	// and allies (blue). Remote players read the interpolator.
	// Melee swings sweep the race's weapon across its real arc and flash the hit area on the ground.
	import { T, useTask } from '@threlte/core';
	import type { Group, Mesh, MeshBasicMaterial } from 'three';
	import { useRuntime } from '#lib/game/session.svelte.js';
	import { renderPose } from '#lib/game/sync.js';
	import { weapons, type MeleeWeapon } from '#lib/game/data/items.js';
	import type { RaceId } from '#lib/game/traits.js';
	import RaceBody from './RaceBody.svelte';

	let { id }: { id: string } = $props();
	const { world } = useRuntime();

	let group = $state.raw<Group | undefined>();
	let swingPivot = $state.raw<Group | undefined>();
	let arc = $state.raw<Mesh | undefined>();
	let arcMat = $state.raw<MeshBasicMaterial | undefined>();
	let flash = $state.raw<Mesh | undefined>();
	let race = $state<RaceId>('human');
	let armed = $state(true);
	let downed = $state(false);
	let shielded = $state(false);
	let local = $state(false);
	let meleeKey = $state<keyof typeof weapons>('shock_baton');

	const melee = $derived(weapons[meleeKey] as MeleeWeapon);
	const halfArc = $derived((melee.arcDegrees * Math.PI) / 360);
	/** How long the sweep animation lasts, independent of the cooldown. */
	const swingDuration = $derived(Math.min(0.3, (melee.cooldownMs / 1000) * 0.7));
	const style = $derived(
		{
			shock_baton: { color: '#79d1ff', len: 1.4, thick: 0.12, head: 0 },
			data_blade: { color: '#b9a3ff', len: 1.3, thick: 0.06, head: 0 },
			breaker_hammer: { color: '#38f0d0', len: 1.3, thick: 0.12, head: 0.45 }
		}[meleeKey as 'shock_baton' | 'data_blade' | 'breaker_hammer'] ?? {
			color: '#ffffff',
			len: 1.2,
			thick: 0.1,
			head: 0
		}
	);

	let swingAt = -Infinity;
	let muzzleAt = -Infinity;

	useTask(
		() => {
			const p = world.players.get(id);
			if (!p || !group) return;
			const pose = renderPose(p, world.now);
			group.position.set(pose.pos.x, 0, pose.pos.z);
			group.rotation.y = -pose.facing;
			if (downed !== (p.state === 'downed')) downed = p.state === 'downed';
			if (shielded !== p.shieldCharges > 0) shielded = p.shieldCharges > 0;
			if (local !== p.local) local = p.local;
			if (race !== p.race) race = p.race;
			if (meleeKey !== p.hotbar.melee) meleeKey = p.hotbar.melee;

			for (const fx of world.fx) {
				if (fx.type === 'swing' && fx.playerId === id) swingAt = world.time;
				if (fx.type === 'muzzle' && fx.playerId === id) muzzleAt = world.time;
			}

			// Swing: sweep from one edge of the arc to the other, then hide.
			const u = (world.time - swingAt) / swingDuration;
			const swinging = u >= 0 && u < 1;
			if (swingPivot) {
				swingPivot.visible = swinging;
				if (swinging) {
					const eased = 1 - (1 - u) * (1 - u);
					swingPivot.rotation.y = halfArc - eased * 2 * halfArc;
				}
			}
			if (arc && arcMat) {
				const fade = (world.time - swingAt) / (swingDuration * 1.5);
				arc.visible = fade >= 0 && fade < 1;
				arcMat.opacity = 0.35 * (1 - Math.max(0, fade));
			}
			if (armed === swinging) armed = !swinging;
			if (flash) flash.visible = world.time - muzzleAt < 0.05;
		},
		{ after: 'sim' }
	);
</script>

<T.Group bind:ref={group} scale.y={downed ? 0.35 : 1}>
	<T.Mesh rotation.x={-Math.PI / 2} position.y={0.04}>
		<T.RingGeometry args={[0.6, 0.72, 24]} />
		<T.MeshBasicMaterial color={local ? '#9cf05a' : '#6aa0d6'} transparent opacity={0.8} />
	</T.Mesh>
	<!-- weapon points along +x, the facing direction -->
	<RaceBody {race} {armed} />
	<T.Mesh bind:ref={flash} position={[1.35, 1.05, 0.2]} visible={false}>
		<T.SphereGeometry args={[0.22, 6, 5]} />
		<T.MeshBasicMaterial color="#fff2b0" />
	</T.Mesh>

	<!-- Melee: weapon on a pivot at the body, swept across the arc -->
	<T.Group bind:ref={swingPivot} position.y={1.0} visible={false}>
		<T.Mesh position.x={0.35 + style.len / 2}>
			<T.BoxGeometry args={[style.len, style.thick, style.thick * 2]} />
			<T.MeshBasicMaterial color={style.color} />
		</T.Mesh>
		{#if style.head > 0}
			<T.Mesh position.x={0.35 + style.len}>
				<T.BoxGeometry args={[style.head, style.head, style.head]} />
				<T.MeshLambertMaterial color="#8a8f99" />
			</T.Mesh>
		{/if}
	</T.Group>

	<!-- Hit area: a flat sector matching the weapon's reach and arc -->
	<T.Mesh bind:ref={arc} rotation.x={-Math.PI / 2} position.y={0.06} visible={false}>
		<T.RingGeometry args={[0.5, melee.range + 0.5, 16, 1, -halfArc, halfArc * 2]} />
		<T.MeshBasicMaterial
			bind:ref={arcMat}
			color={style.color}
			transparent
			opacity={0.35}
			depthWrite={false}
		/>
	</T.Mesh>

	{#if shielded}
		<T.Mesh position.y={0.9}>
			<T.SphereGeometry args={[0.95, 12, 8]} />
			<T.MeshBasicMaterial color="#79d1ff" transparent opacity={0.25} wireframe />
		</T.Mesh>
	{/if}
</T.Group>
