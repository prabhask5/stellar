import { redirect } from '@sveltejs/kit';
import { browser } from '$app/environment';
import { getSession } from '$lib/supabase/auth';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async () => {
  if (browser) {
    const session = await getSession();
    if (!session) {
      throw redirect(302, '/login');
    }
    return { session };
  }
  return {};
};
