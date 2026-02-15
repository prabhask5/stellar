/**
 * @fileoverview **Mock data seeder** — populates the demo Dexie database.
 *
 * This module exports a single async function, `seedDemoData`, that bulk-
 * inserts realistic sample records across all 13 Dexie tables used by the
 * Stellar app. The function is called by stellar-engine's demo mode infra
 * every time the app loads in demo mode (data resets on refresh).
 *
 * ## Tables seeded (13 total)
 *
 * | Table              | Records | Notes                                    |
 * |--------------------|---------|------------------------------------------|
 * | projects           | 2       | "Stellar App" (current) + "Side Quest"   |
 * | goalLists          | 3       | 2 project-linked + 1 standalone          |
 * | goals              | 6       | completion + incremental only             |
 * | dailyRoutineGoals  | 4       | completion, incremental, progressive     |
 * | dailyGoalProgress  | 9       | Today + yesterday + two days ago         |
 * | taskCategories     | 6       | 2 project tags + 4 user-created          |
 * | commitments        | 6       | 2 project-auto + 2 career + 2 personal |
 * | longTermAgenda     | 6       | task + reminder types, varied due dates  |
 * | dailyTasks         | 6       | 3 linked to long-term tasks              |
 * | focusSettings      | 1       | 25/5/15 Pomodoro config                  |
 * | focusSessions      | 3       | stopped, running, stopped                |
 * | blockLists         | 2       | "Work Focus" (enabled) + "Study Time"    |
 * | blockedWebsites    | 4       | twitter, reddit, youtube, instagram      |
 *
 * ## Entity relationship invariants
 *
 * Projects atomically create 3 companion records (tag, commitment, goal list)
 * that all share the same name (rename cascades). The relationships are:
 *
 * ```
 *   Project ──→ tag_id ──→ TaskCategory (project tag, same name)
 *           ──→ commitment_id ──→ Commitment (section: 'projects', same name)
 *           ──→ goal_list_id ──→ GoalList (same name, goals are children)
 * ```
 *
 * Long-term tasks link to daily tasks via `long_term_task_id`. Toggling a
 * spawned daily task bidirectionally toggles the linked long-term task, so
 * their `completed` states must be consistent. Only `type: 'task'` items
 * can spawn daily tasks — `type: 'reminder'` items never link.
 *
 * ## Design decisions
 *
 * - **Relative dates**: all timestamps computed from `new Date()` for freshness.
 * - **Deterministic IDs**: every record uses a human-readable `demo-*` prefix.
 * - **Cross-references**: all foreign keys are valid and consistent.
 * - **Date-only fields**: `due_date`, `start_date`, `end_date`, and progress
 *   `date` use `YYYY-MM-DD` format (SQL `date` type, not `timestamp`).
 * - **No `dexie` import**: local structural `DexieDb` interface avoids Knip lint.
 *
 * @see {@link ./config.ts} — wires this seeder into the DemoConfig
 */

// =============================================================================
//                           DEXIE DB TYPE SHIM
// =============================================================================

/**
 * Minimal structural interface for the Dexie database instance.
 *
 * Only the `.table(name).bulkPut(items)` path is needed for seeding.
 * Using a local interface avoids importing `dexie` as a direct dependency,
 * which would trigger Knip's "unlisted dependency" lint rule.
 */
interface DexieDb {
  table: (name: string) => { bulkPut: (items: Record<string, unknown>[]) => Promise<unknown> };
}

// =============================================================================
//                           SEED FUNCTION
// =============================================================================

/**
 * Seed the demo database with comprehensive mock data for all 13 entity types.
 *
 * Called by the engine's demo mode infrastructure (`initEngine`) every time the
 * app boots in demo mode. Because all data is relative to `new Date()`, a page
 * refresh produces a completely fresh dataset.
 *
 * @param db - The sandboxed Dexie database instance (e.g. `GoalPlannerDB_demo`)
 */
