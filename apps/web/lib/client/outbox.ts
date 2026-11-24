import { isDemo } from "./demo";
import { createStore, del, entries, set, setMany } from "idb-keyval";
import type { CollectionTable } from "./cache";
import { recordSync } from "./diagnostics";
import { getSession, serverNow } from "./session";
import { getSupabase } from "./supabase";
import { useSync } from "./sync-store";

/**
 * The outbox. Every mutation is applied to the cache first (optimistic) and
 * queued here; operations are sent strictly in order and survive reloads in
 * IndexedDB, so changes made offline replay on reconnect.
 *
 * - Inserts carry client-generated ids and are idempotent.
 * - An update that waited offline only applies if the row has not been changed
 *   since (last write wins by updated_at). Once one of our own operations on a
 *   row has landed, the ones queued behind it follow without that check: the
 *   first one settled the conflict, and its own write moved `updated_at`.
 * - Every tab shares one queue. Operations are stored one per key, a Web Lock
 *   lets a single tab send at a time, and results are broadcast so each tab can
 *   settle its own cache.
 * - Only failures that can heal (no connection, timeouts, gateway errors) are
 *   retried. Anything the database refuses is dropped and reported, so one bad
 *   operation can never hold up the rest.
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
  | {
      kind: "rpc";
      fn: string;
      args: Record<string, unknown>;
      /** Rows this call changes, so Realtime echoes and refetches leave them alone meanwhile. */
      rowKeys?: string[];
      /** Name of the argument that receives this operation's id, making a replay harmless. */
      opIdArg?: string;
    };

export interface QueuedOp {
  id: string;
  /** Server-corrected time of the user's action, epoch ms. */
  at: number;
  op: Op;
  /** Position in the shared queue. */
  seq?: number;
  /** An earlier operation of ours on the same row has already landed. */
  chained?: boolean;
  /** Times the server (not the network) failed this operation. */
  tries?: number;
}

export interface OutboxHandlers {
  onSuccess: (item: QueuedOp, result: unknown) => void;
  onError: (item: QueuedOp, error: unknown) => void;
  /** The change lost to a newer one, or its row is gone: refresh quietly. */
  onConflict?: (item: QueuedOp) => void;
}

const LEGACY_KEY = "queue";
const KEY_PREFIX = "op:";
const LOCK_NAME = "stellar-outbox-flush";
const CHANNEL_NAME = "stellar-outbox";
/** Updates older than this when sent are treated as offline edits and guarded by updated_at. */
const STALE_MS = 15_000;
/** A server that keeps answering 5xx for the same operation gets this many attempts. */
const MAX_SERVER_TRIES = 8;
const BUSY_RETRY_MS = 1500;
const CONFLICT = Symbol("conflict");

/**
 * A function that returns a table row and answers NULL arrives from PostgREST as a row
 * whose every column is null, not as `null`.
 */
function missingRow(row: unknown): boolean {
  if (row === null || row === undefined) return true;
  if (typeof row !== "object" || Array.isArray(row)) return false;
  const r = row as Record<string, unknown>;
  return ("id" in r && r.id === null) || ("routine_id" in r && r.routine_id === null);
}

let queue: QueuedOp[] = [];
let handlers: OutboxHandlers = { onSuccess: () => {}, onError: () => {} };
let flushing = false;
let loaded: Promise<void> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryDelay = 2000;
let seqCounter = 0;
/** Ids settled by any tab, so a late read of the store cannot bring them back. */
const settledIds = new Set<string>();

const idb = typeof indexedDB === "undefined" ? null : createStore("stellar-outbox", "ops");
const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(CHANNEL_NAME);

type Broadcast =
  | { t: "new" }
  | {
      t: "done";
      item: QueuedOp;
      outcome: "ok" | "conflict" | "error";
      result?: unknown;
      error?: { message: string; code: string | null; status: number | null };
    };

function persistItem(item: QueuedOp): void {
  if (!idb) return;
  set(KEY_PREFIX + item.id, item, idb).catch(() => {
    // Storage full or blocked: the queue still lives in memory for this session.
  });
}

function forgetItem(id: string): void {
  if (!idb) return;
  del(KEY_PREFIX + id, idb).catch(() => {});
}

function publish(): void {
  useSync.setState({ pending: queue.length, syncing: flushing && queue.length > 0 });
}

