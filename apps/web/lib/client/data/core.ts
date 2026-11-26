import type { FocusSettings, FocusState, Goal, RoutineLog, Settings } from "@stellar/db";
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
  upsertRow,
} from "../cache";
import { isDemo } from "../demo";
import { configureOutbox, enqueue, hasPending, type QueuedOp } from "../outbox";
import { readMeta, serverNow, setServerSkew } from "../session";
import { describeError, getSupabase } from "../supabase";
import { toastError } from "../toast";

const ZONE_KEY = "sp-timezone";

/** Remembers the owner's zone so the next launch knows "today" before the settings arrive. */
export function rememberTimeZone(zone: string): void {
  try {
    localStorage.setItem(ZONE_KEY, zone);
  } catch {
    // storage unavailable: the fallback below is the device's zone
  }
}

/**
 * The zone to use while the settings are not loaded yet: the one this device saw
 * last, else the device's own. (UTC would put "today" on the wrong day for most of
 * the world for the first moments after launch, and a task added then would get it.)
 */
export function fallbackTimeZone(): string {
  try {
    const saved = localStorage.getItem(ZONE_KEY);
    if (saved) return saved;
  } catch {
    // ignored
  }
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** True once the owner's time zone is known: from the settings, or remembered from an earlier launch. */
export function zoneKnown(): boolean {
  if (queryClient.getQueryData<Settings>(keys.settings)) return true;
  try {
    return localStorage.getItem(ZONE_KEY) !== null;
  } catch {
    return false;
  }
}

/** Resolves when the settings have loaded (or after a few seconds if they cannot be). */
export function whenZoneKnown(timeoutMs = 4000): Promise<void> {
  if (zoneKnown()) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      unsubscribe();
      resolve();
    };
    const timer = setTimeout(done, timeoutMs);
    const unsubscribe = queryClient.getQueryCache().subscribe(() => {
      if (queryClient.getQueryData<Settings>(keys.settings)) done();
    });
  });
}