export async function seedDemoData(db: DexieDb): Promise<void> {
  // ---------------------------------------------------------------------------
  // Date anchors — every timestamp in the seed data is relative to "now" so
  // the demo always feels current regardless of when it's loaded.
  // ---------------------------------------------------------------------------

  const now = new Date();
  /** Midnight of the current day (used as the base for day-level offsets). */
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const twoDaysAgo = new Date(today.getTime() - 2 * 86400000);
  const threeDaysAgo = new Date(today.getTime() - 3 * 86400000);
  const oneWeekAgo = new Date(today.getTime() - 7 * 86400000);
  const twoWeeksAgo = new Date(today.getTime() - 14 * 86400000);
  const nextWeek = new Date(today.getTime() + 7 * 86400000);
  const nextMonth = new Date(today.getTime() + 30 * 86400000);

  // ---------------------------------------------------------------------------
  // Common fields — every record in the sync engine requires these columns.
  // `deleted: false` = not soft-deleted, `_version: 1` = initial version,
  // `device_id` = synthetic device identifier for the demo session.
  // ---------------------------------------------------------------------------

  const common = {
    deleted: false,
    _version: 1,
    device_id: 'demo-device'
  };

  /** Synthetic user ID — all records belong to this demo user. */
  const userId = 'demo-user';

  /**
   * Helper — converts a Date to a `YYYY-MM-DD` date string.
   * Used for SQL `date` columns: `due_date`, `start_date`, `end_date`,
   * and daily goal progress `date`.
   */
  const toDateStr = (d: Date) => d.toISOString().split('T')[0];

  // ═══════════════════════════════════════════════════════════════════════
  //  PROJECTS (2)
  //
  //  Top-level organisational containers. Each project atomically creates
  //  three companion records that share the same name:
  //  - A TaskCategory "tag" for colour-coding (tag_id)
  //  - A Commitment in the 'projects' section (commitment_id)
  //  - A GoalList for tracking project goals (goal_list_id)
  //
  //  Only one project can be `is_current: true` at a time.
  // ═══════════════════════════════════════════════════════════════════════

  await db.table('projects').bulkPut([
    {
      id: 'demo-project-1',
      user_id: userId,
      name: 'Stellar App',
      is_current: true, // ← active project, shown first on home page
      order: 0,
      tag_id: 'demo-tag-1', // ← auto-created TaskCategory (project tag)
      commitment_id: 'demo-commitment-2', // ← auto-created Commitment
      goal_list_id: 'demo-goal-list-1', // ← auto-created GoalList
      created_at: twoWeeksAgo.toISOString(),
      updated_at: now.toISOString(),
      ...common
    },
    {
      id: 'demo-project-2',
      user_id: userId,
      name: 'Side Quest',
      is_current: false,
      order: 1,
      tag_id: 'demo-tag-2',
      commitment_id: 'demo-commitment-3',
      goal_list_id: 'demo-goal-list-3',
      created_at: oneWeekAgo.toISOString(),
      updated_at: now.toISOString(),
      ...common
    }
  ]);

  // ═══════════════════════════════════════════════════════════════════════
  //  TASK CATEGORIES (6)
  //
  //  Colour-coded labels for long-term agenda items. Two are project tags
  //  (auto-created with the project, sharing its name); four are user-
  //  created standalone categories.
  //
  //  Project tags: demo-tag-1 "Stellar App", demo-tag-2 "Side Quest"
  //  User categories: Development, Design, Research, Personal
  // ═══════════════════════════════════════════════════════════════════════

  await db.table('taskCategories').bulkPut([
    // ── Project tags (auto-created, name matches project) ──
    {
      id: 'demo-tag-1',
      user_id: userId,
      name: 'Stellar App', // ← must match project name (rename cascades)
      color: '#6c5ce7',
      order: 0,
      project_id: 'demo-project-1',
      created_at: twoWeeksAgo.toISOString(),
      updated_at: now.toISOString(),
      ...common
    },
    {
      id: 'demo-tag-2',
      user_id: userId,
      name: 'Side Quest', // ← must match project name
      color: '#ff79c6',
      order: 1,
      project_id: 'demo-project-2',
      created_at: oneWeekAgo.toISOString(),
      updated_at: now.toISOString(),
      ...common
    },
    // ── User-created categories (standalone, no project link) ──
    {
      id: 'demo-category-1',
      user_id: userId,
      name: 'Development',
      color: '#00d4ff',
      order: 2,
      project_id: null,
      created_at: twoWeeksAgo.toISOString(),
      updated_at: now.toISOString(),
      ...common
    },
    {
      id: 'demo-category-2',
      user_id: userId,
      name: 'Design',
      color: '#e17055',
      order: 3,
      project_id: null,
      created_at: twoWeeksAgo.toISOString(),
      updated_at: now.toISOString(),
      ...common
    },
    {
      id: 'demo-category-3',
      user_id: userId,
      name: 'Research',
      color: '#00b894',
      order: 4,
      project_id: null,
      created_at: oneWeekAgo.toISOString(),
      updated_at: now.toISOString(),
      ...common
    },
    {
      id: 'demo-category-4',
      user_id: userId,
      name: 'Personal',
      color: '#fdcb6e',
      order: 5,
      project_id: null,
      created_at: oneWeekAgo.toISOString(),
      updated_at: now.toISOString(),
      ...common
    }
  ]);

  // ═══════════════════════════════════════════════════════════════════════
  //  COMMITMENTS (6)
  //
  //  High-level personal commitments grouped by `section`:
  //  - `career`: professional growth
  //  - `projects`: active project-level commitments (2 auto-created)
  //  - `personal`: health, learning, lifestyle
  //
  //  Project-created commitments (demo-commitment-2, -3) share the project
  //  name and have `project_id` set. Rename cascades from project.
  // ═══════════════════════════════════════════════════════════════════════

  await db.table('commitments').bulkPut([
    {
      id: 'demo-commitment-1',
      user_id: userId,
      name: 'Advance in software engineering career',
      section: 'career',
      order: 0,
      project_id: null,
      created_at: twoWeeksAgo.toISOString(),
      updated_at: now.toISOString(),
      ...common
    },
    // ── Project-auto-created commitments (name = project name) ──
    {
      id: 'demo-commitment-2',
      user_id: userId,
      name: 'Stellar App', // ← must match project name (rename cascades)
      section: 'projects',
      order: 0,
      project_id: 'demo-project-1',
      created_at: twoWeeksAgo.toISOString(),
      updated_at: now.toISOString(),
      ...common
    },
    {
      id: 'demo-commitment-3',
      user_id: userId,
      name: 'Side Quest', // ← must match project name
      section: 'projects',
      order: 1,
      project_id: 'demo-project-2',
      created_at: oneWeekAgo.toISOString(),
      updated_at: now.toISOString(),
      ...common
    },
    {
      id: 'demo-commitment-4',
      user_id: userId,
      name: 'Contribute to open source monthly',
      section: 'career',
      order: 1,
      project_id: null,
      created_at: oneWeekAgo.toISOString(),
      updated_at: now.toISOString(),
      ...common
    },
    {
      id: 'demo-commitment-5',
      user_id: userId,
      name: 'Exercise at least 4 times per week',
      section: 'personal',
      order: 0,
      project_id: null,
      created_at: twoWeeksAgo.toISOString(),
      updated_at: now.toISOString(),
      ...common
    },
    {
      id: 'demo-commitment-6',
      user_id: userId,
      name: 'Read one book per month',
      section: 'personal',
      order: 1,
      project_id: null,
      created_at: oneWeekAgo.toISOString(),
      updated_at: now.toISOString(),
      ...common
    }
  ]);

  // ═══════════════════════════════════════════════════════════════════════
  //  GOAL LISTS (3)
  //
  //  Containers for goals. Two are project-linked (name must match the
  //  project due to rename cascading); one is standalone.
  //
  //  Project-linked lists: "Stellar App" (project 1), "Side Quest" (project 2)
  //  Standalone: "Fitness Goals"
  // ═══════════════════════════════════════════════════════════════════════

  await db.table('goalLists').bulkPut([
    {
      id: 'demo-goal-list-1',
      user_id: userId,
      name: 'Stellar App', // ← must match project name (rename cascades)
      project_id: 'demo-project-1',
      order: 0,
      created_at: twoWeeksAgo.toISOString(),
      updated_at: now.toISOString(),
      ...common
    },
    {
      id: 'demo-goal-list-2',
      user_id: userId,
      name: 'Fitness Goals',
      project_id: null, // ← standalone, not linked to any project
      order: 1,
      created_at: oneWeekAgo.toISOString(),
      updated_at: now.toISOString(),
      ...common
    },
    {
      id: 'demo-goal-list-3',
      user_id: userId,
      name: 'Side Quest', // ← must match project name
      project_id: 'demo-project-2',
      order: 2,
      created_at: oneWeekAgo.toISOString(),
      updated_at: now.toISOString(),
      ...common
    }
  ]);

  // ═══════════════════════════════════════════════════════════════════════
  //  GOALS (6)
  //
  //  Individual goals within goal lists. Goals only support two types:
  //  - `completion`: binary done/not-done (target_value is always null)
  //  - `incremental`: count toward a numeric target
  //
  //  NOTE: `progressive` type is only valid for daily routine goals,
  //  NOT for regular goals (SQL CHECK constraint).
  //
  //  Goals do NOT have a `user_id` — ownership is determined via the
  //  parent goal list's `user_id`.
  // ═══════════════════════════════════════════════════════════════════════

  await db.table('goals').bulkPut([
    // ── Stellar App project goals ──
    {
      id: 'demo-goal-1',
      goal_list_id: 'demo-goal-list-1',
      name: 'Launch demo mode',
      type: 'completion',
      target_value: null, // ← completion goals always have null target
      current_value: 0,
      completed: true,
      order: 0,
      created_at: twoWeeksAgo.toISOString(),
      updated_at: yesterday.toISOString(),
      ...common
    },
    {
      id: 'demo-goal-2',
      goal_list_id: 'demo-goal-list-1',
      name: 'Ship 20 features',
      type: 'incremental',
      target_value: 20,
      current_value: 14,
      completed: false,
      order: 1,
      created_at: twoWeeksAgo.toISOString(),
      updated_at: now.toISOString(),
      ...common
    },
    // ── Fitness Goals (standalone — no project link) ──
    {
      id: 'demo-goal-3',
      goal_list_id: 'demo-goal-list-2',
      name: 'Run 100 miles this quarter',
      type: 'incremental',
      target_value: 100,
      current_value: 45,
      completed: false,
      order: 0,
      created_at: oneWeekAgo.toISOString(),
      updated_at: now.toISOString(),
      ...common
    },
    {
      id: 'demo-goal-4',
      goal_list_id: 'demo-goal-list-2',
      name: 'Complete 30-day yoga challenge',
      type: 'incremental',
      target_value: 30,
      current_value: 12,
      completed: false,
      order: 1,
      created_at: oneWeekAgo.toISOString(),
      updated_at: now.toISOString(),
      ...common
    },
    // ── Side Quest project goals ──
    {
      id: 'demo-goal-5',
      goal_list_id: 'demo-goal-list-3',
      name: 'Read 10 books this quarter',
      type: 'incremental',
      target_value: 10,
      current_value: 3,
      completed: false,
      order: 0,
      created_at: oneWeekAgo.toISOString(),
      updated_at: now.toISOString(),
      ...common
    },
    {
      id: 'demo-goal-6',
      goal_list_id: 'demo-goal-list-3',
      name: 'Finish TypeScript course',
      type: 'incremental',
      target_value: 100,
      current_value: 72,
      completed: false,
      order: 1,
      created_at: oneWeekAgo.toISOString(),
      updated_at: now.toISOString(),
      ...common
    }
  ]);

  // ═══════════════════════════════════════════════════════════════════════
  //  DAILY ROUTINE GOALS (4)
  //
  //  Recurring daily habits. Unlike regular goals, routines support all
  //  three types:
  //  - `completion`: binary (meditation — did it or didn't)
  //    → target_value is null
  //  - `incremental`: count toward a fixed daily target
  //    → target_value is set; progressive fields are null
  //  - `progressive`: auto-scaling target over time
  //    → start/end target + progression_schedule set; target_value is null
  //
  //  `active_days`: null = every day, otherwise array of 0=Sun … 6=Sat.
  //  `start_date`/`end_date`: SQL `date` type → YYYY-MM-DD strings.
  //  `progression_schedule`: number of active days between target increases.
  // ═══════════════════════════════════════════════════════════════════════

  await db.table('dailyRoutineGoals').bulkPut([
    {
      id: 'demo-daily-goal-1',
      user_id: userId,
      name: 'Meditation',
      type: 'completion',
      target_value: null, // ← completion: no numeric target
      start_target_value: null,
      end_target_value: null,
      progression_schedule: null,
      start_date: toDateStr(twoWeeksAgo), // ← YYYY-MM-DD (SQL date)
      end_date: null,
      active_days: null, // ← null = active every day
      order: 0,
      created_at: twoWeeksAgo.toISOString(),
      updated_at: now.toISOString(),
      ...common
    },
    {
      id: 'demo-daily-goal-2',
      user_id: userId,
      name: 'Read 30 pages',
      type: 'incremental',
      target_value: 30, // ← incremental: fixed daily target
      start_target_value: null,
      end_target_value: null,
      progression_schedule: null,
      start_date: toDateStr(twoWeeksAgo),
      end_date: null,
      active_days: null, // ← every day
      order: 1,
      created_at: twoWeeksAgo.toISOString(),
      updated_at: now.toISOString(),
      ...common
    },
    {
      id: 'demo-daily-goal-3',
      user_id: userId,
      name: 'Running distance (km)',
      type: 'progressive',
      target_value: null, // ← progressive: target_value is null
      start_target_value: 2, // ← starting target: 2 km
      end_target_value: 10, // ← ending target: 10 km
      progression_schedule: 3, // ← increase target every 3 active days
      start_date: toDateStr(twoWeeksAgo),
      end_date: toDateStr(nextMonth),
      active_days: [1, 3, 5], // ← Mon, Wed, Fri only
      order: 2,
      created_at: twoWeeksAgo.toISOString(),
      updated_at: now.toISOString(),
      ...common
    },
    {
      id: 'demo-daily-goal-4',
      user_id: userId,
      name: 'Drink 8 glasses of water',
      type: 'incremental',
      target_value: 8,
      start_target_value: null,
      end_target_value: null,
      progression_schedule: null,
      start_date: toDateStr(oneWeekAgo),
      end_date: null,
      active_days: null, // ← every day
      order: 3,
      created_at: oneWeekAgo.toISOString(),
      updated_at: now.toISOString(),
      ...common
    }
  ]);

  // ═══════════════════════════════════════════════════════════════════════
  //  DAILY GOAL PROGRESS (9)
  //
  //  Per-day tracking records for daily routine goals. Each row links
  //  a `daily_routine_goal_id` to a specific `date` (YYYY-MM-DD) with
  //  a `current_value` and `completed` flag.
  //
  //  Unique constraint: (daily_routine_goal_id, date) — one record per
  //  routine per day.
  //
  //  NOTE: This entity has NO `created_at` field — only `updated_at`.
  //  NOTE: This entity has NO `user_id` — ownership via parent routine.
  //
  //  We seed 3 days of history (today, yesterday, two days ago) to give
  //  the daily view and streak calculations something to work with.
  // ═══════════════════════════════════════════════════════════════════════

  await db.table('dailyGoalProgress').bulkPut([
    // ── Today's progress (partially complete) ──
    {
      id: 'demo-progress-1',
      daily_routine_goal_id: 'demo-daily-goal-1', // Meditation (completion)
      date: toDateStr(today),
      current_value: 1,
      completed: true,
      updated_at: now.toISOString(),
      ...common
    },
    {
      id: 'demo-progress-2',
      daily_routine_goal_id: 'demo-daily-goal-2', // Read 30 pages (18/30)
      date: toDateStr(today),
      current_value: 18,
      completed: false,
      updated_at: now.toISOString(),
      ...common
    },
    {
      id: 'demo-progress-3',
      daily_routine_goal_id: 'demo-daily-goal-4', // Water (5/8 glasses)
      date: toDateStr(today),
      current_value: 5,
      completed: false,
      updated_at: now.toISOString(),
      ...common
    },
    // ── Yesterday's progress (all completed) ──
    {
      id: 'demo-progress-4',
      daily_routine_goal_id: 'demo-daily-goal-1', // Meditation ✓
      date: toDateStr(yesterday),
      current_value: 1,
      completed: true,
      updated_at: yesterday.toISOString(),
      ...common
    },
    {
      id: 'demo-progress-5',
      daily_routine_goal_id: 'demo-daily-goal-2', // Read 30/30 ✓
      date: toDateStr(yesterday),
      current_value: 30,
      completed: true,
      updated_at: yesterday.toISOString(),
      ...common
    },
    {
      id: 'demo-progress-6',
      daily_routine_goal_id: 'demo-daily-goal-3', // Running 3 km ✓
      date: toDateStr(yesterday),
      current_value: 3,
      completed: true,
      updated_at: yesterday.toISOString(),
      ...common
    },
    {
      id: 'demo-progress-7',
      daily_routine_goal_id: 'demo-daily-goal-4', // Water 8/8 ✓
      date: toDateStr(yesterday),
      current_value: 8,
      completed: true,
      updated_at: yesterday.toISOString(),
      ...common
    },
    // ── Two days ago (mixed — meditation skipped, reading completed) ──
    {
      id: 'demo-progress-8',
      daily_routine_goal_id: 'demo-daily-goal-1', // Meditation — skipped
      date: toDateStr(twoDaysAgo),
      current_value: 0,
      completed: false,
      updated_at: twoDaysAgo.toISOString(),
      ...common
    },
    {
      id: 'demo-progress-9',
      daily_routine_goal_id: 'demo-daily-goal-2', // Read 30/30 ✓
      date: toDateStr(twoDaysAgo),
      current_value: 30,
      completed: true,
      updated_at: twoDaysAgo.toISOString(),
      ...common
    }
  ]);

  // ═══════════════════════════════════════════════════════════════════════
  //  LONG TERM AGENDA (5)
  //
  //  Upcoming tasks and reminders with due dates. Two types:
  //  - `task`: can be toggled complete, can spawn daily tasks
  //  - `reminder`: cannot be completed, never spawns daily tasks
  //
  //  `due_date` is SQL `date` type → YYYY-MM-DD string.
  //  `category_id` links to a TaskCategory for colour coding.
  //
  //  NOTE: This entity has NO `order` field — sorted by `due_date`.
  //
  //  Completion state must be consistent with linked daily tasks:
  //  - demo-lt-task-1 (completed: true) ↔ demo-daily-task-1 (completed: true)
  //  - demo-lt-task-2 (completed: false) ↔ demo-daily-task-3 (completed: false)
  //  - demo-lt-task-5 (completed: false) ↔ demo-daily-task-6 (completed: false)
  // ═══════════════════════════════════════════════════════════════════════

  await db.table('longTermAgenda').bulkPut([
    {
      id: 'demo-lt-task-1',
      user_id: userId,
      name: 'Refactor sync engine error handling',
      due_date: toDateStr(yesterday), // ← past due, but completed
      category_id: 'demo-tag-1', // Stellar App project tag → task belongs to project 1
      type: 'task',
      completed: true, // ← must match linked daily-task-1
      created_at: oneWeekAgo.toISOString(),
      updated_at: yesterday.toISOString(),
      ...common
    },
    {
      id: 'demo-lt-task-2',
      user_id: userId,
      name: 'Design new onboarding flow',
      due_date: toDateStr(nextWeek), // ← future
      category_id: 'demo-tag-1', // Stellar App project tag → task belongs to project 1
      type: 'task',
      completed: false, // ← must match linked daily-task-3
      created_at: oneWeekAgo.toISOString(),
      updated_at: now.toISOString(),
      ...common
    },
    {
      id: 'demo-lt-task-3',
      user_id: userId,
      name: 'Review competitor feature sets',
      due_date: toDateStr(twoDaysAgo), // ← past, completed
      category_id: 'demo-tag-2', // Side Quest project tag → task belongs to project 2
      type: 'task',
      completed: true,
      created_at: twoWeeksAgo.toISOString(),
      updated_at: twoDaysAgo.toISOString(),
      ...common
    },
    {
      id: 'demo-lt-task-4',
      user_id: userId,
      name: 'Renew gym membership',
      due_date: toDateStr(nextMonth), // ← far future
      category_id: 'demo-category-4', // Personal
      type: 'reminder', // ← reminders cannot be completed or spawn daily tasks
      completed: false,
      created_at: oneWeekAgo.toISOString(),
      updated_at: now.toISOString(),
      ...common
    },
    {
      id: 'demo-lt-task-5',
      user_id: userId,
      name: 'Submit quarterly report',
      due_date: toDateStr(today), // ← due today
      category_id: null,
      type: 'task',
      completed: false, // ← must match linked daily-task-6
      created_at: threeDaysAgo.toISOString(),
      updated_at: now.toISOString(),
      ...common
    },
    {
      id: 'demo-lt-task-6',
      user_id: userId,
      name: 'Write blog post about sync architecture',
      due_date: toDateStr(threeDaysAgo), // ← LATE: past due and not completed
      category_id: 'demo-tag-1', // Stellar App project tag
      type: 'task',
      completed: false, // ← overdue — this task is late
      created_at: twoWeeksAgo.toISOString(),
      updated_at: oneWeekAgo.toISOString(),
      ...common
    }
  ]);

  // ═══════════════════════════════════════════════════════════════════════
  //  DAILY TASKS (6)
  //
  //  Today's to-do list. Some link to long-term agenda items via
  //  `long_term_task_id`; others are ad-hoc. Mix of completed and
  //  incomplete to give the daily view a realistic feel.
  //
  //  INVARIANT: If a daily task is completed AND links to a long-term
  //  task, the long-term task MUST also be completed (bidirectional
  //  toggle). Only `type: 'task'` long-term items can be linked — never
  //  reminders.
  // ═══════════════════════════════════════════════════════════════════════

  await db.table('dailyTasks').bulkPut([
    {
      id: 'demo-daily-task-1',
      user_id: userId,
      name: 'Refactor sync engine error handling',
      long_term_task_id: 'demo-lt-task-1', // ← spawned from LT task
      order: 0,
      completed: true, // ← matches demo-lt-task-1 completed: true
      created_at: yesterday.toISOString(),
      updated_at: yesterday.toISOString(),
      ...common
    },
    {
      id: 'demo-daily-task-2',
      user_id: userId,
      name: 'Write unit tests for auth flow',
      long_term_task_id: null, // ← ad-hoc task
      order: 1,
      completed: false,
      created_at: today.toISOString(),
      updated_at: now.toISOString(),
      ...common
    },
    {
      id: 'demo-daily-task-3',
      user_id: userId,
      name: 'Design new onboarding flow',
      long_term_task_id: 'demo-lt-task-2', // ← spawned from LT task
      order: 2,
      completed: false, // ← matches demo-lt-task-2 completed: false
      created_at: today.toISOString(),
      updated_at: now.toISOString(),
      ...common
    },
    {
      id: 'demo-daily-task-4',
      user_id: userId,
      name: 'Review pull requests',
      long_term_task_id: null, // ← ad-hoc task
      order: 3,
      completed: true,
      created_at: today.toISOString(),
      updated_at: now.toISOString(),
      ...common
    },
    {
      id: 'demo-daily-task-5',
      user_id: userId,
      name: 'Update project documentation',
      long_term_task_id: null, // ← ad-hoc task
      order: 4,
      completed: false,
      created_at: today.toISOString(),
      updated_at: now.toISOString(),
      ...common
    },
    {
      id: 'demo-daily-task-6',
      user_id: userId,
      name: 'Submit quarterly report',
      long_term_task_id: 'demo-lt-task-5', // ← spawned from LT task (type: 'task', NOT reminder)
      order: 5,
      completed: false, // ← matches demo-lt-task-5 completed: false
      created_at: today.toISOString(),
      updated_at: now.toISOString(),
      ...common
    }
  ]);

  // ═══════════════════════════════════════════════════════════════════════
  //  FOCUS SETTINGS (1)
  //
  //  Pomodoro-style timer configuration. Standard 25/5/15 preset with
  //  4 cycles before a long break. Singleton per user (isSingleton: true
  //  in engine config, unique(user_id) SQL constraint).
  // ═══════════════════════════════════════════════════════════════════════

  await db.table('focusSettings').bulkPut([
    {
      id: 'demo-focus-settings-1',
      user_id: userId,
      focus_duration: 25,
      break_duration: 5,
      long_break_duration: 15,
      cycles_before_long_break: 4,
      auto_start_breaks: true,
      auto_start_focus: false,
      created_at: twoWeeksAgo.toISOString(),
      updated_at: now.toISOString(),
      ...common
    }
  ]);

  // ═══════════════════════════════════════════════════════════════════════
  //  FOCUS SESSIONS (3)
  //
  //  Pomodoro session history. Valid `status` values:
  //  - `running`: timer actively counting down
  //  - `paused`: timer suspended, can resume
  //  - `stopped`: session ended (on stop, engine also sets deleted: true,
  //    but we keep deleted: false here so sessions show in demo history)
  //
  //  Valid `phase` values: `focus` | `break` | `idle`
  //
  //  `phase_started_at` is NOT NULL — stopped sessions retain the last
  //  phase timestamp.
  //
  //  Sessions:
  //  1. Stopped (9–11am today) — full 4-cycle session, 120 min
  //  2. Running (started 2pm, cycle 2) — currently in focus phase
  //  3. Stopped (yesterday 10am, 50 min) — partial session
  // ═══════════════════════════════════════════════════════════════════════

  const completedSessionStart = new Date(today.getTime() + 9 * 3600000); // 9:00 AM today
  const completedSessionEnd = new Date(completedSessionStart.getTime() + 2 * 3600000); // 11:00 AM

  const activeSessionStart = new Date(today.getTime() + 14 * 3600000); // 2:00 PM today
  const activePhaseStart = new Date(now.getTime() - 10 * 60000); // 10 minutes ago (mid-focus)

  const yesterdaySessionStart = new Date(yesterday.getTime() + 10 * 3600000); // 10:00 AM yesterday
  const yesterdaySessionEnd = new Date(yesterdaySessionStart.getTime() + 50 * 60000); // 50 min later

  await db.table('focusSessions').bulkPut([
    {
      id: 'demo-focus-session-1',
      user_id: userId,
      started_at: completedSessionStart.toISOString(),
      ended_at: completedSessionEnd.toISOString(),
      phase: 'idle', // ← finished sessions end in idle phase
      status: 'stopped', // ← only valid terminal status
      current_cycle: 4,
      total_cycles: 4,
      focus_duration: 25,
      break_duration: 5,
      phase_started_at: completedSessionEnd.toISOString(), // ← NOT NULL, last phase start
      phase_remaining_ms: 0,
      elapsed_duration: 120,
      created_at: completedSessionStart.toISOString(),
      updated_at: completedSessionEnd.toISOString(),
      ...common
    },
    {
      id: 'demo-focus-session-2',
      user_id: userId,
      started_at: activeSessionStart.toISOString(),
      ended_at: null, // ← still running
      phase: 'focus',
      status: 'running', // ← valid active status
      current_cycle: 2,
      total_cycles: 4,
      focus_duration: 25,
      break_duration: 5,
      phase_started_at: activePhaseStart.toISOString(),
      phase_remaining_ms: 900000, // 15 min remaining
      elapsed_duration: 55,
      created_at: activeSessionStart.toISOString(),
      updated_at: now.toISOString(),
      ...common
    },
    {
      id: 'demo-focus-session-3',
      user_id: userId,
      started_at: yesterdaySessionStart.toISOString(),
      ended_at: yesterdaySessionEnd.toISOString(),
      phase: 'idle', // ← finished
      status: 'stopped',
      current_cycle: 2,
      total_cycles: 4,
      focus_duration: 25,
      break_duration: 5,
      phase_started_at: yesterdaySessionEnd.toISOString(), // ← NOT NULL
      phase_remaining_ms: 0,
      elapsed_duration: 50,
      created_at: yesterdaySessionStart.toISOString(),
      updated_at: yesterdaySessionEnd.toISOString(),
      ...common
    }
  ]);

  // ═══════════════════════════════════════════════════════════════════════
  //  BLOCK LISTS (2)
  //
  //  Website blocking schedules. `active_days: null` = active every day.
  //  "Work Focus" is enabled on weekdays; "Study Time" is disabled with
  //  `active_days: null` (all days) to show the toggle-off state.
  // ═══════════════════════════════════════════════════════════════════════

  await db.table('blockLists').bulkPut([
    {
      id: 'demo-block-list-1',
      user_id: userId,
      name: 'Work Focus',
      active_days: [1, 2, 3, 4, 5], // ← weekdays only
      is_enabled: true,
      order: 0,
      created_at: twoWeeksAgo.toISOString(),
      updated_at: now.toISOString(),
      ...common
    },
    {
      id: 'demo-block-list-2',
      user_id: userId,
      name: 'Study Time',
      active_days: null, // ← null = every day (canonical representation)
      is_enabled: false,
      order: 1,
      created_at: oneWeekAgo.toISOString(),
      updated_at: now.toISOString(),
      ...common
    }
  ]);

  // ═══════════════════════════════════════════════════════════════════════
  //  BLOCKED WEBSITES (4)
  //
  //  Individual domains assigned to block lists. Two per list to
  //  demonstrate the list → websites one-to-many relationship.
  //
  //  NOTE: No `user_id` — ownership via parent block list.
  //  Domains are stored in normalized form (no protocol, no www, no path).
  // ═══════════════════════════════════════════════════════════════════════

  await db.table('blockedWebsites').bulkPut([
    {
      id: 'demo-blocked-site-1',
      block_list_id: 'demo-block-list-1',
      domain: 'twitter.com',
      created_at: twoWeeksAgo.toISOString(),
      updated_at: now.toISOString(),
      ...common
    },
    {
      id: 'demo-blocked-site-2',
      block_list_id: 'demo-block-list-1',
      domain: 'reddit.com',
      created_at: twoWeeksAgo.toISOString(),
      updated_at: now.toISOString(),
      ...common
    },
    {
      id: 'demo-blocked-site-3',
      block_list_id: 'demo-block-list-2',
      domain: 'youtube.com',
      created_at: oneWeekAgo.toISOString(),
      updated_at: now.toISOString(),
      ...common
    },
    {
      id: 'demo-blocked-site-4',
      block_list_id: 'demo-block-list-2',
      domain: 'instagram.com',
      created_at: oneWeekAgo.toISOString(),
      updated_at: now.toISOString(),
      ...common
    }
  ]);
}
