/**
 * @fileoverview Core type definitions for the Stellar application.
 *
 * Centralises every shared TypeScript interface and type alias used across the
 * client — goals, tasks, focus sessions, block lists, projects, and sync
 * primitives.  Types that originate in `@prabhask5/stellar-engine` are
 * re-exported here so the rest of the app can import from a single module.
 *
 * **Conventions used throughout:**
 * - `deleted` — soft-delete tombstone flag for offline-first sync
 * - `_version` — optimistic concurrency counter compared during conflict
 *   resolution
 * - `device_id` — identifier of the device that last wrote the record,
 *   enabling per-device conflict detection
 */

// =============================================================================
//                              GOAL TYPES
// =============================================================================

/**
 * The strategy a goal uses to measure progress.
 *
 * - `'completion'` — binary done / not-done (checkbox-style)
 * - `'incremental'` — progress tracked against a fixed numeric target
 * - `'progressive'` — target value changes over time via a progression schedule
 */
export type GoalType = 'completion' | 'incremental' | 'progressive';

/**
 * A single goal belonging to a {@link GoalList}.
 *
 * Goals are the atomic unit of progress tracking — each one has a measurable
 * target and a current value that advances toward (or past) it.
 */
export interface Goal {
  /** Unique identifier (UUID v4). */
  id: string;

  /** Foreign key → the {@link GoalList} this goal belongs to. */
  goal_list_id: string;

  /** Human-readable label shown in the UI. */
  name: string;

  /** Determines how progress is calculated — see {@link GoalType}. */
  type: GoalType;

  /** Numeric target for incremental / progressive goals; `null` for completion goals. */
  target_value: number | null;

  /** Current numeric progress toward `target_value`. */
  current_value: number;

  /** Whether the goal has been marked as done. */
  completed: boolean;

  /** Sort position within the parent goal list (lower = higher). */
  order: number;

  /** ISO-8601 timestamp — when the goal was first created. */
  created_at: string;

  /** ISO-8601 timestamp — last modification time. */
  updated_at: string;

  /** Soft-delete tombstone flag for offline sync. */
  deleted?: boolean;

  /** Optimistic concurrency version counter. */
  _version?: number;

  /** Identifier of the device that last modified this record. */
  device_id?: string;
}

/**
 * A named collection of {@link Goal} items, optionally scoped to a
 * {@link Project}.
 */
export interface GoalList {
  /** Unique identifier (UUID v4). */
  id: string;

  /** Foreign key → owning user. */
  user_id: string;

  /** Display name for the list (e.g. "Q1 Fitness Goals"). */
  name: string;

  /** If set, this goal list is scoped to a specific {@link Project}. */
  project_id?: string | null;

  /** Sort position among the user's goal lists. */
  order: number;

  /** ISO-8601 timestamp — creation time. */
  created_at: string;

  /** ISO-8601 timestamp — last modification time. */
  updated_at: string;

  /** Soft-delete tombstone flag for offline sync. */
  deleted?: boolean;

  /** Optimistic concurrency version counter. */
  _version?: number;

  /** Identifier of the device that last modified this record. */
  device_id?: string;

  /** Eagerly-loaded child goals (populated at query time, not persisted). */
  goals?: Goal[];
}

// =============================================================================
//                         DAILY ROUTINE TYPES
// =============================================================================

/**
 * Numeric day-of-week constant aligned with JavaScript's `Date.getDay()`.
 *
 * `0` = Sunday, `1` = Monday, ... `6` = Saturday.
 */
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * A repeating daily routine goal — e.g. "Run 5 km every weekday".
 *
 * Routine goals differ from regular {@link Goal} items in that they recur on a
 * schedule and can progressively adjust their target over time.
 */
export interface DailyRoutineGoal {
  /** Unique identifier (UUID v4). */
  id: string;

  /** Foreign key → owning user. */
  user_id: string;

  /** Human-readable label shown in the UI. */
  name: string;

  /** Progress measurement strategy — see {@link GoalType}. */
  type: GoalType;

  /** Fixed numeric target (used for non-progressive types). */
  target_value: number | null;

