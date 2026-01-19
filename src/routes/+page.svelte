<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { getSession } from '$lib/supabase/auth';

  onMount(async () => {
    const session = await getSession();
    if (session) {
      goto('/lists');
    } else {
      goto('/login');
    }
  });
</script>

<div class="loading">
  <p>Redirecting...</p>
</div>

<style>
  .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 50vh;
    color: var(--color-text-muted);
  }
</style>
