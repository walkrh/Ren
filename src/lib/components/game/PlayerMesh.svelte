<script lang="ts">
	// Race body with its weapon out front so facing is readable; a ground ring marks you (green)
	// and allies (blue). Remote players read the interpolator.
	// Melee swings sweep the race's weapon across its real arc and flash the hit area on the ground.
	// Downed players topple over under a red beacon. A reviver kneels and links a beam to them,
	// a ring fills around them as motes rise, and they get back up in a burst of light.
	// Teammates carry a health bar overhead.
	import { T, useTask } from '@threlte/core';
	import { Quaternion, Vector3, type Group, type Mesh, type MeshBasicMaterial } from 'three';
	import { useRuntime } from '#lib/game/session.svelte.js';
	import { renderPose } from '#lib/game/sync.js';
	import { reviveProgress, revivingWhom } from '#lib/game/revive.js';
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
	let body = $state.raw<Group | undefined>();
	let ringMat = $state.raw<MeshBasicMaterial | undefined>();
	let beaconMat = $state.raw<MeshBasicMaterial | undefined>();
	let bar = $state.raw<Group | undefined>();
	let motes = $state.raw<Group | undefined>();
	let beam = $state.raw<Mesh | undefined>();
	let beamMat = $state.raw<MeshBasicMaterial | undefined>();
	let burst = $state.raw<Group | undefined>();
	let burstRingMat = $state.raw<MeshBasicMaterial | undefined>();
	let burstColumn = $state.raw<Mesh | undefined>();
	let burstColumnMat = $state.raw<MeshBasicMaterial | undefined>();
	let race = $state<RaceId>('human');
	let armed = $state(true);
	let downed = $state(false);
	let shielded = $state(false);
	let local = $state(false);
	let hpFrac = $state(1);
	let beingRevived = $state(false);
	/** revive progress in RING_STEPS steps, so the ring geometry is rebuilt at most that often */
	let ringStep = $state(0);
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
	let revivedAt = -Infinity;
	let wasDowned: boolean | null = null;
	/** 0 standing, 1 flat on the ground */
	let fall = 0;
	/** 0 standing, 1 kneeling over a teammate */
	let kneel = 0;

	const RING_STEPS = 40;
	const MOTES = [0, 1, 2, 3, 4, 5, 6, 7];
	const BURST_S = 0.8;
	const REVIVE_GLOW = '#b8ff8a';
	const up = new Vector3(0, 1, 0);
	const beamFrom = new Vector3();
	const beamDir = new Vector3();
	const beamRot = new Quaternion();

	function barColor(f: number) {
		return f > 0.5 ? '#9cf05a' : f > 0.25 ? '#e0b43a' : '#e0453a';
	}

	useTask(
		(delta) => {
			const p = world.players.get(id);
			if (!p || !group) return;
			const pose = renderPose(p, world.now);
			group.position.set(pose.pos.x, 0, pose.pos.z);
			group.rotation.y = -pose.facing;
			const isDowned = p.state === 'downed';
			// Back on their feet: only a transition counts, not mounting a standing player.
			if (wasDowned && !isDowned) revivedAt = world.time;
			wasDowned = isDowned;
			if (downed !== isDowned) downed = isDowned;
			const f = Math.max(0, Math.min(1, p.hp / p.maxHp));
			if (Math.abs(f - hpFrac) > 0.01) hpFrac = f;
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
			if (flash) flash.visible = world.time - muzzleAt < 0.05;

			// Revive: who is on whom, and how far along.
			const rv = reviveProgress(world, p);
			const kneeling = !isDowned && revivingWhom(world, id) !== null;
			if (beingRevived !== !!rv) beingRevived = !!rv;
			const step = rv ? Math.max(1, Math.round(rv.progress * RING_STEPS)) : 0;
			if (ringStep !== step) ringStep = step;
			const wantArmed = !swinging && !isDowned && !kneeling;
			if (armed !== wantArmed) armed = wantArmed;

			// Pose: topple when downed, rise halfway as the revive fills, kneel while reviving.
			const k = Math.min(1, delta * 8);
			fall += ((isDowned ? 1 - (rv?.progress ?? 0) * 0.5 : 0) - fall) * k;
			kneel += ((kneeling ? 1 : 0) - kneel) * k;
			if (body) {
				body.rotation.z = fall * (Math.PI / 2) - kneel * 0.35;
				body.position.y = fall * 0.35;
				body.scale.y = 1 - kneel * 0.25;
			}

			const pulse = 0.5 + 0.5 * Math.sin(world.time * 6);
			if (ringMat) ringMat.opacity = isDowned ? 0.45 + 0.45 * pulse : 0.8;
			if (beaconMat) beaconMat.opacity = rv ? 0.12 : 0.15 + 0.3 * pulse;
			bar?.rotation.set(-Math.PI / 2, pose.facing, 0, 'YXZ');

			// Motes spiral up around the downed player while the revive runs.
			if (motes && rv) {
				const n = motes.children.length;
				motes.children.forEach((m, i) => {
					const h = (world.time * 0.9 + i / n) % 1;
					const a = world.time * 2.5 + (i / n) * Math.PI * 2;
					m.position.set(Math.cos(a) * 0.85, 0.2 + h * 2.2, Math.sin(a) * 0.85);
					m.scale.setScalar((1 - h) * (0.6 + rv.progress));
				});
			}

			// Beam from the reviver's hands to the downed player's chest, in world space.
			const reviver = rv ? world.players.get(rv.reviverId) : undefined;
			if (beam && beamMat) {
				beam.visible = !!reviver;
				if (reviver) {
					const rp = renderPose(reviver, world.now).pos;
					beamFrom.set(rp.x, 0.9, rp.z);
					beamDir.set(pose.pos.x, 0.45, pose.pos.z).sub(beamFrom);
					const len = beamDir.length();
					beam.position.copy(beamFrom).addScaledVector(beamDir, 0.5);
					beam.quaternion.copy(beamRot.setFromUnitVectors(up, beamDir.normalize()));
					beam.scale.set(1, len, 1);
					beamMat.opacity = 0.45 + 0.35 * Math.sin(world.time * 14);
				}
			}

			// Burst: an expanding ring and a fading column of light.
			const b = (world.time - revivedAt) / BURST_S;
			if (burst) {
				burst.visible = b >= 0 && b < 1;
				if (burst.visible) {
					burst.children[0]?.scale.setScalar(1 + b * 4);
					if (burstRingMat) burstRingMat.opacity = 0.9 * (1 - b);
					if (burstColumn) burstColumn.scale.set(1 - b * 0.7, 1 + b * 0.5, 1 - b * 0.7);
					if (burstColumnMat) burstColumnMat.opacity = 0.5 * (1 - b);
				}
			}
		},
		{ after: 'sim' }
	);