  /** ISO date (`YYYY-MM-DD`) when the routine begins. */
  start_date: string;

  /** ISO date when the routine ends, or `null` for open-ended routines. */
  end_date: string | null;

  /**
   * Days of the week the routine is active on.
   * `null` means **all days** (backwards-compatible default).
   */
  active_days: DayOfWeek[] | null;

  /** Starting target for progressive goals (value at `start_date`). */
  start_target_value: number | null;

  /** Ending target for progressive goals (value at `end_date`). */
  end_target_value: number | null;

  /**
   * Number of active occurrences between each target increment.
   * E.g. `2` means the target increases every 2nd active day.
   */
  progression_schedule: number | null;

  /** Sort position among the user's routine goals. */
  order: number;

  /** ISO-8601 timestamp — creation time. */
  created_at: string;

  /** ISO-8601 timestamp — last modification time. */
  updated_at: string;

  /** Soft-delete tombstone flag for offline sync. */
  deleted?: boolean;

  /** Optimistic concurrency version counter. */
  _version?: number;

  /** Identifier of the device that last modified this record. */
  device_id?: string;
}

/**
 * A single day's progress entry for a {@link DailyRoutineGoal}.
 *
 * One record per routine per calendar date — created lazily when the user
 * first interacts with the routine on that day.
 */
export interface DailyGoalProgress {
  /** Unique identifier (UUID v4). */
  id: string;

  /** Foreign key → the parent {@link DailyRoutineGoal}. */
  daily_routine_goal_id: string;

  /** Calendar date this progress entry covers (`YYYY-MM-DD`). */
  date: string;

  /** Numeric progress recorded for the day. */
  current_value: number;

  /** Whether the routine was completed on this day. */
  completed: boolean;

  /** ISO-8601 timestamp — last modification time. */
  updated_at: string;

  /** Soft-delete tombstone flag for offline sync. */
  deleted?: boolean;

  /** Optimistic concurrency version counter. */
  _version?: number;

  /** Identifier of the device that last modified this record. */
  device_id?: string;
}

/**
 * Aggregated progress snapshot for a single calendar day.
 *
 * Used by the calendar / heatmap views to render per-day completion status.
 */
export interface DayProgress {
  /** Calendar date (`YYYY-MM-DD`). */
  date: string;

  /** Total number of goals active on this day. */
  totalGoals: number;

  /** How many of those goals were completed. */
  completedGoals: number;

  /** `completedGoals / totalGoals * 100`, pre-computed for convenience. */
  completionPercentage: number;
}

/**
 * A {@link GoalList} enriched with aggregate completion statistics.
 *
 * Returned by queries that need to display progress bars alongside list names.
 */
export interface GoalListWithProgress extends GoalList {
  /** Total number of goals in the list. */
  totalGoals: number;

  /** Number of completed goals. */
  completedGoals: number;

  /** Pre-computed `completedGoals / totalGoals * 100`. */
  completionPercentage: number;
}

// =============================================================================
//                          TASKS FEATURE TYPES
// =============================================================================

/**
 * The high-level life area a {@link Commitment} falls under.
 *
 * - `'career'` — job and professional development
 * - `'projects'` — side-projects and creative endeavours
 * - `'personal'` — health, relationships, hobbies
 */
export type CommitmentSection = 'career' | 'projects' | 'personal';

/**
 * A colour-coded category applied to tasks for visual grouping.
 *
 * Categories may optionally be scoped to a {@link Project} so that each
 * project can maintain its own independent tag palette.
 */
export interface TaskCategory {
  /** Unique identifier (UUID v4). */
  id: string;

  /** Foreign key → owning user. */
  user_id: string;

  /** Display label (e.g. "Design", "Backend"). */
  name: string;

  /** Hex colour string used as the visual tag indicator (e.g. `"#6c5ce7"`). */
  color: string;

  /** Sort position among categories. */
  order: number;

  /** If set, this category is scoped to a specific {@link Project}. */
  project_id?: string | null;

  /** ISO-8601 timestamp — creation time. */
  created_at: string;

