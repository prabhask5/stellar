import type { FocusSettings, FocusState, RoutineLog, Settings } from "@stellar/db";
import { addDays, todayIn } from "@stellar/shared";
import {
  type Collections,
  type CollectionTable,
  type FocusCache,
  getRows,
  keys,
  patchRow,
  queryClient,
  removeRow,
  rowId,
  touchUniverse,
  upsertRow,
} from "../cache";
import { configureOutbox, enqueue, hasPending, type QueuedOp } from "../outbox";
import { readMeta, serverNow, setServerSkew } from "../session";
import { describeError, getSupabase } from "../supabase";
import { toastError } from "../toast";

export const SCORING_TABLES: ReadonlySet<string> = new Set([
  "sp_tasks",
  "sp_goals",
  "sp_routine_logs",
  "sp_focus_sessions",
]);

function ownerTimeZone(): string {
  return queryClient.getQueryData<Settings>(keys.settings)?.timezone ?? "UTC";
}

/** Today in the owner's time zone, by the server-corrected clock. */
export function currentToday(): string {
  return todayIn(ownerTimeZone(), serverNow());
}

export function nowIso(): string {
  return new Date(serverNow()).toISOString();
}

export function newId(): string {
  return crypto.randomUUID();
}

/** The owner's id for optimistic rows. Empty until the session is known; the server always sets the real value. */
export function currentUserId(): string {
  return readMeta()?.userId ?? "";
}

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw Object.assign(new Error(res.error.message), res.error);
  return res.data as T;
}

/** Loads one collection. Windows keep the payload small without hiding anything recent. */
export async function fetchCollection<T extends CollectionTable>(
  table: T,
): Promise<Collections[T][]> {
  const db = getSupabase();
  switch (table) {
    case "sp_tasks": {
      const since = new Date(serverNow() - 90 * 86_400_000).toISOString();
      return check(
        await db
          .from("sp_tasks")
          .select("*")
          .is("deleted_at", null)
          .or(`completed.eq.false,completed_at.gte.${since}`)
          .limit(5000),
      ) as Collections[T][];
    }
    case "sp_task_lists":
      return check(
        await db.from("sp_task_lists").select("*").is("deleted_at", null),
      ) as Collections[T][];
    case "sp_goal_lists":
      return check(
        await db.from("sp_goal_lists").select("*").is("deleted_at", null),
      ) as Collections[T][];
    case "sp_goals":
      return check(
        await db.from("sp_goals").select("*").is("deleted_at", null),
      ) as Collections[T][];
    case "sp_routines":
      return check(await db.from("sp_routines").select("*")) as Collections[T][];
    case "sp_routine_logs": {
      const from = addDays(currentToday(), -400);
      return check(
        await db.from("sp_routine_logs").select("*").gte("date", from).limit(20000),
      ) as Collections[T][];
    }
    case "sp_block_lists":
      return check(
        await db.from("sp_block_lists").select("*").is("deleted_at", null),
      ) as Collections[T][];
    case "sp_block_list_sites":
      return check(
        await db.from("sp_block_list_sites").select("*").limit(10000),
      ) as Collections[T][];
    case "sp_quotes":
      return check(await db.from("sp_quotes").select("*").limit(2000)) as Collections[T][];
    case "sp_focus_sessions": {
      const since = new Date(serverNow() - 40 * 86_400_000).toISOString();
      return check(
        await db
          .from("sp_focus_sessions")
          .select("*")
          .gte("ended_at", since)
          .order("ended_at", { ascending: false })
          .limit(1000),
      ) as Collections[T][];
    }
    default:
      throw new Error(`Unknown collection: ${String(table)}`);
  }
}

export async function fetchSettings(): Promise<Settings> {
  const db = getSupabase();
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const boot = check(await db.rpc("sp_bootstrap", { p_timezone: zone })) as unknown as {
    settings: Settings;
    focus_settings: FocusSettings;
    focus_state: FocusState;
    server_time: string;
  };
  setServerSkew(boot.server_time);
  // Bootstrap returns the timer too; seed it so Focus opens instantly.
  if (!queryClient.getQueryData(keys.focus)) {
    queryClient.setQueryData<FocusCache>(keys.focus, {
      state: boot.focus_state,
      settings: boot.focus_settings,
    });
  }
  return boot.settings;
}

export async function fetchFocus(): Promise<FocusCache> {
  const db = getSupabase();
  const startedAt = Date.now();
  const res = check(await db.rpc("sp_focus_get")) as unknown as {
    state: FocusState;
    settings: FocusSettings;
    server_time: string;
  };
  setServerSkew(res.server_time, (startedAt + Date.now()) / 2);
  return { state: res.state, settings: res.settings };
}

// ── optimistic writes ───────────────────────────────────────────────────────

