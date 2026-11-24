import type {
  BlockList,
  BlockListSite,
  FocusSession,
  FocusSettings,
  FocusState,
  Goal,
  GoalList,
  Quote,
  Routine,
  RoutineLog,
  Settings,
  Task,
  TaskList,
} from "@stellar/db";
import type { UniverseSnapshot } from "@stellar/shared";
import { QueryClient, type QueryKey } from "@tanstack/react-query";
import { isNetworkError } from "./supabase";

const DAY = 86_400_000;

/**
 * One client for the whole app. Data is kept fresh by Realtime, so queries
 * rarely refetch on their own; the cache is persisted to IndexedDB (see
 * persist.ts) and the app opens from it instantly.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60_000,
      gcTime: 14 * DAY,
      networkMode: "offlineFirst",
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      retry: (count, err) => isNetworkError(err) && count < 2,
    },
  },
});

export interface FocusCache {
  state: FocusState;
  settings: FocusSettings;
}

/** The cached collections, by table. */
export interface Collections {
  sp_task_lists: TaskList;
  sp_tasks: Task;
  sp_goal_lists: GoalList;
  sp_goals: Goal;
  sp_routines: Routine;
  sp_routine_logs: RoutineLog;
  sp_block_lists: BlockList;
  sp_block_list_sites: BlockListSite;
  sp_quotes: Quote;
  sp_focus_sessions: FocusSession;
}
export type CollectionTable = keyof Collections;

export const keys = {
  settings: ["settings"] as const,
  focus: ["focus"] as const,
  universe: ["universe"] as const,
  devices: ["devices"] as const,
  focusStats: (days: number) => ["focus_stats", days] as const,
  table: (table: CollectionTable): QueryKey => [table],
};

export type SettingsCache = Settings;
export type UniverseCache = UniverseSnapshot;

const SOFT_DELETE: ReadonlySet<string> = new Set([
  "sp_task_lists",
  "sp_tasks",
  "sp_goal_lists",
  "sp_goals",
  "sp_block_lists",
]);

/** Identity of a row inside its collection. Logs are keyed by routine and date. */
export function rowId(table: CollectionTable, row: Record<string, unknown>): string {
  return table === "sp_routine_logs"
    ? `${String(row.routine_id)}:${String(row.date)}`
    : String(row.id);
}

export function getRows<T extends CollectionTable>(table: T): Collections[T][] {
  return queryClient.getQueryData<Collections[T][]>(keys.table(table)) ?? [];
}

export function setRows<T extends CollectionTable>(
  table: T,
  update: (rows: Collections[T][]) => Collections[T][],
): void {
  const key = keys.table(table);
  const loaded = queryClient.getQueryData(key) !== undefined;
  queryClient.setQueryData<Collections[T][]>(key, (prev) => update(prev ?? []));
  // Writing to a list that was never loaded must not pass for the whole list: it stays
  // stale, so the first screen that shows it still fetches (and merges what is queued).
  if (!loaded) void queryClient.invalidateQueries({ queryKey: key, refetchType: "none" });
}

/** Inserts or replaces a row. A soft-deleted row is removed from the collection instead. */
export function upsertRow<T extends CollectionTable>(table: T, row: Collections[T]): void {
  const id = rowId(table, row as Record<string, unknown>);
  const deleted = SOFT_DELETE.has(table) && (row as { deleted_at?: string | null }).deleted_at;
  setRows(table, (rows) => {
    const index = rows.findIndex((r) => rowId(table, r as Record<string, unknown>) === id);
    if (deleted) return index < 0 ? rows : rows.filter((_, i) => i !== index);
    if (index < 0) return [...rows, row];
    const next = rows.slice();
    next[index] = row;
    return next;
  });
}

export function patchRow<T extends CollectionTable>(
  table: T,
  id: string,
  patch: Partial<Collections[T]>,
): Collections[T] | null {
  let before: Collections[T] | null = null;
  setRows(table, (rows) =>
    rows.map((r) => {
      if (rowId(table, r as Record<string, unknown>) !== id) return r;
      before = r;
      return { ...r, ...patch };
    }),
  );
  return before;
}

export function removeRow<T extends CollectionTable>(table: T, id: string): Collections[T] | null {
  let removed: Collections[T] | null = null;
  setRows(table, (rows) =>
    rows.filter((r) => {
      if (rowId(table, r as Record<string, unknown>) !== id) return true;
      removed = r;
      return false;
    }),
  );
  return removed;
}

export function findRow<T extends CollectionTable>(table: T, id: string): Collections[T] | null {
  return getRows(table).find((r) => rowId(table, r as Record<string, unknown>) === id) ?? null;
}

let universeTimer: ReturnType<typeof setTimeout> | null = null;

/** The snapshot is derived data: refetch it shortly after anything that scores. */
export function touchUniverse(delayMs = 900): void {
  if (universeTimer) clearTimeout(universeTimer);
  universeTimer = setTimeout(() => {
    universeTimer = null;
    void queryClient.invalidateQueries({ queryKey: keys.universe });
  }, delayMs);
}