function sortQueue(): void {
  queue.sort((a, b) => (a.seq ?? a.at) - (b.seq ?? b.at));
}

/** Rows an operation touches, used to hold back Realtime echoes and refetches while it is pending. */
export function opRowKeys(op: Op): string[] {
  switch (op.kind) {
    case "insert":
      return typeof op.row.id === "string" ? [`${op.table}:${op.row.id}`] : [];
    case "update":
    case "delete":
      return [`${op.table}:${op.id}`];
    case "log":
      return [`sp_routine_logs:${op.routine_id}:${op.date}`];
    case "update_singleton":
      return [op.table];
    case "timer":
      return ["sp_focus_state"];
    case "rpc":
      return op.rowKeys ?? [];
  }
}

/** The single row an operation belongs to, when it has exactly one. */
export function opRowKey(op: Op): string | null {
  const keys = opRowKeys(op);
  return keys.length === 1 ? (keys[0] ?? null) : null;
}

export function hasPending(rowKey: string): boolean {
  return queue.some((q) => opRowKeys(q.op).includes(rowKey));
}

/** True while any queued operation touches this table. */
export function hasPendingFor(table: string): boolean {
  const prefix = `${table}:`;
  return queue.some((q) => opRowKeys(q.op).some((k) => k === table || k.startsWith(prefix)));
}

export function pendingOps(): readonly QueuedOp[] {
  return queue;
}

export function configureOutbox(next: OutboxHandlers): void {
  handlers = next;
}

/** Reads the shared store and adds anything this tab does not know yet (other tabs, earlier sessions). */
async function mergeFromStore(): Promise<void> {
  if (!idb) return;
  try {
    const all = await entries<string, QueuedOp | QueuedOp[]>(idb);
    const known = new Set(queue.map((q) => q.id));
    const migrated: [string, QueuedOp][] = [];
    for (const [key, value] of all) {
      if (key === LEGACY_KEY && Array.isArray(value)) {
        // One-array format of earlier versions.
        value.forEach((item, i) => {
          if (!item || known.has(item.id) || settledIds.has(item.id)) return;
          const next = { ...item, seq: item.seq ?? item.at * 1000 + i };
          queue.push(next);
          known.add(next.id);
          migrated.push([KEY_PREFIX + next.id, next]);
        });
        continue;
      }
      if (typeof key !== "string" || !key.startsWith(KEY_PREFIX) || Array.isArray(value)) continue;
      if (!value || known.has(value.id) || settledIds.has(value.id)) continue;
      queue.push(value);
      known.add(value.id);
    }
    if (migrated.length) {
      await setMany(migrated, idb);
      await del(LEGACY_KEY, idb);
    }
    sortQueue();
  } catch {
    // unreadable store: carry on with what is in memory
  }
}

/** Loads operations left over from a previous session. */
export function loadOutbox(): Promise<void> {
  if (isDemo()) return Promise.resolve();
  if (!loaded) {
    loaded = mergeFromStore().then(publish);
  }
  return loaded;
}

function newId(): string {
  return crypto.randomUUID();
}

export function enqueue(op: Op): QueuedOp {
  const at = serverNow();
  seqCounter = (seqCounter + 1) % 1000;
  const item: QueuedOp = { id: newId(), at, op, seq: at * 1000 + seqCounter };
  // Demo mode: the change has already been applied on screen, and that is all there is to
  // it. Nothing is queued, stored or sent.
  if (isDemo()) return item;
  queue.push(item);
  persistItem(item);
  publish();
  channel?.postMessage({ t: "new" } satisfies Broadcast);
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
  if (res.error) throw new OpError(res.error.message, res.error.code || null, res.status ?? null);
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
  const db = (await getSupabase()) as unknown as Untyped;
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
      // Our own earlier operation on the row has already passed that test (`chained`).
      if (waited && !item.chained) q = q.lte("updated_at", new Date(item.at).toISOString());
      const row = unwrap(await q.select().maybeSingle());
      // No row: it changed elsewhere after this edit was made, or it no longer exists.
      return row ?? CONFLICT;
    }
    case "update_singleton": {
      const { userId } = await getSession();
      return unwrap(
        await db.from(op.table).update(op.patch).eq("user_id", userId).select().maybeSingle(),
      );
    }
    case "delete":
      return unwrap(await db.from(op.table).delete().eq("id", op.id));
    case "log": {
      const row = unwrap(
        await db.rpc("sp_routine_log_set", {
          p_routine_id: op.routine_id,
          p_date: op.date,
          p_completed: op.completed,
          p_amount: op.amount,
        }),
      );
      // No row: the routine was deleted on another device.
      return missingRow(row) ? CONFLICT : row;
    }
    case "timer":
      return unwrap(
        await db.rpc("sp_timer_action", {
          p_action: op.action,
          p_expected_version: op.expectedVersion,
        }),
      );
    case "rpc": {
      if (!op.opIdArg) return unwrap(await db.rpc(op.fn, op.args));
      const res = await db.rpc(op.fn, { ...op.args, [op.opIdArg]: item.id });
      // A database that has not run the migration yet only knows the form without an operation id.
      if (res.error?.code === "PGRST202") return unwrap(await db.rpc(op.fn, op.args));
      const row = unwrap(res);
      return missingRow(row) ? CONFLICT : row;
    }
  }
}

