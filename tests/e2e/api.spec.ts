import { randomUUID } from "node:crypto";
import type { APIRequestContext } from "@playwright/test";
import {
  clearLockout,
  ensureConfigured,
  expect,
  PIN,
  sql,
  test,
  uniqueIp,
  wipeData,
} from "./support/helpers";

const V1 = "/api/v1";
let token = "";
let refreshToken = "";

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function client(request: APIRequestContext) {
  const headers = () => ({ Authorization: `Bearer ${token}`, "x-forwarded-for": "10.9.9.9" });
  const call = async (
    method: "get" | "post" | "put" | "patch" | "delete",
    path: string,
    data?: unknown,
  ) => {
    const res = await request[method](`${V1}${path}`, {
      headers: headers(),
      ...(data === undefined ? {} : { data }),
    });
    return { status: res.status(), body: (await res.json().catch(() => null)) as Json };
  };
  return {
    get: (path: string) => call("get", path),
    post: (path: string, data?: unknown) => call("post", path, data ?? {}),
    put: (path: string, data: unknown) => call("put", path, data),
    patch: (path: string, data: unknown) => call("patch", path, data),
    del: (path: string, data?: unknown) => call("delete", path, data),
  };
}

test.describe("REST API v1", () => {
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== "desktop", "the API is exercised once");
  });

  test.beforeAll(async ({ request }) => {
    await ensureConfigured(request);
    await wipeData();
    clearLockout();
    // The same flow an iOS client uses: PIN in, Supabase session out.
    const res = await request.post(`${V1}/auth/pin`, {
      headers: { "x-forwarded-for": uniqueIp() },
      data: { pin: PIN, device: { name: "API test", kind: "ios" } },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.session.access_token).toBeTruthy();
    expect(body.session.user_id).toMatch(/^[0-9a-f-]{36}$/);
    token = body.session.access_token;
    refreshToken = body.session.refresh_token;
  });

  test("rejects callers without a valid session, with the error envelope", async ({ request }) => {
    for (const path of [
      "/tasks",
      "/goals",
      "/routines",
      "/focus/state",
      "/block-lists",
      "/universe/snapshot",
      "/quotes",
      "/settings",
      "/export",
    ]) {
      const res = await request.get(`${V1}${path}`, { headers: { cookie: "" } });
      expect(res.status(), path).toBe(401);
      expect((await res.json()).error.code, path).toBe("unauthorized");
    }
    const forged = await request.get(`${V1}/tasks`, {
      headers: { Authorization: "Bearer not.a.token" },
    });
    expect(forged.status()).toBe(401);
  });

  test("instance discovery and the OpenAPI document are public", async ({ request }) => {
    const instance = await (await request.get(`${V1}/instance`)).json();
    expect(instance).toMatchObject({ name: "Stellar Planner", apiVersion: 1, configured: true });
    const res = await request.get(`${V1}/openapi.json`);
    expect(res.status()).toBe(200);
    const doc = await res.json();
    expect(doc.openapi).toBe("3.1.0");
    expect(Object.keys(doc.paths)).toEqual(
      expect.arrayContaining([
        "/tasks",
        "/focus/actions",
        "/block-lists/{id}/sites",
        "/routines/{id}/logs/{date}",
      ]),
    );
  });

  test("CORS allows extension origins and the app itself, and nobody else", async ({
    request,
    baseURL,
  }) => {
    const ext = await request.fetch(`${V1}/tasks`, {
      method: "OPTIONS",
      headers: { Origin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop" },
    });
    expect(ext.status()).toBe(204);
    expect(ext.headers()["access-control-allow-origin"]).toBe(
      "chrome-extension://abcdefghijklmnopabcdefghijklmnop",
    );
    expect(ext.headers()["access-control-allow-methods"]).toContain("PATCH");
    const moz = await request.get(`${V1}/focus/state`, {
      headers: { Origin: "moz-extension://1234", Authorization: `Bearer ${token}` },
    });
    expect(moz.headers()["access-control-allow-origin"]).toBe("moz-extension://1234");
    const evil = await request.fetch(`${V1}/tasks`, {
      method: "OPTIONS",
      headers: { Origin: "https://evil.example" },
    });
    expect(evil.headers()["access-control-allow-origin"]).toBeUndefined();

    // A write carrying the session cookie from another site is refused,
    // the app's own origin is not, and every response carries the baseline headers.
    const forged = await request.post(`${V1}/auth/unlock`, {
      headers: { Origin: "https://evil.example" },
      data: { pin: "000000" },
    });
    expect(forged.status()).toBe(403);
    expect((await forged.json()).error.code).toBe("forbidden");
    const own = await request.post(`${V1}/auth/unlock`, {
      headers: { Origin: new URL(baseURL!).origin },
      data: { pin: "000000" },
    });
    expect(own.status()).not.toBe(403);
    const page = await request.get("/lock");
    expect(page.headers()["x-frame-options"]).toBe("DENY");
    expect(page.headers()["x-content-type-options"]).toBe("nosniff");
    const big = await request.post(`${V1}/auth/pin`, {
      data: { pin: "0".repeat(1_100_000), device: { name: "x", kind: "ios" } },
    });
    expect(big.status()).toBe(400);
  });

  test("refresh returns a new session", async ({ request }) => {
    const res = await request.post(`${V1}/auth/refresh`, {
      headers: { "x-forwarded-for": uniqueIp() },
      data: { refresh_token: refreshToken },
    });
    expect(res.status()).toBe(200);
    const body = (await res.json()).session;
    expect(body.access_token).toBeTruthy();
    token = body.access_token;
    refreshToken = body.refresh_token;
    const devices = await client(request).get("/devices");
    expect(devices.status).toBe(200);
    expect(devices.body.data.some((d: Json) => d.kind === "ios" && d.name === "API test")).toBe(
      true,
    );
  });

  test("tasks and task lists: create, validate, views, update, reorder, delta sync, delete", async ({
    request,
  }) => {
    const api = client(request);
    const today = (
      await sql<{ d: string }>(`select to_char((now() at time zone 'UTC')::date, 'YYYY-MM-DD') d`)
    )[0]!.d;
    const yesterday = (
      await sql<{ d: string }>(
        `select to_char((now() at time zone 'UTC')::date - 1, 'YYYY-MM-DD') d`,
      )
    )[0]!.d;

    const list = await api.post("/task-lists", { name: "  Groceries ", emoji: "🛒" });
    expect(list.status).toBe(201);
    expect(list.body).toMatchObject({ name: "Groceries", emoji: "🛒" });

    // Idempotent create with a client id.
    const id = randomUUID();
    const first = await api.post("/tasks", {
      id,
      name: "Write report",
      due_date: today,
      due_time: "09:30",
    });
    const again = await api.post("/tasks", { id, name: "Write report (retry)", due_date: today });
    expect(first.status).toBe(201);
    expect(again.status).toBe(201);
    expect(again.body).toMatchObject({ id, name: "Write report" });

    const overdue = await api.post("/tasks", { name: "Overdue thing", due_date: yesterday });
    const inList = await api.post("/tasks", { name: "Milk", list_id: list.body.id });
    expect(inList.status).toBe(201);

    // Validation errors come back as 400 with a readable message.
    const bad = await api.post("/tasks", { name: "Nope", list_id: list.body.id, due_date: today });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatchObject({ code: "bad_request" });
    expect(bad.body.error.message).toContain("can't have a due date");
    expect((await api.post("/tasks", { name: "" })).status).toBe(400);
    expect((await api.post("/tasks", { name: "x", due_date: "2026-02-30" })).status).toBe(400);
    expect((await api.get("/tasks?view=bogus")).status).toBe(400);
    expect((await api.patch(`/tasks/${randomUUID()}`, { name: "ghost" })).status).toBe(404);
    expect((await api.patch("/tasks/not-a-uuid", { name: "ghost" })).status).toBe(400);

    // Views.
    const todayView = await api.get("/tasks?view=today");
    expect(todayView.body.data.map((t: Json) => t.name)).toEqual(["Overdue thing", "Write report"]);
    expect(todayView.body.deleted_ids).toEqual([]);
    expect(Date.parse(todayView.body.server_time)).toBeGreaterThan(0);
    const listView = await api.get(`/tasks?view=list&list_id=${list.body.id}`);
    expect(listView.body.data.map((t: Json) => t.name)).toEqual(["Milk"]);
    const cal = await api.get(`/tasks?view=calendar&from=${today}&to=${today}`);
    expect(cal.body.data.map((t: Json) => t.name)).toEqual(["Write report"]);
    expect((await api.get("/tasks")).body.data).toHaveLength(3);

    // Postpone.
    const moved = await api.post("/tasks/postpone-overdue");
    expect(moved.status).toBe(200);
    expect(moved.body).toEqual({
      count: 1,
      today,
      moved: [{ id: overdue.body.id, due_date: yesterday }],
    });

    // Delta sync: nothing changed since the last server_time, then one update and one delete.
    const mark = (await api.get("/tasks")).body.server_time as string;
    await new Promise((r) => setTimeout(r, 30));
    expect((await api.get(`/tasks?updated_since=${encodeURIComponent(mark)}`)).body).toMatchObject({
      data: [],
      deleted_ids: [],
    });
    const done = await api.patch(`/tasks/${id}`, { completed: true });
    expect(done.body.completed).toBe(true);
    expect(done.body.completed_at).toBeTruthy();
    expect((await api.del(`/tasks/${overdue.body.id}`)).body).toEqual({ ok: true });
    expect((await api.del(`/tasks/${overdue.body.id}`)).status).toBe(404);
    const delta = await api.get(`/tasks?updated_since=${encodeURIComponent(mark)}`);
    expect(delta.body.data.map((t: Json) => t.id)).toEqual([id]);
    expect(delta.body.deleted_ids).toEqual([overdue.body.id]);
    expect((await api.get("/tasks?updated_since=yesterday")).status).toBe(400);

    // Reorder and list maintenance.
    const second = await api.post("/task-lists", { name: "Errands" });
    const reordered = await api.post("/task-lists/reorder", {
      items: [{ id: second.body.id, sort_order: list.body.sort_order - 1 }],
    });
    expect(reordered.status).toBe(200);
    expect((await api.get("/task-lists")).body.data.map((l: Json) => l.name)).toEqual([
      "Errands",
      "Groceries",
    ]);
    expect((await api.patch(`/task-lists/${list.body.id}`, { name: "Food" })).body.name).toBe(
      "Food",
    );
    expect((await api.patch(`/task-lists/${list.body.id}`, {})).status).toBe(400);
    // Deleting a list takes its tasks with it.
    expect((await api.del(`/task-lists/${list.body.id}`)).status).toBe(200);
    expect((await api.get("/tasks")).body.data.some((t: Json) => t.name === "Milk")).toBe(false);
    const listDelta = await api.get(`/task-lists?updated_since=${encodeURIComponent(mark)}`);
    expect(listDelta.body.deleted_ids).toContain(list.body.id);
  });

  test("goals: lists, progress goals, increment", async ({ request }) => {
    const api = client(request);
    const list = await api.post("/goal-lists", { name: "2027" });
    expect(list.status).toBe(201);
    const todo = await api.post("/goals", { list_id: list.body.id, name: "Run a marathon" });
    const books = await api.post("/goals", {
      list_id: list.body.id,
      name: "Read",
      type: "progress",
      total_amount: 12,
      unit: "books",
    });
    expect(todo.body).toMatchObject({ type: "todo", completed: false });
    expect(books.body).toMatchObject({ type: "progress", total_amount: 12, current_amount: 0 });
    expect(
      (await api.post("/goals", { list_id: list.body.id, name: "No total", type: "progress" }))
        .status,
    ).toBe(400);

    expect((await api.post(`/goals/${books.body.id}/increment`, { delta: 5 })).body).toMatchObject({
      current_amount: 5,
      completed: false,
    });
    expect(
      (await api.post(`/goals/${books.body.id}/increment`, { delta: -9 })).body.current_amount,
    ).toBe(0);
    const full = await api.post(`/goals/${books.body.id}/increment`, { delta: 12 });
    expect(full.body).toMatchObject({ current_amount: 12, completed: true });
    expect((await api.post(`/goals/${randomUUID()}/increment`, { delta: 1 })).status).toBe(404);
    expect((await api.post(`/goals/${books.body.id}/increment`, { delta: "lots" })).status).toBe(
      400,
    );

    expect((await api.get(`/goals?list_id=${list.body.id}`)).body.data).toHaveLength(2);
    expect((await api.get(`/goals?list_id=${randomUUID()}`)).body.data).toHaveLength(0);
    expect((await api.patch(`/goals/${todo.body.id}`, { completed: true })).body.completed).toBe(
      true,
    );
    expect((await api.del(`/goals/${todo.body.id}`)).status).toBe(200);
    expect((await api.get("/goals")).body.data).toHaveLength(1);

    // Completing things shows up in the universe.
    const universe = await api.get("/universe/snapshot");
    expect(universe.status).toBe(200);
    expect(universe.body.planets).toHaveLength(1);
    expect(universe.body).not.toHaveProperty("era");
    expect(universe.body).not.toHaveProperty("total");
  });

  test("routines: schedule, per-day instances, logging", async ({ request }) => {
    const api = client(request);
    const today = (
      await sql<{ d: string }>(`select to_char((now() at time zone 'UTC')::date, 'YYYY-MM-DD') d`)
    )[0]!.d;
    const start = (
      await sql<{ d: string }>(
        `select to_char((now() at time zone 'UTC')::date - 2, 'YYYY-MM-DD') d`,
      )
    )[0]!.d;

    const meditate = await api.post("/routines", {
      name: "Meditate",
      emoji: "🧘",
      type: "todo",
      start_date: start,
      frequency: "daily",
    });
    const water = await api.post("/routines", {
      name: "Water",
      type: "progress",
      total_amount: 8,
      unit: "glasses",
      start_date: start,
      frequency: "daily",
    });
    expect(meditate.status).toBe(201);
    expect(water.status).toBe(201);
    expect(
      (
        await api.post("/routines", {
          name: "Bad",
          type: "todo",
          start_date: start,
          frequency: "weekdays",
          weekdays: [],
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await api.post("/routines", {
          name: "Bad",
          type: "todo",
          start_date: today,
          end_date: start,
          frequency: "daily",
        })
      ).status,
    ).toBe(400);

    const log = await api.put(`/routines/${meditate.body.id}/logs/${today}`, { completed: true });
    expect(log.status).toBe(200);
    expect(log.body).toMatchObject({ routine_id: meditate.body.id, date: today, completed: true });
    expect(
      (await api.put(`/routines/${water.body.id}/logs/${today}`, { amount: 4 })).body.amount,
    ).toBe(4);
    expect((await api.put(`/routines/${water.body.id}/logs/${today}`, {})).status).toBe(400);
    expect((await api.put(`/routines/${water.body.id}/logs/tomorrow`, { amount: 1 })).status).toBe(
      400,
    );
    expect(
      (await api.put(`/routines/${randomUUID()}/logs/${today}`, { completed: true })).status,
    ).toBe(404);

    const days = await api.get(`/routines/days?from=${start}&to=${today}`);
    expect(days.status).toBe(200);
    expect(days.body.data).toHaveLength(3);
    const last = days.body.data[2];
    expect(last.date).toBe(today);
    expect(last.instances).toHaveLength(2);
    expect(last.fraction).toBeCloseTo(0.75, 5);
    expect(days.body.streaks[meditate.body.id]).toMatchObject({ streak: 1 });
    expect((await api.get(`/routines/days?from=${today}&to=${start}`)).status).toBe(400);
    expect((await api.get("/routines/days")).status).toBe(400);

    expect(
      (await api.patch(`/routines/${water.body.id}`, { total_amount: 10 })).body.total_amount,
    ).toBe(10);
    expect((await api.del(`/routines/${water.body.id}`)).status).toBe(200);
    expect((await api.get("/routines")).body.data.map((r: Json) => r.name)).toEqual(["Meditate"]);
  });

  test("focus: settings, block lists, versioned timer actions, sessions and stats", async ({
    request,
  }) => {
    const api = client(request);
    const social = await api.post("/block-lists", { name: "Social", emoji: "💬" });
    expect(social.status).toBe(201);
    const added = await api.post(`/block-lists/${social.body.id}/sites`, {
      patterns: ["https://www.YouTube.com/watch?v=1", "reddit.com", "youtube.com"],
    });
    expect(added.status).toBe(200);
    expect(added.body.sites.map((s: Json) => s.pattern)).toEqual(["reddit.com", "youtube.com"]);
    expect(
      (await api.post(`/block-lists/${social.body.id}/sites`, { patterns: ["not a site"] })).status,
    ).toBe(400);
    expect(
      (await api.post(`/block-lists/${randomUUID()}/sites`, { patterns: ["a.com"] })).status,
    ).toBeGreaterThanOrEqual(400);
    const removed = await api.del(`/block-lists/${social.body.id}/sites`, {
      patterns: ["reddit.com"],
    });
    expect(removed.body.sites.map((s: Json) => s.pattern)).toEqual(["youtube.com"]);
    const lists = await api.get("/block-lists");
    expect(lists.body.data).toHaveLength(1);
    expect(lists.body.data[0].sites.map((s: Json) => s.pattern)).toEqual(["youtube.com"]);

    const settings = await api.put("/focus/settings", {
      focus_min: 50,
      active_block_list_ids: [social.body.id],
    });
    expect(settings.body).toMatchObject({
      focus_min: 50,
      short_break_min: 5,
      active_block_list_ids: [social.body.id],
    });
    expect((await api.put("/focus/settings", { focus_min: 0 })).status).toBe(400);
    expect((await api.get("/focus/settings")).body.focus_min).toBe(50);

    const idle = await api.get("/focus/state");
    expect(idle.body.state).toMatchObject({ status: "idle", phase: "focus" });
    expect(idle.body.blocking.active).toBe(false);
    const version = idle.body.state.version as number;

    const started = await api.post("/focus/actions", { action: "start", expectedVersion: version });
    expect(started.status).toBe(200);
    expect(started.body).toMatchObject({ ok: true, error: null });
    expect(started.body.state).toMatchObject({
      status: "running",
      phase: "focus",
      phase_total_ms: 50 * 60_000,
    });
    const running = await api.get("/focus/state");
    expect(running.body.blocking).toMatchObject({ active: true, patterns: ["youtube.com"] });

    // A second device acting on a stale version loses, and is told the current state.
    const stale = await api.post("/focus/actions", { action: "pause", expectedVersion: version });
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({ ok: false, error: "version_conflict" });
    expect(stale.body.state.status).toBe("running");
    expect((await api.post("/focus/actions", { action: "dance", expectedVersion: 1 })).status).toBe(
      400,
    );

    const paused = await api.post("/focus/actions", {
      action: "pause",
      expectedVersion: started.body.state.version,
    });
    expect(paused.body.state.status).toBe("paused");
    expect((await api.get("/focus/state")).body.blocking.active).toBe(true);
    const ended = await api.post("/focus/actions", {
      action: "end",
      expectedVersion: paused.body.state.version,
    });
    expect(ended.body.state.status).toBe("idle");
    expect((await api.get("/focus/state")).body.blocking.active).toBe(false);

    const sessions = await api.get("/focus/sessions");
    expect(sessions.status).toBe(200);
    expect(sessions.body.data.length).toBeGreaterThanOrEqual(1);
    expect(sessions.body.data[0]).toMatchObject({
      phase: "focus",
      completed: false,
      planned_seconds: 3000,
    });
    expect((await api.get("/focus/sessions?from=2099-01-01")).body.data).toHaveLength(0);
    const stats = await api.get("/focus/stats?days=7");
    expect(stats.status).toBe(200);
    expect(stats.body.days).toHaveLength(7);
    expect(stats.body).toHaveProperty("streak_days");

    expect((await api.del(`/block-lists/${social.body.id}`)).status).toBe(200);
    expect((await api.get("/block-lists")).body.data).toHaveLength(0);
  });

  test("events: create, list in date order, update, delete with a tombstone, export", async ({
    request,
  }) => {
    const api = client(request);
    const id = randomUUID();
    const far = await api.post("/events", {
      id,
      name: "  Marathon ",
      emoji: "🏃",
      date: "2031-04-18",
    });
    expect(far.status).toBe(201);
    expect(far.body).toMatchObject({
      id,
      name: "Marathon",
      emoji: "🏃",
      date: "2031-04-18",
      time: null,
    });
    // The same id again is the same event, not a second one.
    expect((await api.post("/events", { id, name: "Marathon", date: "2031-04-18" })).status).toBe(
      201,
    );
    const near = await api.post("/events", { name: "Launch", date: "2030-01-05", time: "9:30" });
    expect(near.body).toMatchObject({ emoji: "📅", time: "09:30:00" });
    expect((await api.post("/events", { name: "No date" })).status).toBe(400);
    expect((await api.post("/events", { name: "", date: "2030-01-01" })).status).toBe(400);
    expect((await api.post("/events", { name: "Bad", date: "2030-02-31" })).status).toBe(400);

    const all = await api.get("/events");
    expect(all.body.data.map((e: Json) => e.name)).toEqual(["Launch", "Marathon"]);
    const mark = all.body.server_time as string;

    const moved = await api.patch(`/events/${near.body.id}`, { date: "2032-06-01", time: null });
    expect(moved.body).toMatchObject({ name: "Launch", date: "2032-06-01", time: null });
    expect((await api.get("/events")).body.data.map((e: Json) => e.name)).toEqual([
      "Marathon",
      "Launch",
    ]);
    expect((await api.patch(`/events/${randomUUID()}`, { name: "x" })).status).toBe(404);

    expect((await api.get("/export")).body.events.map((e: Json) => e.name).sort()).toEqual([
      "Launch",
      "Marathon",
    ]);

    expect((await api.del(`/events/${id}`)).status).toBe(200);
    expect((await api.del(`/events/${id}`)).status).toBe(404);
    const delta = await api.get(`/events?updated_since=${encodeURIComponent(mark)}`);
    expect(delta.body.data.map((e: Json) => e.name)).toEqual(["Launch"]);
    expect(delta.body.deleted_ids).toEqual([id]);
    // Without a session there is nothing to read.
    expect((await request.get(`${V1}/events`)).status()).toBe(401);
  });

  test("quotes, settings and export", async ({ request }) => {
    const api = client(request);
    const random = await api.get("/quotes/random");
    expect(random.status).toBe(200);
    expect(random.body.text.length).toBeGreaterThan(0);

    const mine = await api.post("/quotes", {
      text: "Make it work, then make it beautiful.",
      author: "Me",
    });
    expect(mine.status).toBe(201);
    expect(mine.body).toMatchObject({ is_builtin: false, author: "Me" });
    expect((await api.post("/quotes", { text: "   " })).status).toBe(400);
    const all = await api.get("/quotes");
    expect(all.body.data.some((q: Json) => q.is_builtin)).toBe(true);
    expect(all.body.data.some((q: Json) => q.id === mine.body.id)).toBe(true);
    const builtin = all.body.data.find((q: Json) => q.is_builtin);
    // Built-in quotes are read-only.
    expect((await api.del(`/quotes?id=${builtin.id}`)).status).toBe(404);
    const mark = all.body.server_time as string;
    expect((await api.del(`/quotes?id=${mine.body.id}`)).status).toBe(200);
    expect(
      (await api.get(`/quotes?updated_since=${encodeURIComponent(mark)}`)).body.deleted_ids,
    ).toEqual([mine.body.id]);
    expect((await api.del("/quotes")).status).toBe(400);

    const settings = await api.put("/settings", { timezone: "Europe/Paris", week_start: 0 });
    expect(settings.body).toMatchObject({ timezone: "Europe/Paris", week_start: 0 });
    expect((await api.put("/settings", { timezone: "Mars/Olympus" })).status).toBe(400);
    await api.put("/settings", { timezone: "UTC", week_start: 1 });

    const exported = await api.get("/export");
    expect(exported.status).toBe(200);
    expect(exported.body).toMatchObject({ format: "stellar-planner-export", format_version: 1 });
  });

  test("logout ends the session's refresh token", async ({ request }) => {
    const res = await request.post(`${V1}/auth/logout`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {},
    });
    expect(res.status()).toBe(200);
    const refresh = await request.post(`${V1}/auth/refresh`, {
      headers: { "x-forwarded-for": uniqueIp() },
      data: { refresh_token: refreshToken },
    });
    expect(refresh.status()).toBe(401);
  });
});
