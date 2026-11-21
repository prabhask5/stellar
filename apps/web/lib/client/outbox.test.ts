import { beforeEach, describe, expect, it, vi } from "vitest";

interface Call {
  table?: string;
  method: string;
  args: unknown[];
  filters: [string, string, unknown][];
}

const calls: Call[] = [];
let failNext: { message: string; code?: string; status?: number } | null = null;
let now = 1_000_000;

function builder(table: string) {
  const call: Call = { table, method: "", args: [], filters: [] };
  const finish = () => {
    calls.push(call);
    if (failNext) {
      const error = failNext;
      failNext = null;
      return Promise.resolve({ data: null, error, status: error.status ?? 400 });
    }
    return Promise.resolve({
      data: {
        id:
          (call.args[0] as { id?: string })?.id ??
          call.filters.find((f) => f[1] === "id")?.[2] ??
          "x",
        from: table,
      },
      error: null,
      status: 200,
    });
  };
  const chain = {
    upsert: (row: unknown, opts: unknown) => (
      (call.method = "upsert"),
      (call.args = [row, opts]),
      chain
    ),
    update: (patch: unknown) => ((call.method = "update"), (call.args = [patch]), chain),
    delete: () => ((call.method = "delete"), chain),
    eq: (c: string, v: unknown) => (call.filters.push(["eq", c, v]), chain),
    lte: (c: string, v: unknown) => (call.filters.push(["lte", c, v]), chain),
    select: () => chain,
    maybeSingle: () => finish(),
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      finish().then(resolve, reject),
  };
  return chain;
}

vi.mock("./supabase", () => ({
  getSupabase: () => ({
    from: (table: string) => builder(table),
    rpc: (fn: string, args: unknown) => {
      calls.push({ method: `rpc:${fn}`, args: [args], filters: [] });
      if (failNext) {
        const error = failNext;
        failNext = null;
        return Promise.resolve({ data: null, error, status: error.status ?? 400 });
      }
      return Promise.resolve({ data: { ok: true }, error: null, status: 200 });
    },
  }),
  isNetworkError: (err: unknown) => /failed to fetch/i.test((err as Error)?.message ?? ""),
  describeError: (err: unknown) => (err as Error).message,
}));

vi.mock("./session", () => ({
  getSession: () => Promise.resolve({ userId: "user-1", accessToken: "t" }),
  serverNow: () => now,
}));

const { configureOutbox, enqueue, flush, hasPending, opRowKey, pendingOps, resetOutbox } =
  await import("./outbox");
const { useSync } = await import("./sync-store");

const settled: string[] = [];
const rejected: string[] = [];

async function drain(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    await flush();
    await new Promise((r) => setTimeout(r, 0));
    if (pendingOps().length === 0 && !useSync.getState().syncing) return;
  }
}

beforeEach(() => {
  resetOutbox();
  calls.length = 0;
  settled.length = 0;
  rejected.length = 0;
  failNext = null;
  now = 1_000_000;
  configureOutbox({
    onSuccess: (item) => settled.push(item.op.kind),
    onError: (item) => rejected.push(item.op.kind),
  });
});