type Failure = "network" | "server" | "auth" | "gone" | "rejected";

/** Sorts a failure into: try again later, sign in again, the row is gone, or refused for good. */
export function classifyFailure(err: unknown): Failure {
  const e = (err ?? {}) as {
    code?: string | null;
    status?: number | null;
    message?: string;
    name?: string;
  };
  const message = e.message ?? "";
  const code = e.code || null;
  const status = typeof e.status === "number" ? e.status : null;
  if (status === 401 || code === "PGRST301" || code === "PGRST303" || /jwt expired/i.test(message))
    return "auth";
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "network";
  if (
    e.name === "AbortError" ||
    e.name === "TimeoutError" ||
    e.name === "TypeError" ||
    /failed to fetch|networkerror|load failed|network request failed|fetch failed|timed? ?out|aborted/i.test(
      message,
    )
  )
    return "network";
  if (code === "P0002" || code === "PGRST116") return "gone";
  if (status === 0 || status === 408 || status === 425 || status === 429) return "network";
  if (status === 502 || status === 503 || status === 504) return "network";
  if (status !== null && status >= 500) {
    // A Postgres error code means the statement itself failed; only connection-level
    // codes (PostgREST's PGRST000–003, classes 08, 53, 57) are worth another attempt.
    if (code && !/^(PGRST00[0-3]|08|53|57)/.test(code)) return "rejected";
    return "server";
  }
  return "rejected";
}

function scheduleRetry(delay?: number): void {
  if (retryTimer) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void flush();
  }, delay ?? retryDelay);
  if (delay === undefined) retryDelay = Math.min(retryDelay * 2, 30_000);
}

function safely(fn: () => void): void {
  try {
    fn();
  } catch (err) {
    // A handler must never be able to disturb the queue.
    console.warn("[sync] handler failed", err);
  }
}

function dispatch(
  item: QueuedOp,
  outcome: "ok" | "conflict" | "error",
  result: unknown,
  error: unknown,
): void {
  if (outcome === "ok") safely(() => handlers.onSuccess(item, result));
  else if (outcome === "conflict")
    safely(() =>
      handlers.onConflict ? handlers.onConflict(item) : handlers.onSuccess(item, null),
    );
  else safely(() => handlers.onError(item, error));
}

/** Removes a finished operation everywhere and tells every tab how it went. */
function settle(
  item: QueuedOp,
  outcome: "ok" | "conflict" | "error",
  result: unknown = null,
  error: unknown = null,
): void {
  queue = queue.filter((q) => q.id !== item.id);
  settledIds.add(item.id);
  forgetItem(item.id);
  if (outcome === "ok" && (item.op.kind === "insert" || item.op.kind === "update")) {
    // Our write moved the row's updated_at; what we queued behind it is still our newest intent.
    const keys = opRowKeys(item.op);
    for (const later of queue) {
      if (!later.chained && opRowKeys(later.op).some((k) => keys.includes(k))) {
        later.chained = true;
        persistItem(later);
      }
    }
  }
  const e = error as { message?: string; code?: string | null; status?: number | null } | null;
  channel?.postMessage({
    t: "done",
    item,
    outcome,
    result: outcome === "ok" ? result : undefined,
    error: e
      ? { message: e.message ?? "", code: e.code ?? null, status: e.status ?? null }
      : undefined,
  } satisfies Broadcast);
  dispatch(item, outcome, result, error);
}

