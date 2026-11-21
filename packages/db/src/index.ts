import type { Database } from "./types.ts";

export type { Database, Json } from "./types.ts";
export {
  fullMigrationSql,
  LATEST_SCHEMA_VERSION,
  MIGRATIONS,
  type Migration,
  migrationSql,
  pendingMigrations,
} from "./migrations.ts";

type Tables = Database["public"]["Tables"];

export type TableName = keyof Tables;
export type Row<T extends TableName> = Tables[T]["Row"];
export type Insert<T extends TableName> = Tables[T]["Insert"];
export type Update<T extends TableName> = Tables[T]["Update"];

type GoalKind = "todo" | "progress";
type Narrow<T, N> = Omit<T, keyof N> & N;

// Domain row types: the generated rows with text-check columns narrowed to their
// unions, and without PostgREST computed columns (which `select *` never returns).
export type Settings = Narrow<
  Row<"sp_settings">,
  { week_start: 0 | 1; quality_tier: "auto" | "cinematic" | "balanced" | "minimal" }
>;
export type TaskList = Narrow<Row<"sp_task_lists">, { sort_order: number }>;
export type Task = Narrow<Row<"sp_tasks">, { sort_order: number }>;
export type GoalList = Narrow<Row<"sp_goal_lists">, { sort_order: number }>;
export type Goal = Narrow<
  Omit<Row<"sp_goals">, "sp_goal_progress">,
  { type: GoalKind; sort_order: number }
>;
export type Routine = Narrow<
  Row<"sp_routines">,
  { type: GoalKind; frequency: "daily" | "weekdays" | "interval"; sort_order: number }
>;
export type RoutineLog = Row<"sp_routine_logs">;
export type FocusSettings = Row<"sp_focus_settings">;
export type FocusState = Narrow<
  Row<"sp_focus_state">,
  {
    status: "idle" | "running" | "paused" | "awaiting";
    phase: "focus" | "short_break" | "long_break";
    last_completed_phase: "focus" | "short_break" | "long_break" | null;
  }
>;
export type FocusSession = Narrow<
  Row<"sp_focus_sessions">,
  { phase: "focus" | "short_break" | "long_break" }
>;
export type BlockList = Narrow<Row<"sp_block_lists">, { sort_order: number }>;
export type BlockListSite = Row<"sp_block_list_sites">;
export type Quote = Row<"sp_quotes">;
export type Device = Narrow<Row<"sp_devices">, { kind: "web" | "pwa" | "extension" | "ios" }>;
export type PushSubscriptionRow = Row<"sp_push_subscriptions">;
export type AuthEvent = Row<"sp_auth_events">;
export type UniverseEvent = Row<"sp_universe_events">;

/** Tables published to Supabase Realtime (SPEC §3.4). */
export const REALTIME_TABLES = [
  "sp_focus_state",
  "sp_focus_settings",
  "sp_block_lists",
  "sp_block_list_sites",
  "sp_tasks",
  "sp_task_lists",
  "sp_goals",
  "sp_goal_lists",
  "sp_routines",
  "sp_routine_logs",
] as const satisfies readonly TableName[];

export type RealtimeTable = (typeof REALTIME_TABLES)[number];