function ownerTimeZone(): string {
  return queryClient.getQueryData<Settings>(keys.settings)?.timezone ?? fallbackTimeZone();
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

const PAGE = 1000;

interface Pageable {
  order(column: string, opts?: { ascending?: boolean }): Pageable;
  range(
    from: number,
    to: number,
  ): PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
}

/**
 * Reads every row of a query. PostgREST caps a response (1,000 rows on a stock
 * Supabase), so one request would silently cut a long list short, in no particular
 * order. Pages are read in a stable order until a short one comes back.
 */
async function fetchAll<T>(query: unknown, orderBy: string[], max = 50_000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < max; from += PAGE) {
    let q = query as Pageable;
    for (const column of orderBy) q = q.order(column, { ascending: true });
    const rows = check(await q.range(from, from + PAGE - 1)) as T[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

/** Loads one collection. Windows keep the payload small without hiding anything recent. */
export async function fetchCollection<T extends CollectionTable>(
  table: T,
): Promise<Collections[T][]> {
  const db = await getSupabase();
  type Rows = Collections[T][];
  switch (table) {
    case "sp_tasks": {
      const since = new Date(serverNow() - 90 * 86_400_000).toISOString();
      return fetchAll<Collections[T]>(
        db
          .from("sp_tasks")
          .select("*")
          .is("deleted_at", null)
          .or(`completed.eq.false,completed_at.gte.${since}`),
        ["id"],
      );
    }
    case "sp_task_lists":
      return fetchAll(db.from("sp_task_lists").select("*").is("deleted_at", null), ["id"]);
    case "sp_goal_lists":
      return fetchAll(db.from("sp_goal_lists").select("*").is("deleted_at", null), ["id"]);
    case "sp_goals":
      return fetchAll(db.from("sp_goals").select("*").is("deleted_at", null), ["id"]);
    case "sp_routines":
      return fetchAll(db.from("sp_routines").select("*"), ["id"]);
    case "sp_routine_logs": {
      const from = addDays(currentToday(), -400);
      return fetchAll(db.from("sp_routine_logs").select("*").gte("date", from), [
        "routine_id",
        "date",
      ]);
    }
    case "sp_block_lists":
      return fetchAll(db.from("sp_block_lists").select("*").is("deleted_at", null), ["id"]);
    case "sp_block_list_sites":
      return fetchAll(db.from("sp_block_list_sites").select("*"), ["id"]);
    case "sp_quotes":
      return fetchAll(db.from("sp_quotes").select("*"), ["id"]);
    case "sp_events":
      return fetchAll(db.from("sp_events").select("*"), ["id"]);
    case "sp_focus_sessions": {
      const since = new Date(serverNow() - 40 * 86_400_000).toISOString();
      const rows = await fetchAll<Collections["sp_focus_sessions"]>(
        db.from("sp_focus_sessions").select("*").gte("ended_at", since),
        ["id"],
      );
      rows.sort((x, y) => (x.ended_at < y.ended_at ? 1 : x.ended_at > y.ended_at ? -1 : 0));
      return rows as Rows;
    }
    default:
      throw new Error(`Unknown collection: ${String(table)}`);
  }
}

const stamp = (row: unknown): number => {
  const t = Date.parse(String((row as { updated_at?: string | null }).updated_at ?? ""));
  return Number.isFinite(t) ? t : 0;
};

/** Tables whose next load must take the server's rows as they are (after a rejected or lost change). */
const takeServer = new Set<string>();

/**
 * Loads a collection without undoing what the user just did. A plain refetch
 * would replace the cached list with the server's, which does not yet contain
 * changes still waiting in the outbox, and a request that began before a change
 * was saved comes back older than the cache. So, row by row:
 *  - a row with queued changes keeps its cached (optimistic) state;
 *  - otherwise the newer of the two versions wins;
 *  - a cached row missing from the server is kept only if it was written after
 *    this request started.
 */
export async function loadCollection<T extends CollectionTable>(
  table: T,
): Promise<Collections[T][]> {
  // Demo mode has no server: what is in memory is the data.
  if (isDemo()) return getRows(table);
  const startedAt = serverNow();
  const fetched = await fetchCollection(table);
  const cached = queryClient.getQueryData<Collections[T][]>(keys.table(table));
  if (!cached) return fetched;
  const authoritative = takeServer.delete(table);
  const id = (row: Collections[T]) => rowId(table, row as Record<string, unknown>);
  const cachedById = new Map(cached.map((r) => [id(r), r]));
  const merged: Collections[T][] = [];
  const seen = new Set<string>();
  for (const row of fetched) {
    const key = id(row);
    seen.add(key);
    const mine = cachedById.get(key);
    if (hasPending(`${table}:${key}`)) {
      // Pending and still in the cache: keep our version. Pending and gone: we deleted it.
      if (mine) merged.push(mine);
      continue;
    }
    merged.push(!authoritative && mine && stamp(mine) > stamp(row) ? mine : row);
  }
  for (const row of cached) {
    const key = id(row);
    if (seen.has(key)) continue;
    if (hasPending(`${table}:${key}`) || (!authoritative && stamp(row) >= startedAt))
      merged.push(row);
  }
  return merged;
}

/** Reloads a collection and takes the server's rows as they are. */
export function reloadFromServer(table: CollectionTable): void {
  takeServer.add(table);
  void queryClient.invalidateQueries({ queryKey: keys.table(table) });
}

export async function fetchSettings(): Promise<Settings> {
  if (isDemo()) return queryClient.getQueryData<Settings>(keys.settings)!;
  const db = await getSupabase();
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
  rememberTimeZone(boot.settings.timezone);
  return boot.settings;
}

export async function fetchFocus(): Promise<FocusCache> {
  if (isDemo()) return queryClient.getQueryData<FocusCache>(keys.focus)!;
  const db = await getSupabase();
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
    case "rpc": {
      // sp_goal_increment answers with the goal as the server now has it.
      if (op.fn === "sp_goal_increment" && isRow(result) && typeof result.id === "string") {
        if (!hasPending(`sp_goals:${result.id}`)) upsertRow("sp_goals", result as unknown as Goal);
      }
      return;
    }
    default:
      return;
  }
}

/** Reloads the truth for everything an operation may have touched. */
function refreshAfter(op: QueuedOp["op"]): void {
  if (op.kind === "insert" || op.kind === "update" || op.kind === "delete") {
    if (op.table === "sp_push_subscriptions") return;
    reloadFromServer(op.table);
    // Changes to a parent reach its children too (cascades, rewrites).
    if (op.table === "sp_task_lists") reloadFromServer("sp_tasks");
    if (op.table === "sp_goal_lists") reloadFromServer("sp_goals");
    if (op.table === "sp_routines") reloadFromServer("sp_routine_logs");
    if (op.table === "sp_block_lists") {
      reloadFromServer("sp_block_list_sites");
      void queryClient.invalidateQueries({ queryKey: keys.focus });
    }
  } else if (op.kind === "log") {
    reloadFromServer("sp_routine_logs");
    reloadFromServer("sp_routines");
  } else if (op.kind === "update_singleton") {
    void queryClient.invalidateQueries({
      queryKey: op.table === "sp_settings" ? keys.settings : keys.focus,
    });
  } else if (op.kind === "timer") {
    void queryClient.invalidateQueries({ queryKey: keys.focus });
  } else {
    const tables = new Set((op.rowKeys ?? []).map((k) => k.split(":")[0] as CollectionTable));
    if (tables.size === 0) void queryClient.invalidateQueries();
    for (const t of tables) reloadFromServer(t);
  }
}

function onError(item: QueuedOp, error: unknown): void {
  console.warn("[sync] change rejected", item.op.kind, describeError(error));
  toastError("That change couldn't be saved. Your data has been refreshed.");
  refreshAfter(item.op);
}

/** A newer change from another device won, or the row is gone: show what is really there. */
function onConflict(item: QueuedOp): void {
  refreshAfter(item.op);
}

configureOutbox({ onSuccess, onError, onConflict });

export { getRows };