/** Sends everything queued, oldest first. Runs in one tab at a time. */
async function run(): Promise<void> {
  await loadOutbox();
  await mergeFromStore();
  if (queue.length === 0) return;
  publish();
  // Nothing can be sent before the session is known (first paint, or offline at launch).
  try {
    await getSession();
  } catch {
    scheduleRetry();
    return;
  }
  let authRetried = false;
  for (;;) {
    if (queue.length === 0) {
      // Another tab may have queued something while this one held the lock.
      await mergeFromStore();
      if (queue.length === 0) return;
    }
    const item = queue[0] as QueuedOp;
    try {
      const result = await execute(item);
      retryDelay = 2000;
      authRetried = false;
      if (!useSync.getState().online) useSync.setState({ online: true });
      recordSync(result === CONFLICT ? "conflict" : "ok");
      if (result === CONFLICT) settle(item, "conflict");
      else settle(item, "ok", result);
    } catch (err) {
      const failure = classifyFailure(err);
      if (failure === "network") {
        useSync.setState({ online: false });
        scheduleRetry();
        return;
      }
      if (failure === "auth") {
        // Never drop a change over a session problem: refresh once, then wait.
        if (authRetried) {
          scheduleRetry();
          return;
        }
        authRetried = true;
        try {
          await getSession(true);
          continue;
        } catch {
          scheduleRetry();
          return;
        }
      }
      if (failure === "server") {
        item.tries = (item.tries ?? 0) + 1;
        if (item.tries < MAX_SERVER_TRIES) {
          persistItem(item);
          scheduleRetry();
          return;
        }
      }
      recordSync(failure === "gone" ? "conflict" : "rejected");
      if (failure === "gone") settle(item, "conflict");
      // The server refused this change for good: drop it and let the caller roll back.
      else settle(item, "error", null, err);
    }
    publish();
  }
}

interface LockManagerLike {
  request<T>(
    name: string,
    options: { ifAvailable: boolean },
    callback: (lock: unknown) => Promise<T>,
  ): Promise<T>;
}

/** Sends queued operations in order. Stops at the first failure that can heal and retries later. */
export async function flush(): Promise<void> {
  if (isDemo()) return;
  // Claim the flush synchronously: a second caller must not start while this one is still loading.
  if (flushing) return;
  flushing = true;
  try {
    const locks =
      typeof navigator === "undefined"
        ? undefined
        : (navigator as Navigator & { locks?: LockManagerLike }).locks;
    if (locks?.request) {
      const mine = await locks.request(LOCK_NAME, { ifAvailable: true }, async (lock) => {
        if (!lock) return false;
        await run();
        return true;
      });
      // Another tab is sending; it will take our operations too. Check back in case it closes.
      if (!mine && queue.length > 0) scheduleRetry(BUSY_RETRY_MS);
    } else {
      await run();
    }
  } finally {
    flushing = false;
    publish();
    // Anything queued while this flush was finishing gets its own pass.
    if (queue.length > 0 && !retryTimer) setTimeout(() => void flush(), 0);
  }
}

if (channel) {
  channel.onmessage = (event: MessageEvent<Broadcast>) => {
    const msg = event.data;
    if (msg.t === "new") {
      // Only the tab that is sending needs to pick it up now; others learn of it when it is done.
      void flush();
      return;
    }
    if (settledIds.has(msg.item.id)) return;
    settledIds.add(msg.item.id);
    const mine = queue.some((q) => q.id === msg.item.id);
    queue = queue.filter((q) => q.id !== msg.item.id);
    publish();
    // Every tab shares the cache shape, so each applies the outcome to its own copy.
    if (mine || msg.outcome === "ok") dispatch(msg.item, msg.outcome, msg.result, msg.error);
  };
}

/** Wires connectivity events. Call once on app start. */
export function startOutbox(): () => void {
  if (isDemo()) return () => {};
  const onOnline = () => {
    useSync.setState({ online: true });
    retryDelay = 2000;
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
    void flush();
  };
  const onOffline = () => useSync.setState({ online: false });
  const onVisible = () => {
    if (document.visibilityState === "visible") void flush();
  };
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  document.addEventListener("visibilitychange", onVisible);
  if (navigator.onLine === false) onOffline();
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
  settledIds.clear();
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  retryDelay = 2000;
  publish();
}
