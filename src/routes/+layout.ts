/**
 * @fileoverview Root layout load function — engine bootstrap + auth resolution.
 *
 * This is the **first code that runs** on every page navigation in Stellar.
 * It has two responsibilities:
 *
 * 1. **Engine initialisation** (runs once, at module scope in the browser) —
 *    calls `initEngine()` with the full application schema: table definitions,
 *    IndexedDB version history, Supabase client, auth configuration, and
 *    lifecycle callbacks (`onAuthStateChange`, `onAuthKicked`).
 *
 * 2. **Auth state resolution** (runs on every navigation) —
 *    delegates to `resolveRootLayout()` from stellar-engine to determine the
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
import { initEngine, supabase } from '@prabhask5/stellar-engine';
import { lockSingleUser } from '@prabhask5/stellar-engine/auth';
import { resolveRootLayout } from '@prabhask5/stellar-engine/kit';
import type { RootLayoutData } from '@prabhask5/stellar-engine/kit';
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
//  Engine Bootstrap (Browser Only — Runs Once at Module Scope)
// =============================================================================
//
//  Configures the stellar-engine with Stellar's full application schema:
//  - 13 Supabase tables with their column definitions
//  - 18-version IndexedDB migration history (Dexie)
//  - Single-user auth with 6-digit PIN, email confirmation, device verification
//  - Lifecycle hooks for auth state changes and session kicks
//
// =============================================================================

if (browser) {
  initEngine({
    /* ── Supabase Table Definitions ────────────────────────────────────── */
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

    /* ── IndexedDB Schema (Dexie) ─────────────────────────────────────── */
    database: {
      name: 'GoalPlannerDB',
      versions: [
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
        {
          version: 4,
          stores: {
            goalLists: 'id, user_id, created_at, updated_at',
            goals: 'id, goal_list_id, order, created_at, updated_at',
            dailyRoutineGoals: 'id, user_id, order, start_date, end_date, created_at, updated_at',
            dailyGoalProgress:
              'id, daily_routine_goal_id, date, [daily_routine_goal_id+date], updated_at'
          },
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
          upgrade: async (tx) => {
            try {
              const oldItems = await tx.table('longTermTasks').toArray();
              for (const item of oldItems) {
                await tx.table('longTermAgenda').put({ ...item, type: item.type ?? 'task' });
              }
            } catch {
              // longTermTasks may not exist (fresh install)
            }
            const items = await tx.table('longTermAgenda').toArray();
            for (const item of items) {
              if (item.type === undefined) {
                await tx.table('longTermAgenda').update(item.id, { type: 'task' });
              }
            }
          }
        },
        {
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

    /* ── Engine Configuration ──────────────────────────────────────────── */
    supabase,
    prefix: 'stellar',

    /* ── Auth Configuration — single-user PIN gate ──────────────── */
    auth: {
      singleUser: {
        gateType: 'code',
        codeLength: 6
      },
      emailConfirmation: { enabled: true },
      deviceVerification: { enabled: true, trustDurationDays: 90 },
      confirmRedirectPath: '/confirm',
      profileExtractor: (meta: Record<string, unknown>) => ({
        firstName: (meta.first_name as string) || '',
        lastName: (meta.last_name as string) || ''
      }),
      profileToMetadata: (p: Record<string, unknown>) => ({
        first_name: p.firstName,
        last_name: p.lastName
      }),
      enableOfflineAuth: true
    },

    /* ── Lifecycle Callbacks ──────────────────────────────────────────── */

    /**
     * Called whenever Supabase fires an auth state change.
     * On `SIGNED_IN`, revalidates the current route's data (unless we're
     * on `/login`, which handles its own post-auth navigation).
     */
    onAuthStateChange: (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        if (!window.location.pathname.startsWith('/login')) {
          goto(window.location.pathname, { invalidateAll: true });
        }
      }
    },

    /**
     * Called when the engine detects a session kick (e.g., concurrent login
     * from another device). Locks the single-user session and navigates
     * to `/login` so the user can re-authenticate.
     */
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
 *   resolves the current auth state, and starts the sync engine. If no Supabase
 *   config exists (first-time setup), redirects to `/setup`.
 * - **Server (SSR)**: Returns a neutral "no auth" payload since all auth
 *   resolution happens exclusively in the browser (cookies / IndexedDB).
 *
 * @param url - The current page URL (used by `resolveRootLayout` to determine
 *              whether to start the sync engine on the current route).
 * @returns Resolved `RootLayoutData` with session, auth mode, offline profile,
 *          and single-user setup status.
 */
export const load: LayoutLoad = async ({ url }): Promise<RootLayoutData> => {
  if (browser) {
    const result = await resolveRootLayout(url);

    if (!result.singleUserSetUp && result.authMode === 'none' && url.pathname !== '/setup') {
      redirect(307, '/setup');
    }

    return result;
  }

  return { session: null, authMode: 'none', offlineProfile: null, singleUserSetUp: false };
};
