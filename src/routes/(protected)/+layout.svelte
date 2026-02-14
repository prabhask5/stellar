<script lang="ts">
  /**
   * @fileoverview Protected Layout Component
   *
   * Wraps all routes within the `(protected)` route group.
   * Conditionally renders a `PageStarfield` background on every page
   * **except** the home page (`/`), which provides its own elaborate starfield.
   *
   * Children are rendered via Svelte 5's `{@render}` snippet API.
   */

  // ===========================================================================
  //  IMPORTS
  // ===========================================================================

  import { page } from '$app/stores';
  import PageStarfield from '$lib/components/PageStarfield.svelte';

  // ===========================================================================
  //  PROPS
  // ===========================================================================

  /** Component props — accepts an optional `children` snippet for slot content. */
  interface Props {
    children?: import('svelte').Snippet;
  }

  let { children }: Props = $props();

  // ===========================================================================
  //  DERIVED STATE
  // ===========================================================================

  /**
   * Whether to display the ambient starfield background.
   * Disabled on the home page (`/`) which has its own elaborate version.
   */
  const showStarfield = $derived($page.url.pathname !== '/');
</script>

<!-- Ambient starfield background — hidden on home page -->
{#if showStarfield}
  <PageStarfield />
{/if}

<!-- Render child route content -->
{@render children?.()}
