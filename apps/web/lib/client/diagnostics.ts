/**
 * Read-only counters about the connection to Supabase, for Settings → Connection.
 *
 * Plain module state, written from the three places traffic passes through (the fetch
 * wrapper, the Realtime channel, the sync queue). Recording is a few assignments per
 * request and never touches React; the dashboard reads a snapshot once a second, and only
 * while it is on screen.
 */

export interface RequestRecord {
  at: number;
  method: string;
  /** Path without host or query values, e.g. `/rest/v1/sp_tasks`. */
  path: string;
  /** HTTP status, or 0 when the request never got an answer. */
  status: number;
  ms: number;
  sent: number;
  received: number;
  error?: string;
}

const RECENT = 40;
const ERRORS = 12;

const state = {
  since: Date.now(),
  requests: 0,
  failed: 0,
  bytesSent: 0,
  bytesReceived: 0,
  recent: [] as RequestRecord[],
  errors: [] as RequestRecord[],
  realtime: {
    events: 0,
    lastEventAt: 0,
    lastTable: "",
    connects: 0,
    drops: 0,
    connectedAt: 0,
    byTable: {} as Record<string, number>,
  },
  sync: { sent: 0, lastSentAt: 0, conflicts: 0, rejected: 0 },
};

function pathOf(input: RequestInfo | URL): string {
  try {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    );
    return url.pathname;
  } catch {
    return "?";
  }
}

function push<T>(list: T[], item: T, max: number): void {
  list.push(item);
  if (list.length > max) list.splice(0, list.length - max);
}

/** Wraps one request to Supabase: counts it, times it, and remembers how it ended. */
export function recordRequest(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  run: () => Promise<Response>,
): Promise<Response> {
  const started = performance.now();
  const base = {
    at: Date.now(),
    method: (init?.method ?? "GET").toUpperCase(),
    path: pathOf(input),
    sent: typeof init?.body === "string" ? init.body.length : 0,
  };
  const done = (status: number, received: number, error?: string) => {
    const record: RequestRecord = {
      ...base,
      status,
      received,
      ms: Math.round(performance.now() - started),
      ...(error ? { error } : {}),
    };
    state.requests += 1;
    state.bytesSent += record.sent;
    state.bytesReceived += received;
    push(state.recent, record, RECENT);
    if (status === 0 || status >= 400) {
      state.failed += 1;
      push(state.errors, record, ERRORS);
    }
  };
  return run().then(
    (res) => {
      done(
        res.status,
        Number(res.headers.get("content-length")) || 0,
        res.ok ? undefined : res.statusText,
      );
      return res;
    },
    (err: unknown) => {
      done(0, 0, err instanceof Error ? err.message : String(err));
      throw err;
    },
  );
}

export function recordRealtimeEvent(table: string): void {
  const r = state.realtime;
  r.events += 1;
  r.lastEventAt = Date.now();
  r.lastTable = table;
  r.byTable[table] = (r.byTable[table] ?? 0) + 1;
}

export function recordRealtimeStatus(connected: boolean): void {
  const r = state.realtime;
  if (connected) {
    r.connects += 1;
    r.connectedAt = Date.now();
  } else if (r.connectedAt) {
    r.drops += 1;
    r.connectedAt = 0;
  }
}

export function recordSync(outcome: "ok" | "conflict" | "rejected"): void {
  if (outcome === "ok") {
    state.sync.sent += 1;
    state.sync.lastSentAt = Date.now();
  } else if (outcome === "conflict") state.sync.conflicts += 1;
  else state.sync.rejected += 1;
}

export type Diagnostics = typeof state;

/** A copy safe to render from. */
export function diagnostics(): Diagnostics {
  return {
    ...state,
    recent: [...state.recent],
    errors: [...state.errors],
    realtime: { ...state.realtime, byTable: { ...state.realtime.byTable } },
    sync: { ...state.sync },
  };
}