describe("outbox", () => {
  it("sends operations strictly in the order they were made", async () => {
    enqueue({ kind: "insert", table: "sp_tasks", row: { id: "a", name: "A" } });
    enqueue({ kind: "update", table: "sp_tasks", id: "a", patch: { completed: true } });
    enqueue({ kind: "delete", table: "sp_tasks", id: "a" });
    enqueue({ kind: "timer", action: "start", expectedVersion: 3 });
    await drain();
    expect(calls.map((c) => c.method)).toEqual([
      "upsert",
      "update",
      "delete",
      "rpc:sp_timer_action",
    ]);
    expect(settled).toEqual(["insert", "update", "delete", "timer"]);
    expect(pendingOps()).toHaveLength(0);
    expect(useSync.getState().pending).toBe(0);
  });

  it("makes creates idempotent with client-generated ids", async () => {
    enqueue({ kind: "insert", table: "sp_tasks", row: { id: "client-uuid", name: "A" } });
    await drain();
    expect(calls[0]).toMatchObject({
      table: "sp_tasks",
      method: "upsert",
      args: [
        { id: "client-uuid", name: "A" },
        { onConflict: "id", ignoreDuplicates: true },
      ],
    });
  });

  it("guards an update that waited offline with updated_at, but not a fresh one", async () => {
    enqueue({ kind: "update", table: "sp_tasks", id: "a", patch: { name: "now" } });
    await drain();
    expect(calls[0]?.filters).toEqual([["eq", "id", "a"]]);

    calls.length = 0;
    failNext = { message: "TypeError: Failed to fetch" };
    enqueue({ kind: "update", table: "sp_tasks", id: "a", patch: { name: "made offline" } });
    await vi.waitFor(() => expect(useSync.getState().online).toBe(false));
    expect(pendingOps()).toHaveLength(1);
    // Twenty seconds later the connection is back.
    now += 20_000;
    await drain();
    const replay = calls[calls.length - 1];
    expect(replay?.filters[0]).toEqual(["eq", "id", "a"]);
    expect(replay?.filters[1]?.[0]).toBe("lte");
    expect(replay?.filters[1]?.[1]).toBe("updated_at");
    expect(replay?.filters[1]?.[2]).toBe(new Date(1_000_000).toISOString());
    expect(useSync.getState().online).toBe(true);
  });

  it("keeps everything queued, in order, while the network is down", async () => {
    failNext = { message: "Failed to fetch" };
    enqueue({ kind: "insert", table: "sp_tasks", row: { id: "a" } });
    enqueue({ kind: "insert", table: "sp_tasks", row: { id: "b" } });
    await vi.waitFor(() => expect(useSync.getState().online).toBe(false));
    expect(pendingOps().map((q) => (q.op.kind === "insert" ? q.op.row.id : null))).toEqual([
      "a",
      "b",
    ]);
    expect(hasPending("sp_tasks:a")).toBe(true);
    expect(useSync.getState().pending).toBe(2);
    await drain();
    expect(
      calls.filter((c) => c.method === "upsert").map((c) => (c.args[0] as { id: string }).id),
    ).toEqual(["a", "a", "b"]);
    expect(hasPending("sp_tasks:a")).toBe(false);
  });

  it("drops an operation the server refuses and reports it, then carries on", async () => {
    failNext = { message: "new row violates check constraint", code: "23514", status: 400 };
    enqueue({ kind: "insert", table: "sp_tasks", row: { id: "bad" } });
    enqueue({ kind: "insert", table: "sp_tasks", row: { id: "good" } });
    await drain();
    expect(rejected).toEqual(["insert"]);
    expect(settled).toEqual(["insert"]);
    expect(pendingOps()).toHaveLength(0);
  });

  it("routes each kind of operation to the right call", async () => {
    enqueue({ kind: "log", routine_id: "r", date: "2026-11-21", completed: true, amount: null });
    enqueue({ kind: "update_singleton", table: "sp_settings", patch: { timezone: "UTC" } });
    enqueue({ kind: "rpc", fn: "sp_goal_increment", args: { p_goal_id: "g", p_delta: 1 } });
    await drain();
    expect(calls[0]).toMatchObject({
      method: "rpc:sp_routine_log_set",
      args: [{ p_routine_id: "r", p_date: "2026-11-21", p_completed: true, p_amount: null }],
    });
    expect(calls[1]).toMatchObject({
      table: "sp_settings",
      method: "update",
      filters: [["eq", "user_id", "user-1"]],
    });
    expect(calls[2]).toMatchObject({ method: "rpc:sp_goal_increment" });
  });

  it("derives the row a pending operation belongs to", () => {
    expect(opRowKey({ kind: "insert", table: "sp_tasks", row: { id: "a" } })).toBe("sp_tasks:a");
    expect(opRowKey({ kind: "update", table: "sp_goals", id: "g", patch: {} })).toBe("sp_goals:g");
    expect(
      opRowKey({ kind: "log", routine_id: "r", date: "2026-11-21", completed: true, amount: null }),
    ).toBe("sp_routine_logs:r:2026-11-21");
    expect(opRowKey({ kind: "timer", action: "start", expectedVersion: 0 })).toBe("sp_focus_state");
    expect(opRowKey({ kind: "rpc", fn: "x", args: {} })).toBeNull();
  });
});
