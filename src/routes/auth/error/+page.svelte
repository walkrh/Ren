<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';

	const code = $derived(page.url.searchParams.get('code'));
</script>

<h1>Sign-in failed</h1>
{#if code}
	<p>Error code: {code}</p>
{/if}
<a href={resolve('/sign-in')}>Try again</a>
