import { getSupabaseAsync } from '$lib/supabase/client';
import { goto } from '$app/navigation';

// Defer listener registration until config is loaded and client is ready
getSupabaseAsync().then((supabase) => {
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
      goto('/login');
    } else if (event === 'SIGNED_IN' && session) {
      // Invalidate page data to refresh session in layouts
      // Skip if on login page — the login form handles its own navigation
      if (!window.location.pathname.startsWith('/login')) {
        goto(window.location.pathname, { invalidateAll: true });
      }
    }
  });
});
