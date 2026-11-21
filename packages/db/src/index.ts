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

export type Settings = Row<"sp_settings">;
export type TaskList = Row<"sp_task_lists">;
export type Task = Row<"sp_tasks">;
export type GoalList = Row<"sp_goal_lists">;
export type Goal = Row<"sp_goals">;
export type Routine = Row<"sp_routines">;
export type RoutineLog = Row<"sp_routine_logs">;
export type FocusSettings = Row<"sp_focus_settings">;
export type FocusState = Row<"sp_focus_state">;
export type FocusSession = Row<"sp_focus_sessions">;
export type BlockList = Row<"sp_block_lists">;
export type BlockListSite = Row<"sp_block_list_sites">;
export type Quote = Row<"sp_quotes">;
export type Device = Row<"sp_devices">;
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
