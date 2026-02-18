/**
 * @fileoverview Root layout load function — engine bootstrap + auth resolution.
 *
 * This is the **first code that runs** on every page navigation in Stellar.
 * It has two responsibilities:
 *
 * 1. **Engine initialisation** (runs once, at module scope in the browser) —
 *    calls `initEngine()` with a declarative schema definition. The engine
 *    auto-generates table configs, Dexie stores, and database versioning.
 *
 * 2. **Auth state resolution** (runs on every navigation) —
 *    delegates to `resolveRootLayout()` from stellar-drive to determine the
 *    current auth mode (`'supabase'` | `'offline'` | `'none'`), active session,
 *    and offline profile. If no Supabase config exists and we're not already
 *    on `/setup`, redirects to the setup wizard.
 *
 * The returned `RootLayoutData` is consumed by `+layout.svelte` to hydrate
 * the global `authState` store, render navigation chrome, and gate access
 * to protected routes.
 */

// =============================================================================
//  Imports
// =============================================================================

import { browser } from '$app/environment';
import { redirect } from '@sveltejs/kit';
import { goto } from '$app/navigation';
import { initEngine, supabase } from 'stellar-drive';
import { lockSingleUser } from 'stellar-drive/auth';
import { resolveRootLayout } from 'stellar-drive/kit';
import { demoConfig } from '$lib/demo/config';
import { schema } from '$lib/schema';
import type { RootLayoutData } from 'stellar-drive/kit';
import type { LayoutLoad } from './$types';

// =============================================================================
//  SvelteKit Route Config
// =============================================================================

/** Enable server-side rendering (pages are pre-rendered on the server). */
export const ssr = true;

/** Disable static pre-rendering (auth state requires runtime evaluation). */
export const prerender = false;

// =============================================================================
//  Type Re-exports
// =============================================================================

/** Re-export the root layout data type so `+layout.svelte` can import it. */
export type { RootLayoutData as LayoutData };

// =============================================================================
//  Public Routes
// =============================================================================

/** Routes accessible without authentication. */
const PUBLIC_ROUTES = ['/policy', '/login', '/demo', '/confirm', '/setup'];

// =============================================================================
//  Engine Bootstrap (Browser Only — Runs Once at Module Scope)
// =============================================================================

if (browser) {
  initEngine({
    /* ── Declarative Schema (from src/lib/schema.ts) ──────────────────── */
    schema,
    databaseName: 'GoalPlannerDB',

    /* ── Engine Configuration ──────────────────────────────────────────── */
    supabase,
    prefix: 'stellar',
    name: 'Stellar Planner',
    domain: window.location.origin,

    /* ── Demo Mode — sandboxed database with mock data ────────────────── */
    demo: demoConfig,

    /* ── Auth Configuration — single-user PIN gate ─────────────────────── */
    auth: {
      profileExtractor: (meta: Record<string, unknown>) => ({
        firstName: (meta.first_name as string) || '',
        lastName: (meta.last_name as string) || ''
      }),
      profileToMetadata: (p: Record<string, unknown>) => ({
        first_name: p.firstName,
        last_name: p.lastName
      })
    },

    /* ── Lifecycle Callbacks ──────────────────────────────────────────── */
    onAuthStateChange: (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        if (!window.location.pathname.startsWith('/login')) {
          goto(window.location.pathname, { invalidateAll: true });
        }
      }
    },
    onAuthKicked: async (_message) => {
      await lockSingleUser();
      goto('/login');
    }
  });
}

// =============================================================================
//  Layout Load Function
// =============================================================================

/**
 * **Universal (client + server) load function** for the root layout.
 *
 * - **Browser**: Delegates to `resolveRootLayout()` which initialises config,
 *   resolves the current auth state, and starts the sync engine. Auth guarding
 *   redirects to `/setup` (if server unconfigured) or `/login` (if locked).
 * - **Server (SSR)**: Returns a neutral "no auth" payload since all auth
 *   resolution happens exclusively in the browser (cookies / IndexedDB).
 *
 * @returns Resolved `RootLayoutData` with session, auth mode, offline profile,
 *          and server configuration status.
 */
export const load: LayoutLoad = async ({ url }): Promise<RootLayoutData> => {
  if (browser) {
    const result = await resolveRootLayout();

    if (result.authMode === 'none') {
      if (!result.serverConfigured && !url.pathname.startsWith('/setup')) {
        redirect(307, '/setup');
      } else if (result.serverConfigured) {
        const isPublicRoute = PUBLIC_ROUTES.some((r) => url.pathname.startsWith(r));
        if (!isPublicRoute) {
          const returnUrl = url.pathname + url.search;
          const loginUrl =
            returnUrl && returnUrl !== '/'
              ? `/login?redirect=${encodeURIComponent(returnUrl)}`
              : '/login';
          redirect(307, loginUrl);
        }
      }
    }

    return result;
  }

  return { session: null, authMode: 'none', offlineProfile: null, serverConfigured: false };
};
