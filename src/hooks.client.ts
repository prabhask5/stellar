import { supabase } from '$lib/supabase/client';
import { goto } from '$app/navigation';

// Listen for auth state changes (sign out, token refresh, etc.)
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT') {
    goto('/login');
  } else if (event === 'SIGNED_IN' && session) {
    // Invalidate page data to refresh session in layouts
    goto(window.location.pathname, { invalidateAll: true });
  }
});
