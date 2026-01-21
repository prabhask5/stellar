<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import PageStarfield from '$lib/components/PageStarfield.svelte';

  interface Props {
    children?: import('svelte').Snippet;
  }

  let { children }: Props = $props();

  // Don't show starfield on home page (it has its own elaborate one)
  const showStarfield = $derived($page.url.pathname !== '/');

  const CHANNEL_NAME = 'stellar-auth-channel';

  onMount(() => {
    // Listen for focus requests from confirmation page
    if ('BroadcastChannel' in window) {
      const channel = new BroadcastChannel(CHANNEL_NAME);

      channel.onmessage = (event) => {
        if (event.data.type === 'FOCUS_REQUEST') {
          // Respond that this tab is present
          channel.postMessage({ type: 'TAB_PRESENT' });
          // Focus this window/tab
          window.focus();
        }
      };

      return () => {
        channel.close();
      };
    }
  });
</script>

{#if showStarfield}
  <PageStarfield />
{/if}

{@render children?.()}
