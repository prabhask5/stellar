import { createStore, del, get, set } from "idb-keyval";
import type { CollectionTable } from "./cache";
import { getSession, serverNow } from "./session";
import { getSupabase, isNetworkError } from "./supabase";
import { useSync } from "./sync-store";

/**
 * The outbox. Every mutation is applied to the cache first (optimistic) and
 * queued here; operations are sent strictly in order and survive reloads in
 * IndexedDB, so changes made offline replay on reconnect. Inserts carry
 * client-generated ids and are idempotent; updates that waited offline only
 * apply if the row has not been changed since (last write wins by updated_at).
 */
export type Op =
  | {
      kind: "insert";
      table: CollectionTable | "sp_push_subscriptions";
      row: Record<string, unknown>;
    }
  | { kind: "update"; table: CollectionTable; id: string; patch: Record<string, unknown> }
  | {
      kind: "update_singleton";
      table: "sp_settings" | "sp_focus_settings";
      patch: Record<string, unknown>;
    }
  | { kind: "delete"; table: CollectionTable; id: string }
  | {
      kind: "log";
      routine_id: string;
      date: string;
      completed: boolean | null;
      amount: number | null;
    }
  | { kind: "timer"; action: string; expectedVersion: number }
  | { kind: "rpc"; fn: string; args: Record<string, unknown> };

export interface QueuedOp {
  id: string;
  /** Server-corrected time of the user's action, epoch ms. */
  at: number;
  op: Op;
}

export interface OutboxHandlers {
  onSuccess: (item: QueuedOp, result: unknown) => void;
  onError: (item: QueuedOp, error: unknown) => void;
}

const STORE_KEY = "queue";
/** Updates older than this when sent are treated as offline edits and guarded by updated_at. */
const STALE_MS = 15_000;

let queue: QueuedOp[] = [];
let handlers: OutboxHandlers = { onSuccess: () => {}, onError: () => {} };
let flushing = false;
let loaded: Promise<void> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryDelay = 2000;

const idb = typeof indexedDB === "undefined" ? null : createStore("stellar-outbox", "ops");

function persist(): void {
  if (!idb) return;
  const snapshot = queue.slice();
  (snapshot.length ? set(STORE_KEY, snapshot, idb) : del(STORE_KEY, idb)).catch(() => {
    // Storage full or blocked: the queue still lives in memory for this session.
  });
}

function publish(): void {
  useSync.setState({ pending: queue.length, syncing: flushing && queue.length > 0 });
}

/** Key of the row an operation touches, used to hold back Realtime echoes while it is pending. */
export function opRowKey(op: Op): string | null {
  switch (op.kind) {
    case "insert":
      return typeof op.row.id === "string" ? `${op.table}:${op.row.id}` : null;
    case "update":
    case "delete":
      return `${op.table}:${op.id}`;
    case "log":
      return `sp_routine_logs:${op.routine_id}:${op.date}`;
    case "update_singleton":
      return op.table;
    case "timer":
      return "sp_focus_state";
    default:
      return null;
  }
}

export function hasPending(rowKey: string): boolean {
  return queue.some((q) => opRowKey(q.op) === rowKey);
}

export function pendingOps(): readonly QueuedOp[] {
  return queue;
}

export function configureOutbox(next: OutboxHandlers): void {
  handlers = next;
}

/** Loads operations left over from a previous session. */
export function loadOutbox(): Promise<void> {
  if (!loaded) {
    loaded = (async () => {
      if (!idb) return;
      try {
        const saved = await get<QueuedOp[]>(STORE_KEY, idb);
        if (Array.isArray(saved) && saved.length) queue = [...saved, ...queue];
      } catch {
        // unreadable store: start empty
      }
      publish();
    })();
  }
  return loaded;
}

function newId(): string {
  return crypto.randomUUID();
}

export function enqueue(op: Op): QueuedOp {
  const item: QueuedOp = { id: newId(), at: serverNow(), op };
  queue.push(item);
  persist();
  publish();
  void flush();
  return item;
}

class OpError extends Error {
  readonly code: string | null;
  readonly status: number | null;
  constructor(message: string, code: string | null, status: number | null) {
    super(message);
    this.name = "OpError";
    this.code = code;
    this.status = status;
  }
}

interface PgResult {
  data: unknown;
  error: { message: string; code?: string } | null;
  status?: number;
}

function unwrap(res: PgResult): unknown {
  if (res.error) throw new OpError(res.error.message, res.error.code ?? null, res.status ?? null);
  return res.data;
}