  /** ISO-8601 timestamp — last modification time. */
  updated_at: string;

  /** Soft-delete tombstone flag for offline sync. */
  deleted?: boolean;

  /** Optimistic concurrency version counter. */
  _version?: number;

  /** Identifier of the device that last modified this record. */
  device_id?: string;
}

/**
 * A named commitment — a recurring area of responsibility the user tracks.
 *
 * Commitments live under one of three {@link CommitmentSection} buckets and
 * may optionally be associated with a {@link Project}.
 */
export interface Commitment {
  /** Unique identifier (UUID v4). */
  id: string;

  /** Foreign key → owning user. */
  user_id: string;

  /** Display name (e.g. "Maintain open-source repos"). */
  name: string;

  /** Life area this commitment belongs to — see {@link CommitmentSection}. */
  section: CommitmentSection;

  /** Sort position within its section. */
  order: number;

  /** If set, this commitment is scoped to a specific {@link Project}. */
  project_id?: string | null;

  /** ISO-8601 timestamp — creation time. */
  created_at: string;

  /** ISO-8601 timestamp — last modification time. */
  updated_at: string;

  /** Soft-delete tombstone flag for offline sync. */
  deleted?: boolean;

  /** Optimistic concurrency version counter. */
  _version?: number;

  /** Identifier of the device that last modified this record. */
  device_id?: string;
}

/**
 * A task that appears on today's daily task list.
 *
 * Daily tasks can be standalone one-offs **or** spawned from a
 * {@link LongTermTask} via `long_term_task_id`, inheriting its category.
 */
export interface DailyTask {
  /** Unique identifier (UUID v4). */
  id: string;

  /** Foreign key → owning user. */
  user_id: string;

  /** Task description shown in the daily list. */
  name: string;

  /**
   * If this daily task was spawned from a long-term agenda item, this field
   * links back to the source {@link LongTermTask}.
   */
  long_term_task_id?: string | null;

  /** Sort position in the daily list. */
  order: number;

  /** Whether the task has been checked off today. */
  completed: boolean;

  /** ISO-8601 timestamp — creation time. */
  created_at: string;

  /** ISO-8601 timestamp — last modification time. */
  updated_at: string;

  /** Soft-delete tombstone flag for offline sync. */
  deleted?: boolean;

  /** Optimistic concurrency version counter. */
  _version?: number;

  /** Identifier of the device that last modified this record. */
  device_id?: string;

  /**
   * **Runtime-only** — joined from the linked long-term task's category.
   * Not persisted to the database; populated at query time for display.
   */
  category?: TaskCategory;
}

/**
 * Discriminator for long-term agenda items.
 *
 * - `'task'` — actionable work item with a due date
 * - `'reminder'` — date-anchored note that surfaces on its due date
 */
export type AgendaItemType = 'task' | 'reminder';

/**
 * A long-term task or reminder that lives on the agenda board.
 *
 * Long-term tasks have a due date and can optionally belong to a
 * {@link TaskCategory}.  They may be "spawned" into daily tasks for
 * day-of execution.
 */
export interface LongTermTask {
  /** Unique identifier (UUID v4). */
  id: string;

  /** Foreign key → owning user. */
  user_id: string;

  /** Task / reminder description. */
  name: string;

  /** Target completion date (`YYYY-MM-DD`). */
  due_date: string;

  /** Foreign key → optional {@link TaskCategory} for colour-coding. */
  category_id: string | null;

  /** Whether this is an actionable task or a passive reminder — see {@link AgendaItemType}. */
  type: AgendaItemType;

  /** Whether the task has been completed. */
  completed: boolean;

  /** ISO-8601 timestamp — creation time. */
  created_at: string;

  /** ISO-8601 timestamp — last modification time. */
  updated_at: string;

  /** Soft-delete tombstone flag for offline sync. */
  deleted?: boolean;

  /** Optimistic concurrency version counter. */
  _version?: number;

  /** Identifier of the device that last modified this record. */
  device_id?: string;
}

/**
 * A {@link LongTermTask} with its {@link TaskCategory} eagerly joined.
 *
 * Used in views that render the category colour tag inline.
 */