</script>

<T.Group bind:ref={group}>
	<T.Mesh rotation.x={-Math.PI / 2} position.y={0.04}>
		<T.RingGeometry args={[0.6, 0.72, 24]} />
		<T.MeshBasicMaterial
			bind:ref={ringMat}
			color={downed ? '#e0453a' : local ? '#9cf05a' : '#6aa0d6'}
			transparent
			opacity={0.8}
		/>
	</T.Mesh>

	<!-- Body pivots at the feet: topples backwards when downed, hunches forward to revive -->
	<T.Group bind:ref={body}>
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

	<!-- Teammate health: a bar that shrinks from the right -->
	{#if !local && !downed}
		<T.Group bind:ref={bar} position.y={2.4}>
			<T.Mesh>
				<T.PlaneGeometry args={[1.3, 0.14]} />
				<T.MeshBasicMaterial color="#111" />
			</T.Mesh>
			<T.Mesh position.x={(-1.3 * (1 - hpFrac)) / 2} position.z={0.01} scale.x={hpFrac || 0.0001}>
				<T.PlaneGeometry args={[1.3, 0.14]} />
				<T.MeshBasicMaterial color={barColor(hpFrac)} />
			</T.Mesh>
		</T.Group>
	{/if}

	{#if downed}
		<!-- Beacon so a downed teammate is easy to find across the arena -->
		<T.Mesh position.y={3}>
			<T.CylinderGeometry args={[0.08, 0.08, 6, 6, 1, true]} />
			<T.MeshBasicMaterial
				bind:ref={beaconMat}
				color="#e0453a"
				transparent
				opacity={0.3}
				depthWrite={false}
			/>
		</T.Mesh>
	{/if}

	{#if ringStep > 0}
		<!-- Revive progress: fills clockwise from the front -->
		<T.Mesh rotation.x={-Math.PI / 2} position.y={0.05}>
			<T.RingGeometry
				args={[0.85, 1.05, RING_STEPS, 1, Math.PI / 2, -(ringStep / RING_STEPS) * Math.PI * 2]}
			/>
			<T.MeshBasicMaterial color={REVIVE_GLOW} transparent opacity={0.85} depthWrite={false} />
		</T.Mesh>
	{/if}

	{#if beingRevived}
		<T.Group bind:ref={motes}>
			{#each MOTES as i (i)}
				<T.Mesh>
					<T.BoxGeometry args={[0.12, 0.12, 0.12]} />
					<T.MeshBasicMaterial color={REVIVE_GLOW} />
				</T.Mesh>
			{/each}
		</T.Group>
	{/if}

	<T.Group bind:ref={burst} visible={false}>
		<T.Mesh rotation.x={-Math.PI / 2} position.y={0.06}>
			<T.RingGeometry args={[0.35, 0.55, 32]} />
			<T.MeshBasicMaterial
				bind:ref={burstRingMat}
				color={REVIVE_GLOW}
				transparent
				opacity={0}
				depthWrite={false}
			/>
		</T.Mesh>
		<T.Mesh bind:ref={burstColumn} position.y={2}>
			<T.CylinderGeometry args={[0.7, 0.7, 4, 16, 1, true]} />
			<T.MeshBasicMaterial
				bind:ref={burstColumnMat}
				color={REVIVE_GLOW}
				transparent
				opacity={0}
				depthWrite={false}
			/>
		</T.Mesh>
	</T.Group>
</T.Group>

<!-- Revive beam lives in world space, between two players -->
<T.Mesh bind:ref={beam} visible={false}>
	<T.CylinderGeometry args={[0.06, 0.06, 1, 6, 1, true]} />
	<T.MeshBasicMaterial
		bind:ref={beamMat}
		color={REVIVE_GLOW}
		transparent
		opacity={0.6}
		depthWrite={false}
	/>
</T.Mesh>
