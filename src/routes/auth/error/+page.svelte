<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';

	const code = $derived(page.url.searchParams.get('code'));
</script>

<div class="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
	<h1 class="gilded font-display text-4xl font-bold">Sign-in failed</h1>
	{#if code}
		<p class="text-bone-2 italic">Error code: {code}</p>
	{/if}
	<a href={resolve('/sign-in')} class="mt-4 btn btn-ghost">Try again</a>
</div>