export interface LongTermTaskWithCategory extends LongTermTask {
  /** The resolved category object, if `category_id` is set. */
  category?: TaskCategory;
}

// =============================================================================
//                          FOCUS FEATURE TYPES
// =============================================================================

/**
 * The current phase of a Pomodoro-style focus session.
 *
 * - `'focus'` — active deep-work interval
 * - `'break'` — short or long rest period
 * - `'idle'` — session has ended (all cycles complete)
 */
export type FocusPhase = 'focus' | 'break' | 'idle';

/**
 * Playback state of a {@link FocusSession}.
 *
 * - `'running'` — timer is actively counting down
 * - `'paused'` — timer frozen; remaining time preserved in `phase_remaining_ms`
 * - `'stopped'` — session terminated before natural completion
 */
export type FocusStatus = 'running' | 'paused' | 'stopped';

/**
 * User-configurable Pomodoro timer settings.
 *
 * One row per user; defaults are applied at creation time and can be adjusted
 * from the Focus settings panel.
 */
export interface FocusSettings {
  /** Unique identifier (UUID v4). */
  id: string;

  /** Foreign key → owning user. */
  user_id: string;

  /** Duration of each focus interval in **minutes** (default: 25). */
  focus_duration: number;

  /** Duration of a short break in **minutes** (default: 5). */
  break_duration: number;

  /** Duration of a long break in **minutes** (default: 15). */
  long_break_duration: number;

  /** Number of focus cycles before a long break is triggered. */
  cycles_before_long_break: number;

  /** Whether breaks start automatically after a focus phase ends. */
  auto_start_breaks: boolean;

  /** Whether the next focus phase starts automatically after a break. */
  auto_start_focus: boolean;

  /** ISO-8601 timestamp — creation time. */
  created_at: string;

  /** ISO-8601 timestamp — last modification time. */
  updated_at: string;

  /** Soft-delete tombstone flag for offline sync. */
  deleted?: boolean;

  /** Optimistic concurrency version counter. */
  _version?: number;

  /** Identifier of the device that last modified this record. */
  device_id?: string;
}

/**
 * A single focus session record, capturing the full lifecycle of a
 * Pomodoro run from start to finish.
 *
 * The `phase_remaining_ms` field is the source of truth for the countdown
 * timer — when `status === 'running'`, the UI subtracts elapsed wall-clock
 * time from `phase_remaining_ms` to derive the live display value.
 */
export interface FocusSession {
  /** Unique identifier (UUID v4). */
  id: string;

  /** Foreign key → owning user. */
  user_id: string;

  /** ISO-8601 timestamp — when the session was started. */
  started_at: string;

  /** ISO-8601 timestamp — when the session ended, or `null` if still active. */
  ended_at: string | null;

  /** Current phase of the Pomodoro cycle — see {@link FocusPhase}. */
  phase: FocusPhase;

  /** Playback state of the timer — see {@link FocusStatus}. */
  status: FocusStatus;

  /** 1-based index of the current focus cycle. */
  current_cycle: number;

  /** Total number of focus cycles planned for this session. */
  total_cycles: number;

  /** Focus interval duration in **minutes** (snapshot from settings at session start). */
  focus_duration: number;

  /** Short break duration in **minutes** (snapshot from settings at session start). */
  break_duration: number;

  /** ISO-8601 timestamp — when the current phase began. */
  phase_started_at: string;

  /**
   * Milliseconds remaining in the current phase.
   * When `status === 'paused'`, this is the frozen remaining time.
   * When `status === 'running'`, subtract `Date.now() - phase_started_at`
   * to get the live remaining time.
   */
  phase_remaining_ms: number;

  /** Total elapsed **focus** time accumulated across all cycles, in minutes. */
  elapsed_duration: number;

  /** ISO-8601 timestamp — creation time. */
  created_at: string;

  /** ISO-8601 timestamp — last modification time. */
  updated_at: string;

  /** Soft-delete tombstone flag for offline sync. */
  deleted?: boolean;

