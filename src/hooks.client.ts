import { getSupabaseAsync } from '$lib/supabase/client';
import { goto } from '$app/navigation';

// Defer listener registration until config is loaded and client is ready
getSupabaseAsync().then((supabase) => {
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
      goto('/login');
    } else if (event === 'SIGNED_IN' && session) {
      // Invalidate page data to refresh session in layouts
      goto(window.location.pathname, { invalidateAll: true });
    }
  });
});
