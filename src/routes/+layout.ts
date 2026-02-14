/**
 * @fileoverview Root layout load function — the **entry point** for every page in Stellar.
 *
 * Responsibilities:
 * 1. **Engine bootstrap** — initialises the `stellar-engine` IndexedDB schema and
 *    Supabase sync mapping (tables, columns, database versions) once in the browser.
 * 2. **Auth resolution** — determines whether the current session is Supabase-backed,
 *    offline-only, or unauthenticated, then forwards that result to all child layouts.
 * 3. **Sync engine start** — when a valid auth mode is present, kicks off the
 *    real-time sync engine so local ↔ remote data stays in sync.
 * 4. **Setup redirect** — if no engine config exists yet (first-time user), redirects
 *    to `/setup` so the user can configure their account.
 *
 * The file also declares the `LayoutData` interface consumed by `+layout.svelte` and
 * every downstream `+page.svelte` via SvelteKit's data-loading convention.
 */

import { browser } from '$app/environment';
import { redirect } from '@sveltejs/kit';
import { goto } from '$app/navigation';
import { initEngine, startSyncEngine, supabase } from '@prabhask5/stellar-engine';
import { initConfig } from '@prabhask5/stellar-engine/config';
import { resolveAuthState, lockSingleUser } from '@prabhask5/stellar-engine/auth';
import type { AuthMode, OfflineCredentials } from '$lib/types';
import type { Session } from '@prabhask5/stellar-engine/types';
import type { LayoutLoad } from './$types';

// =============================================================================
//  SSR / Pre-render Configuration
// =============================================================================

/** Enable server-side rendering — the load function runs on every request. */
export const ssr = true;

/** Disable pre-rendering — auth state is dynamic and cannot be statically generated. */
export const prerender = false;

// =============================================================================
//  Browser-Only Engine Initialisation (runs once at module evaluation)
// =============================================================================

/**
 * Guard: only initialise the engine in the browser — SSR has no IndexedDB.
 * `initEngine` sets up:
 *  - The Supabase-to-IndexedDB table mapping (which columns to sync)
 *  - The Dexie database with all version migrations
 *  - Auth configuration (single-user mode, email confirm, device verification)
 *  - Callbacks for auth state changes and auth-kicked events
 */
