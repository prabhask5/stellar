/**
 * @fileoverview **Demo config** — Stellar demo-mode wiring.
 *
 * Exports a single `demoConfig` object that satisfies the `DemoConfig`
 * contract from `stellar-drive`. This config is passed into
 * `initEngine({ demo: demoConfig })` in the root `+layout.ts` loader.
 *
 * The config provides two things to the engine:
 *
 * 1. **`seedData`** — an async function that populates the sandboxed
 *    Dexie demo database with realistic mock data across all 13 entity
 *    tables. See `./mockData.ts` for the full seeder implementation.
 *
 * 2. **`mockProfile`** — a fake user profile (email, first/last name)
 *    that the engine returns from `getDemoConfig().mockProfile` when
 *    running in demo mode. Consumed by the profile page to display
 *    read-only user info without hitting Supabase.
 *
 * @see {@link ./mockData.ts} — full mock data seeder
 * @see {@link ../../routes/+layout.ts} — where this config is consumed
 */

import type { DemoConfig } from 'stellar-drive';
import { seedDemoData } from './mockData';

/**
 * Demo mode configuration object.
 *
 * - `seedData`: populates the demo Dexie DB on first load (re-seeds on refresh).
 * - `mockProfile`: synthetic user identity shown in the profile page header.
 */
export const demoConfig: DemoConfig = {
  /** Seed function — called by the engine after opening the demo database. */
  seedData: seedDemoData,

  /**
   * Mock user profile — displayed on the profile page and used for the
   * avatar initial resolver. These values never touch Supabase.
   */
  mockProfile: {
    email: 'astronaut@stellar.demo',
    firstName: 'Stellar',
    lastName: 'Explorer'
  }
};
