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
		<div class="pixel text-[10px] text-bone-2">HP {Math.ceil(hud.hp)} / {hud.maxHp}</div>
		<div class="pixel-box h-4 w-56 bg-ink-2">
			<div
				class="h-full"
				class:bg-rot={hpFrac > 0.5}
				class:bg-gold={hpFrac <= 0.5 && hpFrac > 0.25}
				class:bg-blood={hpFrac <= 0.25}
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
			<div class="pixel text-xs text-bone">Get ready</div>
		{:else}
			<div class="pixel text-xs text-bone">Wave {hud.wave} / {hud.bossWave}</div>
		{/if}
		{#if hud.waveState === 'intermission' && hud.status === 'active'}
			<div class="mt-1 text-lg text-rot">Next wave in {secs(hud.nextWaveInMs)}s</div>
		{:else if hud.status === 'active'}
			<div class="mt-1 text-lg text-bone-2">{hud.enemiesLeft} left</div>
		{/if}
		{#if hud.bossMaxHp > 0}
			<div class="mt-2 w-80">
				<div class="pixel text-[10px] text-blood">Overlord · phase {hud.bossPhase}</div>
				<div class="pixel-box mt-1 h-3 w-full bg-ink-2 pixel-box-blood">
					<div class="h-full bg-blood" style="width: {bossFrac * 100}%"></div>
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
		<div class="pixel-box w-36 bg-surface px-3 py-2" class:pixel-box-rot={hud.slot === 'main'}>
			<div class="pixel text-[8px] text-ash">1 · main</div>
			<div class="text-sm text-bone">{hud.mainName}</div>
			{#if hud.reloading}
				<div class="mt-1 h-2 w-full bg-ink-2">
					<div class="h-full bg-gold" style="width: {hud.reloadFraction * 100}%"></div>
				</div>
			{:else}
				<div
					class="pixel text-[10px]"
					class:text-blood={hud.ammo === 0}
					class:text-bone-2={hud.ammo > 0}
				>
					{hud.ammo} / {hud.clipSize}
				</div>
			{/if}
		</div>
		<div class="pixel-box w-36 bg-surface px-3 py-2" class:pixel-box-rot={hud.slot === 'melee'}>
			<div class="pixel text-[8px] text-ash">2 · melee</div>
			<div class="text-sm text-bone">{hud.meleeName}</div>
			<div class="pixel text-[10px] text-bone-2">RMB / F</div>
		</div>
		<div
			class="pixel-box w-36 bg-surface px-3 py-2"
			class:pixel-box-rot={hud.abilityCooldownMs === 0}
		>
			<div class="pixel text-[8px] text-ash">3 · ability</div>
			<div class="text-sm text-bone">{hud.abilityName}</div>
			<div class="pixel text-[10px] text-bone-2">
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
			<div class="pixel text-xs text-bone-2">Connecting…</div>
		</div>
	{:else if hud.status === 'victory'}
		<div
			class="pointer-events-auto absolute inset-0 flex flex-col items-center justify-center gap-6 bg-ink/80"
		>
			<div class="pixel text-4xl text-rot pixel-shadow">Victory</div>
			<div class="text-bone-2">The Overlord is down.</div>
			<a href={resolve('/lobbies')} class="menu-item pixel-btn w-64 pixel-box-rot">Back to lobby</a>
		</div>
	{:else if hud.status === 'defeat'}
		<div
			class="pointer-events-auto absolute inset-0 flex flex-col items-center justify-center gap-6 bg-ink/80"
		>
			<div class="pixel text-4xl text-blood pixel-shadow">Defeat</div>
			<div class="text-bone-2">Wave {hud.wave}. The machines win this one.</div>
			<a href={resolve('/lobbies')} class="menu-item pixel-btn w-64 pixel-box-blood"
				>Back to lobby</a
			>
		</div>
	{:else if hud.downed}
		<div class="absolute inset-0 flex items-center justify-center bg-blood/20">
			<div class="pixel text-xl text-blood pixel-shadow-sm">Downed</div>
		</div>
	{/if}
</div>