  /** Optimistic concurrency version counter. */
  _version?: number;

  /** Identifier of the device that last modified this record. */
  device_id?: string;
}

// =============================================================================
//                          BLOCK LIST TYPES
// =============================================================================

/**
 * A named collection of websites to block during focus sessions.
 *
 * Block lists can be toggled on/off individually and scoped to specific
 * days of the week, allowing fine-grained schedule control.
 */
export interface BlockList {
  /** Unique identifier (UUID v4). */
  id: string;

  /** Foreign key → owning user. */
  user_id: string;

  /** Display name (e.g. "Social Media", "News Sites"). */
  name: string;

  /**
   * Days of the week this block list is active.
   * `null` means **all days**.
   */
  active_days: DayOfWeek[] | null;

  /** Master toggle — `false` disables the list regardless of schedule. */
  is_enabled: boolean;

  /** Sort position among the user's block lists. */
  order: number;

  /** ISO-8601 timestamp — creation time. */
  created_at: string;

  /** ISO-8601 timestamp — last modification time. */
  updated_at: string;

  /** Soft-delete tombstone flag for offline sync. */
  deleted?: boolean;

  /** Optimistic concurrency version counter. */
  _version?: number;

  /** Identifier of the device that last modified this record. */
  device_id?: string;
}

/**
 * A single domain entry within a {@link BlockList}.
 */
export interface BlockedWebsite {
  /** Unique identifier (UUID v4). */
  id: string;

  /** Foreign key → parent {@link BlockList}. */
  block_list_id: string;

  /** The domain to block (e.g. `"twitter.com"`). */
  domain: string;

  /** ISO-8601 timestamp — creation time. */
  created_at: string;

  /** ISO-8601 timestamp — last modification time. */
  updated_at: string;

  /** Soft-delete tombstone flag for offline sync. */
  deleted?: boolean;

  /** Optimistic concurrency version counter. */
  _version?: number;

  /** Identifier of the device that last modified this record. */
  device_id?: string;
}

// =============================================================================
//                        PROJECTS FEATURE TYPES
// =============================================================================

/**
 * A top-level project that aggregates goals, tasks, and commitments
 * under a single umbrella.
 *
 * Projects can be marked as "current" to surface them prominently in the
 * dashboard, and may link to a {@link TaskCategory} (tag), a
 * {@link Commitment}, and a {@link GoalList} for holistic progress tracking.
 */
export interface Project {
  /** Unique identifier (UUID v4). */
  id: string;

  /** Foreign key → owning user. */
  user_id: string;

  /** Project name displayed across the UI. */
  name: string;

  /** Whether this project is flagged as the user's current active project. */
  is_current: boolean;

  /** Sort position among the user's projects. */
  order: number;

  /** Foreign key → optional {@link TaskCategory} used as a colour tag. */
  tag_id: string | null;

  /** Foreign key → optional {@link Commitment} this project fulfils. */
  commitment_id: string | null;

  /** Foreign key → optional {@link GoalList} tracking project milestones. */
  goal_list_id: string | null;

  /** ISO-8601 timestamp — creation time. */
  created_at: string;

  /** ISO-8601 timestamp — last modification time. */
  updated_at: string;

  /** Soft-delete tombstone flag for offline sync. */
  deleted?: boolean;

  /** Optimistic concurrency version counter. */
  _version?: number;

  /** Identifier of the device that last modified this record. */
  device_id?: string;
}

/**
 * A {@link Project} enriched with eagerly-joined detail objects and
 * aggregate statistics, used by dashboard and project-detail views.
 */
export interface ProjectWithDetails extends Project {
  /** Resolved {@link TaskCategory} acting as the project's colour tag. */
  tag?: TaskCategory | null;

  /** Resolved {@link GoalListWithProgress} with completion stats. */
  goalList?: GoalListWithProgress | null;

  /** Aggregate task completion counts for the project. */
  taskStats?: { totalTasks: number; completedTasks: number } | null;

  /**
   * Blended progress percentage combining goal completion and task
   * completion into a single 0–100 value for summary displays.
   */
  combinedProgress?: number;
}
