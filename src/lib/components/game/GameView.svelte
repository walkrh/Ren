<script lang="ts">
	// Builds the world, sync, loop and input for one game and provides them to the scene + HUD.
	// Mounted only once the viewer id is known, so context can be set synchronously.
	import { onMount, untrack } from 'svelte';
	import { useConvexClient } from 'convex-svelte';
	import type { Id } from '../../../convex/_generated/dataModel';
	import { createWorld } from '#lib/game/world.js';
	import { GameSync } from '#lib/game/sync.js';
	import { InputController } from '#lib/game/input.js';
	import { createGameLoop } from '#lib/game/loop.js';
	import { createRng } from '#lib/game/rng.js';
	import { GameSession, provideRuntime } from '#lib/game/session.svelte.js';
	import GameCanvas from './GameCanvas.svelte';
	import Hud from './Hud.svelte';

	let { gameId: gameIdProp, userId: userIdProp }: { gameId: string; userId: string } = $props();
	// The parent re-keys this component per game, so the ids are fixed for its lifetime.
	const gameId = untrack(() => gameIdProp);
	const userId = untrack(() => userIdProp);

	const client = useConvexClient();
	const world = createWorld({
		gameId,
		localUserId: userId,
		game: {
			hostUserId: '',
			status: 'active',
			wave: 0,
			waveState: 'intermission',
			waveEnemiesRemaining: 0,
			nextWaveAt: null,
			bossSpawned: false,
			seed: 0,
			hostSeenAt: Date.now()
		}
	});
	const sync = new GameSync(client, gameId as Id<'games'>, world);
	const input = new InputController();
	const session = new GameSession(world);
	const loop = createGameLoop({
		world,
		input: () => input.frame(),
		ready: () => sync.ready,
		sync,
		rng: createRng(Date.now() >>> 0)
	});

	provideRuntime({ session, world, loop, sync, input });

	onMount(() => {
		sync.start();
		return () => sync.stop();
	});
</script>

<div class="relative h-dvh w-full overflow-hidden bg-ink">
	<GameCanvas />
	<Hud />
</div>
