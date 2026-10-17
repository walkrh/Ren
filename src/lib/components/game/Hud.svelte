<script lang="ts">
	// DOM overlay over the canvas. Reads only the session's published scalars.
	import { resolve } from '$app/paths';
	import { useSession } from '#lib/game/session.svelte.js';

	const session = useSession();
	const hud = $derived(session.hud);
	const hpFrac = $derived(hud.maxHp > 0 ? Math.max(0, hud.hp / hud.maxHp) : 0);
	const bossFrac = $derived(hud.bossMaxHp > 0 ? Math.max(0, hud.bossHp / hud.bossMaxHp) : 0);
	const secs = (ms: number) => Math.ceil(ms / 1000);
</script>

<div class="pointer-events-none absolute inset-0 z-10 select-none">
	<!-- Top left: vitals -->
	<div class="absolute top-4 left-4 flex flex-col gap-2">
		<div class="caps text-bone-2">HP {Math.ceil(hud.hp)} / {hud.maxHp}</div>
		<div class="h-3 w-56 rounded-[2px] border border-line-2 bg-ink-2">
			<div
				class={[
					'h-full transition-[width] duration-200',
					hpFrac > 0.5 ? 'bg-gold' : hpFrac > 0.25 ? 'bg-flame' : 'bg-blood'
				]}
				style="width: {hpFrac * 100}%"
			></div>
		</div>
		<div class="flex gap-3 text-sm text-bone-2">
			{#if hud.shieldCharges > 0}<span class="text-[#79d1ff]">◆ Firewall ×{hud.shieldCharges}</span
				>{/if}
			{#if hud.overclockMs > 0}<span class="text-gold">⚡ Overclock {secs(hud.overclockMs)}s</span
				>{/if}
		</div>
	</div>

	<!-- Top centre: wave -->
	<div class="absolute top-4 left-1/2 -translate-x-1/2 text-center">
		{#if hud.wave === 0}
			<div class="font-heading text-sm font-semibold tracking-[0.18em] text-bone uppercase">
				Get ready
			</div>
		{:else}
			<div class="font-heading text-sm font-semibold tracking-[0.18em] text-bone uppercase">
				Wave {hud.wave} / {hud.bossWave}
			</div>
		{/if}
		{#if hud.waveState === 'intermission' && hud.status === 'active'}
			<div class="mt-1 text-lg text-gold-3 italic">Next wave in {secs(hud.nextWaveInMs)}s</div>
		{:else if hud.status === 'active'}
			<div class="mt-1 text-lg text-bone-2 italic">{hud.enemiesLeft} left</div>
		{/if}
		{#if hud.bossMaxHp > 0}
			<div class="mt-2 w-80">
				<div class="caps text-machine">Overlord · phase {hud.bossPhase}</div>
				<div class="mt-1 h-3 w-full rounded-[2px] border border-crimson bg-ink-2">
					<div class="h-full bg-machine" style="width: {bossFrac * 100}%"></div>
				</div>
			</div>
		{/if}
	</div>

	<!-- Top right: host / errors -->
	<div class="absolute top-4 right-4 text-right text-sm text-ash">
		{#if hud.isHost}<div>host</div>{/if}
		{#if hud.error}<div class="max-w-xs text-blood">{hud.error}</div>{/if}
	</div>

	<!-- Bottom centre: hotbar -->
	<div class="absolute bottom-5 left-1/2 flex -translate-x-1/2 gap-3">
		<div class={['w-36 panel px-3 py-2', hud.slot === 'main' && 'panel-lit']}>
			<div class="caps text-ash">1 · main</div>
			<div class="font-heading text-sm text-bone">{hud.mainName}</div>
			{#if hud.reloading}
				<div class="mt-1 h-2 w-full bg-ink-2">
					<div class="h-full bg-gold" style="width: {hud.reloadFraction * 100}%"></div>
				</div>
			{:else}
				<div class={['font-heading text-xs', hud.ammo === 0 ? 'text-blood' : 'text-bone-2']}>
					{hud.ammo} / {hud.clipSize}
				</div>
			{/if}
		</div>
		<div class={['w-36 panel px-3 py-2', hud.slot === 'melee' && 'panel-lit']}>
			<div class="caps text-ash">2 · melee</div>
			<div class="font-heading text-sm text-bone">{hud.meleeName}</div>
			<div class="font-heading text-xs text-bone-2">RMB / F</div>
		</div>
		<div class={['w-36 panel px-3 py-2', hud.abilityCooldownMs === 0 && 'panel-lit']}>
			<div class="caps text-ash">3 · ability</div>
			<div class="font-heading text-sm text-bone">{hud.abilityName}</div>
			<div class="font-heading text-xs text-bone-2">
				{#if hud.abilityCooldownMs > 0}{secs(hud.abilityCooldownMs)}s{:else}Space{/if}
			</div>
		</div>
	</div>

	<!-- Bottom left: controls -->
	<div class="absolute bottom-5 left-4 text-sm text-ash">
		WASD move · mouse aim · LMB fire · R reload
	</div>

	<!-- Overlays -->
	{#if !hud.ready}
		<div class="absolute inset-0 flex items-center justify-center bg-ink/70">
			<div class="animate-flicker text-bone-2 italic">Connecting…</div>
		</div>
	{:else if hud.status === 'victory'}
		<div
			class="pointer-events-auto absolute inset-0 flex flex-col items-center justify-center gap-6 bg-ink/80"
		>
			<div class="gilded font-display text-5xl font-black tracking-[0.08em]">Victory</div>
			<div class="text-bone-2">The Overlord is down.</div>
			<a href={resolve('/lobbies')} class="btn w-64 btn-gold">Back to lobby</a>
		</div>
	{:else if hud.status === 'defeat'}
		<div
			class="pointer-events-auto absolute inset-0 flex flex-col items-center justify-center gap-6 bg-ink/80"
		>
			<div class="font-display text-5xl font-black tracking-[0.08em] text-blood">Defeat</div>
			<div class="text-bone-2">Wave {hud.wave}. The machines win this one.</div>
			<a href={resolve('/lobbies')} class="btn w-64 btn-ghost">Back to lobby</a>
		</div>
	{:else if hud.downed}
		<div class="absolute inset-0 flex items-center justify-center bg-crimson/25">
			<div class="font-display text-3xl font-bold text-blood">Downed</div>
		</div>
	{/if}
</div>
