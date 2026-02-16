/**
 * @fileoverview Vite build configuration for the Stellar PWA.
 *
 * This config handles two key concerns:
 *   1. **SvelteKit integration** — via the official `sveltekit()` plugin
 *   2. **PWA service worker + asset manifest** — via `stellarPWA()` from
 *      stellar-drive, which generates `static/sw.js` (with a unique build
 *      version) and `asset-manifest.json` (listing all immutable JS/CSS
 *      chunks for background precaching)
 *
 * Chunk-splitting is tuned to isolate heavy vendor libs (`@supabase`, `date-fns`,
 * `dexie`) into their own bundles for long-term caching.
 */

// =============================================================================
//                                  IMPORTS
// =============================================================================

import { sveltekit } from '@sveltejs/kit/vite';
import { stellarPWA } from 'stellar-drive/vite';
import { defineConfig } from 'vite';

// =============================================================================
//                           VITE CONFIGURATION
// =============================================================================

export default defineConfig({
  plugins: [
    sveltekit(),
    stellarPWA({ prefix: 'stellar', name: 'Stellar Planner', schema: true })
  ],
  build: {
    /**
     * Optimize chunk splitting for better long-term caching.
     * Heavy vendor libraries are isolated so that app-code changes
     * don't invalidate the (large) vendor bundles.
     */
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          /* ── Vendor chunk isolation ───────────────────────────── */
          if (id.includes('node_modules')) {
            /** Supabase auth + realtime — ~100 KB gzipped */
            if (id.includes('@supabase')) {
              return 'vendor-supabase';
            }
            /** date-fns — tree-shaken but still significant */
            if (id.includes('date-fns')) {
              return 'vendor-date-fns';
            }
            /** Dexie (IndexedDB wrapper) — offline-first storage layer */
            if (id.includes('dexie')) {
              return 'vendor-dexie';
            }
          }
        }
      }
    },

    /** Reduce noise — only warn for chunks above 500 KB */
    chunkSizeWarningLimit: 500,

    /** esbuild is faster than terser and produces comparable output */
    minify: 'esbuild',

    /** Target modern browsers → enables smaller output (no legacy polyfills) */
    target: 'es2020'
  }
});