/** Adds a row locally and queues the insert. The row carries a client-generated id. */
export function insertRow<T extends CollectionTable>(
  table: T,
  row: Collections[T],
  send: Record<string, unknown>,
): void {
  upsertRow(table, row);
  enqueue({ kind: "insert", table, row: send });
  if (SCORING_TABLES.has(table)) touchUniverse();
}

/** Patches a row locally and queues the update. Returns the row as it was, for Undo. */
export function updateRow<T extends CollectionTable>(
  table: T,
  id: string,
  patch: Partial<Collections[T]>,
): Collections[T] | null {
  const before = patchRow(table, id, { ...patch, updated_at: nowIso() } as Partial<Collections[T]>);
  if (!before) return null;
  enqueue({ kind: "update", table, id, patch: patch as Record<string, unknown> });
  if (SCORING_TABLES.has(table)) touchUniverse();
  return before;
}

/** Soft delete: the row leaves the cache now and is purged server-side after 30 days. */
export function softDeleteRow<T extends CollectionTable>(
  table: T,
  id: string,
): Collections[T] | null {
  const removed = removeRow(table, id);
  if (!removed) return null;
  enqueue({ kind: "update", table, id, patch: { deleted_at: nowIso() } });
  return removed;
}

/** Undo for softDeleteRow. */
export function restoreRow<T extends CollectionTable>(table: T, row: Collections[T]): void {
  upsertRow(table, { ...row, deleted_at: null } as Collections[T]);
  enqueue({
    kind: "update",
    table,
    id: rowId(table, row as Record<string, unknown>),
    patch: { deleted_at: null },
  });
}

export function hardDeleteRow<T extends CollectionTable>(
  table: T,
  id: string,
): Collections[T] | null {
  const removed = removeRow(table, id);
  if (!removed) return null;
  enqueue({ kind: "delete", table, id });
  return removed;
}

// ── outbox results ──────────────────────────────────────────────────────────

function isRow(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function applyTimerResult(result: unknown): void {
  if (!isRow(result) || !isRow(result.state)) return;
  if (typeof result.server_time === "string") setServerSkew(result.server_time);
  const state = result.state as unknown as FocusState;
  queryClient.setQueryData<FocusCache>(keys.focus, (prev) =>
    prev && !hasPending("sp_focus_state") && Number(state.version) >= Number(prev.state.version)
      ? { ...prev, state }
      : prev,
  );
  if (result.ok === false) void queryClient.invalidateQueries({ queryKey: keys.focus });
  if (result.session) {
    void queryClient.invalidateQueries({ queryKey: keys.table("sp_focus_sessions") });
    touchUniverse();
  }
}

function onSuccess(item: QueuedOp, result: unknown): void {
  const { op } = item;
  switch (op.kind) {
    case "insert":
    case "update": {
      if (op.table === "sp_push_subscriptions") return;
      // Take the server's version of the row (computed columns) unless newer local edits are still queued.
      if (isRow(result) && !hasPending(`${op.table}:${String(result.id)}`)) {
        upsertRow(op.table, result as unknown as Collections[typeof op.table]);
      }
      return;
    }
    case "log": {
      if (isRow(result) && !hasPending(`sp_routine_logs:${op.routine_id}:${op.date}`)) {
        upsertRow("sp_routine_logs", result as unknown as RoutineLog);
      }
      touchUniverse();
      return;
    }
    case "update_singleton": {
      if (!isRow(result) || hasPending(op.table)) return;
      if (op.table === "sp_settings") queryClient.setQueryData(keys.settings, result);
      else {
        queryClient.setQueryData<FocusCache>(keys.focus, (prev) =>
          prev ? { ...prev, settings: result as unknown as FocusSettings } : prev,
        );
      }
      return;
    }
    case "timer":
      applyTimerResult(result);
      return;
    default:
      return;
  }
}

function onError(item: QueuedOp, error: unknown): void {
  const { op } = item;
  console.warn("[sync] change rejected", op.kind, describeError(error));
  toastError("That change couldn't be saved. Your data has been refreshed.");
  // Roll back by reloading the truth for whatever the operation touched.
  if (op.kind === "insert" || op.kind === "update" || op.kind === "delete") {
    if (op.table !== "sp_push_subscriptions")
      void queryClient.invalidateQueries({ queryKey: keys.table(op.table) });
  } else if (op.kind === "log") {
    void queryClient.invalidateQueries({ queryKey: keys.table("sp_routine_logs") });
  } else if (op.kind === "update_singleton") {
    void queryClient.invalidateQueries({
      queryKey: op.table === "sp_settings" ? keys.settings : keys.focus,
    });
  } else if (op.kind === "timer") {
    void queryClient.invalidateQueries({ queryKey: keys.focus });
  } else {
    void queryClient.invalidateQueries();
  }
  touchUniverse();
}

configureOutbox({ onSuccess, onError });

export { getRows };
