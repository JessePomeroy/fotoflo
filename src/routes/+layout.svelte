<script lang="ts">
  import { onMount } from 'svelte';
  import { NeoThemeProvider } from '@dvcol/neo-svelte';
  let { children } = $props();
  let mounted = $state(false);
  
  onMount(() => {
    mounted = true;
  });
</script>

<svelte:head>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="theme-color" content="#DCE7EE" />
  <link rel="manifest" href="/manifest.webmanifest" />
</svelte:head>

{#if mounted}
  <NeoThemeProvider>
    {@render children()}
  </NeoThemeProvider>
{:else}
  {@render children()}
{/if}