if (browser) {
  initEngine({
    // ── Supabase → IndexedDB Table Mapping ────────────────────────────────
    // Each entry maps a Supabase table name to its column list so the sync
    // engine knows exactly which fields to replicate locally.
    tables: [
      {
        supabaseName: 'goal_lists',
        columns: 'id,user_id,name,project_id,order,created_at,updated_at,deleted,_version,device_id'
      },
      {
        supabaseName: 'goals',
        columns:
          'id,goal_list_id,name,type,target_value,current_value,completed,order,created_at,updated_at,deleted,_version,device_id'
      },
      {
        supabaseName: 'daily_routine_goals',
        columns:
          'id,user_id,name,type,target_value,start_target_value,end_target_value,progression_schedule,start_date,end_date,active_days,order,created_at,updated_at,deleted,_version,device_id'
      },
      {
        supabaseName: 'daily_goal_progress',
        columns:
          'id,daily_routine_goal_id,date,current_value,completed,updated_at,deleted,_version,device_id'
      },
      {
        supabaseName: 'task_categories',
        columns:
          'id,user_id,name,color,order,project_id,created_at,updated_at,deleted,_version,device_id'
      },
      {
        supabaseName: 'commitments',
        columns:
          'id,user_id,name,section,order,project_id,created_at,updated_at,deleted,_version,device_id'
      },
      {
        supabaseName: 'daily_tasks',
        columns:
          'id,user_id,name,long_term_task_id,order,completed,created_at,updated_at,deleted,_version,device_id'
      },
      {
        supabaseName: 'long_term_agenda',
        columns:
          'id,user_id,name,due_date,category_id,type,completed,created_at,updated_at,deleted,_version,device_id'
      },
      {
        supabaseName: 'focus_settings',
        columns:
          'id,user_id,focus_duration,break_duration,long_break_duration,cycles_before_long_break,auto_start_breaks,auto_start_focus,created_at,updated_at,deleted,_version,device_id',
        isSingleton: true
      },
      {
        supabaseName: 'focus_sessions',
        columns:
          'id,user_id,started_at,ended_at,phase,status,current_cycle,total_cycles,focus_duration,break_duration,phase_started_at,phase_remaining_ms,elapsed_duration,created_at,updated_at,deleted,_version,device_id'
      },
      {
        supabaseName: 'block_lists',
        columns:
          'id,user_id,name,active_days,is_enabled,order,created_at,updated_at,deleted,_version,device_id'
      },
      {
        supabaseName: 'blocked_websites',
        columns: 'id,block_list_id,domain,created_at,updated_at,deleted,_version,device_id'
      },
      {
        supabaseName: 'projects',
        columns:
          'id,user_id,name,is_current,order,tag_id,commitment_id,goal_list_id,created_at,updated_at,deleted,_version,device_id'
      }
    ],

    // ── Dexie (IndexedDB) Database Schema & Migrations ────────────────────
    // Each version entry declares the object stores and their indexed fields.
    // `upgrade` callbacks run data-migrations when the schema version bumps.
    database: {
      name: 'GoalPlannerDB',
      versions: [
        // ── v2: Initial schema — goal lists, goals, daily routines & progress ──
        {
          version: 2,
          stores: {
            goalLists: 'id, user_id, created_at, updated_at',
            goals: 'id, goal_list_id, created_at, updated_at',
            dailyRoutineGoals: 'id, user_id, start_date, end_date, created_at, updated_at',
            dailyGoalProgress:
              'id, daily_routine_goal_id, date, [daily_routine_goal_id+date], updated_at'
          }
        },
        // ── v3: Schema unchanged — likely a migration trigger ──
        {
          version: 3,
          stores: {
            goalLists: 'id, user_id, created_at, updated_at',
            goals: 'id, goal_list_id, created_at, updated_at',
            dailyRoutineGoals: 'id, user_id, start_date, end_date, created_at, updated_at',
            dailyGoalProgress:
              'id, daily_routine_goal_id, date, [daily_routine_goal_id+date], updated_at'
          }
        },
        // ── v4: Add `order` index to goals & routines, backfill order values ──
        {
          version: 4,
          stores: {
            goalLists: 'id, user_id, created_at, updated_at',
            goals: 'id, goal_list_id, order, created_at, updated_at',
            dailyRoutineGoals: 'id, user_id, order, start_date, end_date, created_at, updated_at',
            dailyGoalProgress:
              'id, daily_routine_goal_id, date, [daily_routine_goal_id+date], updated_at'
          },
          /**
           * Migration: backfill `order` on daily routine goals.
           * Sorts existing routines by `created_at` (newest first) and assigns
           * sequential order values so drag-and-drop works correctly.
           */
          upgrade: async (tx) => {
            const routines = await tx.table('dailyRoutineGoals').toArray();
            const sorted = routines.sort(
              (a: { created_at: string }, b: { created_at: string }) =>
                new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            );
            for (let i = 0; i < sorted.length; i++) {
              await tx.table('dailyRoutineGoals').update(sorted[i].id, { order: i });
            }
          }
        },
        // ── v5: Add task categories, commitments, daily tasks, long-term tasks ──
        {
          version: 5,
          stores: {
            goalLists: 'id, user_id, created_at, updated_at',
            goals: 'id, goal_list_id, order, created_at, updated_at',
            dailyRoutineGoals: 'id, user_id, order, start_date, end_date, created_at, updated_at',
            dailyGoalProgress:
              'id, daily_routine_goal_id, date, [daily_routine_goal_id+date], updated_at',
            taskCategories: 'id, user_id, order, created_at, updated_at',
            commitments: 'id, user_id, section, order, created_at, updated_at',
            dailyTasks: 'id, user_id, order, created_at, updated_at',
            longTermTasks: 'id, user_id, due_date, category_id, created_at, updated_at'
          }
        },
        // ── v6: No-op — schema unchanged ──
        {
          version: 6,
          stores: {
            goalLists: 'id, user_id, created_at, updated_at',
            goals: 'id, goal_list_id, order, created_at, updated_at',
            dailyRoutineGoals: 'id, user_id, order, start_date, end_date, created_at, updated_at',
            dailyGoalProgress:
              'id, daily_routine_goal_id, date, [daily_routine_goal_id+date], updated_at',
            taskCategories: 'id, user_id, order, created_at, updated_at',
            commitments: 'id, user_id, section, order, created_at, updated_at',
            dailyTasks: 'id, user_id, order, created_at, updated_at',
            longTermTasks: 'id, user_id, due_date, category_id, created_at, updated_at'
          }
        },
        // ── v7: Add focus timer stores (settings, sessions) and website blocking ──
        {
          version: 7,
          stores: {
            goalLists: 'id, user_id, created_at, updated_at',
            goals: 'id, goal_list_id, order, created_at, updated_at',
            dailyRoutineGoals: 'id, user_id, order, start_date, end_date, created_at, updated_at',
            dailyGoalProgress:
              'id, daily_routine_goal_id, date, [daily_routine_goal_id+date], updated_at',
            taskCategories: 'id, user_id, order, created_at, updated_at',
            commitments: 'id, user_id, section, order, created_at, updated_at',
            dailyTasks: 'id, user_id, order, created_at, updated_at',
            longTermTasks: 'id, user_id, due_date, category_id, created_at, updated_at',
            focusSettings: 'id, user_id, updated_at',
            focusSessions: 'id, user_id, started_at, ended_at, status, updated_at',
            blockLists: 'id, user_id, order, updated_at',
            blockedWebsites: 'id, block_list_id, updated_at'
          }
        },
        // ── v8: Backfill `_version` field on all records for conflict resolution ──
        {
          version: 8,
          stores: {
            goalLists: 'id, user_id, created_at, updated_at',
            goals: 'id, goal_list_id, order, created_at, updated_at',
            dailyRoutineGoals: 'id, user_id, order, start_date, end_date, created_at, updated_at',
            dailyGoalProgress:
              'id, daily_routine_goal_id, date, [daily_routine_goal_id+date], updated_at',
            taskCategories: 'id, user_id, order, created_at, updated_at',
            commitments: 'id, user_id, section, order, created_at, updated_at',
            dailyTasks: 'id, user_id, order, created_at, updated_at',
            longTermTasks: 'id, user_id, due_date, category_id, created_at, updated_at',
            focusSettings: 'id, user_id, updated_at',
            focusSessions: 'id, user_id, started_at, ended_at, status, updated_at',
            blockLists: 'id, user_id, order, updated_at',
            blockedWebsites: 'id, block_list_id, updated_at'
          },
          /**
           * Migration: ensure every record across all tables has a `_version`
           * field. Records missing it get `_version: 1` so the sync engine's
           * optimistic-concurrency checks work correctly.
           */
          upgrade: async (tx) => {
            const tables = [
              'goalLists',
              'goals',
              'dailyRoutineGoals',
              'dailyGoalProgress',
              'taskCategories',
              'commitments',
              'dailyTasks',
              'longTermTasks',
              'focusSettings',
              'focusSessions',
              'blockLists',
              'blockedWebsites'
            ];
            for (const tableName of tables) {
              const records = await tx.table(tableName).toArray();
              for (const record of records) {
                if (record._version === undefined) {
                  await tx.table(tableName).update(record.id, { _version: 1 });
                }
              }
            }
          }
        },
        // ── v9: No-op — schema unchanged ──
        {
          version: 9,
          stores: {
            goalLists: 'id, user_id, created_at, updated_at',
            goals: 'id, goal_list_id, order, created_at, updated_at',
            dailyRoutineGoals: 'id, user_id, order, start_date, end_date, created_at, updated_at',
            dailyGoalProgress:
              'id, daily_routine_goal_id, date, [daily_routine_goal_id+date], updated_at',
            taskCategories: 'id, user_id, order, created_at, updated_at',
            commitments: 'id, user_id, section, order, created_at, updated_at',
            dailyTasks: 'id, user_id, order, created_at, updated_at',
            longTermTasks: 'id, user_id, due_date, category_id, created_at, updated_at',
            focusSettings: 'id, user_id, updated_at',
            focusSessions: 'id, user_id, started_at, ended_at, status, updated_at',
            blockLists: 'id, user_id, order, updated_at',
            blockedWebsites: 'id, block_list_id, updated_at'
          }
        },
        // ── v10: No-op — schema unchanged ──
        {
          version: 10,
          stores: {
            goalLists: 'id, user_id, created_at, updated_at',
            goals: 'id, goal_list_id, order, created_at, updated_at',
            dailyRoutineGoals: 'id, user_id, order, start_date, end_date, created_at, updated_at',
            dailyGoalProgress:
              'id, daily_routine_goal_id, date, [daily_routine_goal_id+date], updated_at',
            taskCategories: 'id, user_id, order, created_at, updated_at',
            commitments: 'id, user_id, section, order, created_at, updated_at',
            dailyTasks: 'id, user_id, order, created_at, updated_at',
            longTermTasks: 'id, user_id, due_date, category_id, created_at, updated_at',
            focusSettings: 'id, user_id, updated_at',
            focusSessions: 'id, user_id, started_at, ended_at, status, updated_at',
            blockLists: 'id, user_id, order, updated_at',
            blockedWebsites: 'id, block_list_id, updated_at'
          }
        },
        // ── v11: Add `projects` store + `project_id` index on related tables ──
        {
          version: 11,
          stores: {
            goalLists: 'id, user_id, project_id, created_at, updated_at',
            goals: 'id, goal_list_id, order, created_at, updated_at',
            dailyRoutineGoals: 'id, user_id, order, start_date, end_date, created_at, updated_at',
            dailyGoalProgress:
              'id, daily_routine_goal_id, date, [daily_routine_goal_id+date], updated_at',
            taskCategories: 'id, user_id, project_id, order, created_at, updated_at',
            commitments: 'id, user_id, project_id, section, order, created_at, updated_at',
            dailyTasks: 'id, user_id, order, created_at, updated_at',
            longTermTasks: 'id, user_id, due_date, category_id, created_at, updated_at',
            focusSettings: 'id, user_id, updated_at',
            focusSessions: 'id, user_id, started_at, ended_at, status, updated_at',
            blockLists: 'id, user_id, order, updated_at',
            blockedWebsites: 'id, block_list_id, updated_at',
            projects: 'id, user_id, is_current, order, created_at, updated_at'
          }
        },
        // ── v12: No-op — schema unchanged (projects store already present) ──
        {
          version: 12,
          stores: {
            goalLists: 'id, user_id, project_id, created_at, updated_at',
            goals: 'id, goal_list_id, order, created_at, updated_at',
            dailyRoutineGoals: 'id, user_id, order, start_date, end_date, created_at, updated_at',
            dailyGoalProgress:
              'id, daily_routine_goal_id, date, [daily_routine_goal_id+date], updated_at',
            taskCategories: 'id, user_id, project_id, order, created_at, updated_at',
            commitments: 'id, user_id, project_id, section, order, created_at, updated_at',
            dailyTasks: 'id, user_id, order, created_at, updated_at',
            longTermTasks: 'id, user_id, due_date, category_id, created_at, updated_at',
            focusSettings: 'id, user_id, updated_at',
            focusSessions: 'id, user_id, started_at, ended_at, status, updated_at',
            blockLists: 'id, user_id, order, updated_at',
            blockedWebsites: 'id, block_list_id, updated_at',
            projects: 'id, user_id, is_current, order, created_at, updated_at'
          }
        },
        // ── v13: Add `order` index to goalLists, backfill order values ──
        {
          version: 13,
          stores: {
            goalLists: 'id, user_id, project_id, order, created_at, updated_at',
            goals: 'id, goal_list_id, order, created_at, updated_at',
            dailyRoutineGoals: 'id, user_id, order, start_date, end_date, created_at, updated_at',
            dailyGoalProgress:
              'id, daily_routine_goal_id, date, [daily_routine_goal_id+date], updated_at',
            taskCategories: 'id, user_id, project_id, order, created_at, updated_at',
            commitments: 'id, user_id, project_id, section, order, created_at, updated_at',
            dailyTasks: 'id, user_id, order, created_at, updated_at',
            longTermTasks: 'id, user_id, due_date, category_id, created_at, updated_at',
            focusSettings: 'id, user_id, updated_at',
            focusSessions: 'id, user_id, started_at, ended_at, status, updated_at',
            blockLists: 'id, user_id, order, updated_at',
            blockedWebsites: 'id, block_list_id, updated_at',
            projects: 'id, user_id, is_current, order, created_at, updated_at'
          },
          /**
           * Migration: backfill `order` on goal lists.
           * Sorts existing lists by `created_at` (newest first) and assigns
           * sequential order values for drag-and-drop support.
           */
          upgrade: async (tx) => {
            const lists = await tx.table('goalLists').toArray();
            lists.sort(
              (a: { created_at: string }, b: { created_at: string }) =>
                new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            );
            for (let i = 0; i < lists.length; i++) {
              await tx.table('goalLists').update(lists[i].id, { order: i });
            }
          }
        },
        // ── v14: No-op — schema unchanged ──
        {
          version: 14,
          stores: {
            goalLists: 'id, user_id, project_id, order, created_at, updated_at',
            goals: 'id, goal_list_id, order, created_at, updated_at',
            dailyRoutineGoals: 'id, user_id, order, start_date, end_date, created_at, updated_at',
            dailyGoalProgress:
              'id, daily_routine_goal_id, date, [daily_routine_goal_id+date], updated_at',
            taskCategories: 'id, user_id, project_id, order, created_at, updated_at',
            commitments: 'id, user_id, project_id, section, order, created_at, updated_at',
            dailyTasks: 'id, user_id, order, created_at, updated_at',
            longTermTasks: 'id, user_id, due_date, category_id, created_at, updated_at',
            focusSettings: 'id, user_id, updated_at',
            focusSessions: 'id, user_id, started_at, ended_at, status, updated_at',
            blockLists: 'id, user_id, order, updated_at',
            blockedWebsites: 'id, block_list_id, updated_at',
            projects: 'id, user_id, is_current, order, created_at, updated_at'
          }
        },
        {
          // Version 15: No app schema changes — triggers Dexie upgrade so the
          // engine's singleUserConfig system table gets created in existing databases.
          version: 15,
          stores: {
            goalLists: 'id, user_id, project_id, order, created_at, updated_at',
            goals: 'id, goal_list_id, order, created_at, updated_at',
            dailyRoutineGoals: 'id, user_id, order, start_date, end_date, created_at, updated_at',
            dailyGoalProgress:
              'id, daily_routine_goal_id, date, [daily_routine_goal_id+date], updated_at',
            taskCategories: 'id, user_id, project_id, order, created_at, updated_at',
            commitments: 'id, user_id, project_id, section, order, created_at, updated_at',
            dailyTasks: 'id, user_id, order, created_at, updated_at',
            longTermTasks: 'id, user_id, due_date, category_id, created_at, updated_at',
            focusSettings: 'id, user_id, updated_at',
            focusSessions: 'id, user_id, started_at, ended_at, status, updated_at',
            blockLists: 'id, user_id, order, updated_at',
            blockedWebsites: 'id, block_list_id, updated_at',
            projects: 'id, user_id, is_current, order, created_at, updated_at'
          }
        },
        {
          // Version 16: Re-trigger Dexie upgrade to ensure singleUserConfig object
          // store exists. Version 15 may have been applied by a service-worker-cached
          // build that had the old engine without the system table, leaving the DB at
          // v15 but missing the store. This forces a v15→v16 upgrade cycle.
          version: 16,
          stores: {
            goalLists: 'id, user_id, project_id, order, created_at, updated_at',
            goals: 'id, goal_list_id, order, created_at, updated_at',
            dailyRoutineGoals: 'id, user_id, order, start_date, end_date, created_at, updated_at',
            dailyGoalProgress:
              'id, daily_routine_goal_id, date, [daily_routine_goal_id+date], updated_at',
            taskCategories: 'id, user_id, project_id, order, created_at, updated_at',
            commitments: 'id, user_id, project_id, section, order, created_at, updated_at',
            dailyTasks: 'id, user_id, order, created_at, updated_at',
            longTermTasks: 'id, user_id, due_date, category_id, created_at, updated_at',
            focusSettings: 'id, user_id, updated_at',
            focusSessions: 'id, user_id, started_at, ended_at, status, updated_at',
            blockLists: 'id, user_id, order, updated_at',
            blockedWebsites: 'id, block_list_id, updated_at',
            projects: 'id, user_id, is_current, order, created_at, updated_at'
          }
        },
        {
          // Version 17: Rename longTermTasks → longTermAgenda and add type column
          // for the reminders feature (long_term_tasks → long_term_agenda in Supabase)
          version: 17,
          stores: {
            goalLists: 'id, user_id, project_id, order, created_at, updated_at',
            goals: 'id, goal_list_id, order, created_at, updated_at',
            dailyRoutineGoals: 'id, user_id, order, start_date, end_date, created_at, updated_at',
            dailyGoalProgress:
              'id, daily_routine_goal_id, date, [daily_routine_goal_id+date], updated_at',
            taskCategories: 'id, user_id, project_id, order, created_at, updated_at',
            commitments: 'id, user_id, project_id, section, order, created_at, updated_at',
            dailyTasks: 'id, user_id, order, created_at, updated_at',
            longTermAgenda: 'id, user_id, due_date, category_id, type, created_at, updated_at',
            focusSettings: 'id, user_id, updated_at',
            focusSessions: 'id, user_id, started_at, ended_at, status, updated_at',
            blockLists: 'id, user_id, order, updated_at',
            blockedWebsites: 'id, block_list_id, updated_at',
            projects: 'id, user_id, is_current, order, created_at, updated_at'
          },
          /**
           * Migration: rename `longTermTasks` → `longTermAgenda` and add `type` field.
           * - Copies all rows from the old store to the new one (with `type` defaulting to `'task'`).
           * - Also backfills `type` on any records already present in `longTermAgenda`.
           * - Wrapped in try/catch because `longTermTasks` won't exist on a fresh install.
           */
          upgrade: async (tx) => {
            // Migrate data from longTermTasks to longTermAgenda
            // Dexie removes the old store when it's absent from the schema, so we
            // need to copy data before the old store is dropped. However, Dexie
            // drops stores AFTER upgrade runs, so longTermTasks may still exist.
            try {
              const oldItems = await tx.table('longTermTasks').toArray();
              for (const item of oldItems) {
                await tx.table('longTermAgenda').put({ ...item, type: item.type ?? 'task' });
              }
            } catch {
              // longTermTasks may not exist (fresh install) — that's fine
            }
            // Also set type for any items already in longTermAgenda
            const items = await tx.table('longTermAgenda').toArray();
            for (const item of items) {
              if (item.type === undefined) {
                await tx.table('longTermAgenda').update(item.id, { type: 'task' });
              }
            }
          }
        },
        {
          // Version 18: Add long_term_task_id to dailyTasks for linked spawned tasks
          version: 18,
          stores: {
            goalLists: 'id, user_id, project_id, order, created_at, updated_at',
            goals: 'id, goal_list_id, order, created_at, updated_at',
            dailyRoutineGoals: 'id, user_id, order, start_date, end_date, created_at, updated_at',
            dailyGoalProgress:
              'id, daily_routine_goal_id, date, [daily_routine_goal_id+date], updated_at',
            taskCategories: 'id, user_id, project_id, order, created_at, updated_at',
            commitments: 'id, user_id, project_id, section, order, created_at, updated_at',
            dailyTasks: 'id, user_id, long_term_task_id, order, created_at, updated_at',
            longTermAgenda: 'id, user_id, due_date, category_id, type, created_at, updated_at',
            focusSettings: 'id, user_id, updated_at',
            focusSessions: 'id, user_id, started_at, ended_at, status, updated_at',
            blockLists: 'id, user_id, order, updated_at',
            blockedWebsites: 'id, block_list_id, updated_at',
            projects: 'id, user_id, is_current, order, created_at, updated_at'
          }
        }
      ]
    },

    // ── Supabase Client ───────────────────────────────────────────────────
    supabase,

    /** Prefix used for engine-internal localStorage / IDB keys. */
    prefix: 'stellar',

    // ── Auth Configuration ────────────────────────────────────────────────
    auth: {
      /** Single-user mode — the device is "locked" to one account at a time. */
      mode: 'single-user',
      singleUser: {
        gateType: 'code',
        codeLength: 6
      },
      emailConfirmation: { enabled: true },
      /** Trust a verified device for 90 days before re-prompting. */
      deviceVerification: { enabled: true, trustDurationDays: 90 },
      /** Where the email confirmation link redirects to. */
      confirmRedirectPath: '/confirm',
      /**
       * Extracts a user profile from Supabase `user_metadata`.
       * @param meta - Raw metadata from Supabase auth
       * @returns Object with `firstName` and `lastName`
       */
      profileExtractor: (meta: Record<string, unknown>) => ({
        firstName: (meta.first_name as string) || '',
        lastName: (meta.last_name as string) || ''
      }),
      /**
       * Converts an app-side profile back to Supabase metadata shape.
       * @param p - Profile object with `firstName` / `lastName`
       * @returns Supabase-compatible metadata
       */
      profileToMetadata: (p: Record<string, unknown>) => ({
        first_name: p.firstName,
        last_name: p.lastName
      }),
      /** Allow the app to function fully offline using cached credentials. */
      enableOfflineAuth: true
    },

    // ── Auth Event Callbacks ──────────────────────────────────────────────

    /**
     * Called when Supabase fires an auth state change.
     * In single-user mode, `SIGNED_IN` events refresh the page to pick up
     * the new session. `SIGNED_OUT` is handled by `lockSingleUser` instead.
     */
    onAuthStateChange: (event, session) => {
      // In single-user mode, SIGNED_IN events refresh the page to pick up the session.
      // SIGNED_OUT is handled by lockSingleUser, not by Supabase auth events.
      if (event === 'SIGNED_IN' && session) {
        if (!window.location.pathname.startsWith('/login')) {
          goto(window.location.pathname, { invalidateAll: true });
        }
      }
    },

    /**
     * Called when the engine detects the user was kicked (e.g. session revoked
     * from another device). Locks the single-user session and redirects to login.
     */
    onAuthKicked: async (_message) => {
      await lockSingleUser();
      goto('/login');
    }
  });
}