// The outbox addresses tables by name at runtime, beyond what the generated types can express.
interface Untyped {
  from(table: string): {
    upsert(row: unknown, opts: unknown): { select(): { maybeSingle(): PromiseLike<PgResult> } };
    update(patch: unknown): UntypedFilter;
    delete(): UntypedFilter;
  };
  rpc(fn: string, args?: unknown): PromiseLike<PgResult>;
}
interface UntypedFilter extends PromiseLike<PgResult> {
  eq(column: string, value: unknown): UntypedFilter;
  lte(column: string, value: unknown): UntypedFilter;
  select(): { maybeSingle(): PromiseLike<PgResult> };
}

async function execute(item: QueuedOp): Promise<unknown> {
  const db = getSupabase() as unknown as Untyped;
  const { op } = item;
  const waited = serverNow() - item.at > STALE_MS;
  switch (op.kind) {
    case "insert":
      return unwrap(
        await db
          .from(op.table)
          .upsert(op.row, { onConflict: "id", ignoreDuplicates: true })
          .select()
          .maybeSingle(),
      );
    case "update": {
      let q = db.from(op.table).update(op.patch).eq("id", op.id);
      // An edit that sat in the outbox must not overwrite a newer change from another device.
      if (waited) q = q.lte("updated_at", new Date(item.at).toISOString());
      return unwrap(await q.select().maybeSingle());
    }
    case "update_singleton": {
      const { userId } = await getSession();
      return unwrap(
        await db.from(op.table).update(op.patch).eq("user_id", userId).select().maybeSingle(),
      );
    }
    case "delete":
      return unwrap(await db.from(op.table).delete().eq("id", op.id));
    case "log":
      return unwrap(
        await db.rpc("sp_routine_log_set", {
          p_routine_id: op.routine_id,
          p_date: op.date,
          p_completed: op.completed,
          p_amount: op.amount,
        }),
      );
    case "timer":
      return unwrap(
        await db.rpc("sp_timer_action", {
          p_action: op.action,
          p_expected_version: op.expectedVersion,
        }),
      );
    case "rpc":
      return unwrap(await db.rpc(op.fn, op.args));
  }
}

function isAuthError(err: unknown): boolean {
  const e = err as { code?: string | null; status?: number | null; message?: string };
  return (
    e?.status === 401 ||
    e?.code === "PGRST301" ||
    e?.code === "PGRST303" ||
    /jwt expired/i.test(e?.message ?? "")
  );
}

function scheduleRetry(): void {
  if (retryTimer) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void flush();
  }, retryDelay);
  retryDelay = Math.min(retryDelay * 2, 30_000);
}

/** Sends queued operations in order. Stops at the first network failure and retries later. */
export async function flush(): Promise<void> {
  // Claim the flush synchronously: a second caller must not start while this one is still loading.
  if (flushing) return;
  flushing = true;
  let authRetried = false;
  try {
    await loadOutbox();
    if (queue.length === 0) return;
    publish();
    // Nothing can be sent before the session is known (first paint, or offline at launch).
    try {
      await getSession();
    } catch {
      scheduleRetry();
      return;
    }
    while (queue.length > 0) {
      const item = queue[0] as QueuedOp;
      try {
        const result = await execute(item);
        queue.shift();
        persist();
        retryDelay = 2000;
        authRetried = false;
        if (!useSync.getState().online) useSync.setState({ online: true });
        handlers.onSuccess(item, result);
      } catch (err) {
        if (isNetworkError(err)) {
          useSync.setState({ online: false });
          scheduleRetry();
          break;
        }
        if (isAuthError(err) && !authRetried) {
          authRetried = true;
          try {
            await getSession(true);
            continue;
          } catch {
            scheduleRetry();
            break;
          }
        }
        // The server refused this change for good: drop it and let the caller roll back.
        queue.shift();
        persist();
        handlers.onError(item, err);
      }
      publish();
    }
  } finally {
    flushing = false;
    publish();
    // Anything queued while this flush was finishing gets its own pass.
    if (queue.length > 0 && !retryTimer) setTimeout(() => void flush(), 0);
  }
}

/** Wires connectivity events. Call once on app start. */
export function startOutbox(): () => void {
  const onOnline = () => {
    useSync.setState({ online: true });
    retryDelay = 2000;
    void flush();
  };
  const onOffline = () => useSync.setState({ online: false });
  const onVisible = () => {
    if (document.visibilityState === "visible") void flush();
  };
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  document.addEventListener("visibilitychange", onVisible);
  void loadOutbox().then(() => flush());
  return () => {
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    document.removeEventListener("visibilitychange", onVisible);
  };
}

/** Test hook. */
export function resetOutbox(): void {
  queue = [];
  flushing = false;
  loaded = null;
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  retryDelay = 2000;
  publish();
}