// =============================================================================
//  Layout Data Interface
// =============================================================================

/**
 * Data shape returned by this layout's `load` function and consumed by
 * `+layout.svelte` and every child route.
 */
export interface LayoutData {
  /** The active Supabase session, or `null` when offline / unauthenticated. */
  session: Session | null;

  /** Current authentication mode — `'supabase'`, `'offline'`, or `'none'`. */
  authMode: AuthMode;

  /** Cached offline credentials (profile, email) when in offline mode. */
  offlineProfile: OfflineCredentials | null;

  /** Whether the single-user account has been set up (exists in DB). */
  singleUserSetUp?: boolean;
}

// =============================================================================
//  Root Layout Load Function
// =============================================================================

/**
 * SvelteKit universal load function — runs on every navigation.
 *
 * **Server (SSR):** Returns a blank "no auth" payload — the real auth check
 * happens client-side once the engine is initialised.
 *
 * **Browser:** Initialises engine config, redirects to `/setup` if first-time,
 * resolves the current auth state, starts the sync engine, and returns the
 * result as `LayoutData`.
 *
 * @param params - SvelteKit load params (only `url` is used here)
 * @returns The `LayoutData` payload for all downstream components
 */
export const load: LayoutLoad = async ({ url }): Promise<LayoutData> => {
  if (browser) {
    /* Ensure the engine config (Supabase URL, anon key, etc.) is loaded */
    const config = await initConfig();

    /* No config yet → first-time user, redirect to setup wizard */
    if (!config && url.pathname !== '/setup') {
      redirect(307, '/setup');
    }

    /* Still on setup page with no config — return blank state */
    if (!config) {
      return { session: null, authMode: 'none', offlineProfile: null, singleUserSetUp: false };
    }

    /* Resolve auth — determines Supabase / offline / none */
    const result = await resolveAuthState();

    /* Start sync engine only when the user is actually authenticated */
    if (result.authMode !== 'none') {
      await startSyncEngine();
    }
    return result;
  }

  /* SSR fallback — no auth information available server-side */
  return { session: null, authMode: 'none', offlineProfile: null, singleUserSetUp: false };
};
