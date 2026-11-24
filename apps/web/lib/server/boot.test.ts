import { beforeEach, describe, expect, it, vi } from "vitest";

let config: { supabaseUrl: string | null; supabaseServiceRoleKey: string | null };
const outcomes: unknown[] = [];
const migrate = vi.fn(async () => {
  const next = outcomes.shift();
  if (next instanceof Error) throw next;
  return next;
});

vi.mock("./config", () => ({ getConfig: () => config, applyPinReset: () => false }));
vi.mock("./setup", () => ({ migrate }));
vi.mock("./scheduler", () => ({ startScheduler: () => {} }));

const { migrateOnBoot } = await import("./boot");
const noWait = () => Promise.resolve();
const ok = (applied: number[], method = "pg-meta") => ({
  ok: true,
  method,
  applied,
  skipped: [],
  schemaVersion: 10,
  latestVersion: 10,
});

describe("migrations on boot (no manual SQL after an update)", () => {
  beforeEach(() => {
    config = { supabaseUrl: "http://supabase.test", supabaseServiceRoleKey: "service" };
    outcomes.length = 0;
    migrate.mockClear();
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("applies pending migrations by whichever automatic route exists", async () => {
    outcomes.push(ok([10]));
    expect(await migrateOnBoot([], noWait)).toBe("applied");
    outcomes.push(ok([], "connection"));
    expect(await migrateOnBoot([], noWait)).toBe("current");
  });

  it("keeps trying while the database is still starting", async () => {
    outcomes.push(
      new Error("connect ECONNREFUSED"),
      { ...ok([]), ok: false, error: "starting up" },
      ok([10]),
    );
    expect(await migrateOnBoot([1, 1, 1], noWait)).toBe("applied");
    expect(migrate).toHaveBeenCalledTimes(3);
  });

  it("gives up quietly after its retries and never throws", async () => {
    outcomes.push(new Error("down"), new Error("down"));
    expect(await migrateOnBoot([1], noWait)).toBe("failed");
  });

  it("does nothing before setup, and says so when no automatic route exists", async () => {
    config = { supabaseUrl: null, supabaseServiceRoleKey: null };
    expect(await migrateOnBoot([], noWait)).toBe("unconfigured");
    expect(migrate).not.toHaveBeenCalled();
    config = { supabaseUrl: "http://supabase.test", supabaseServiceRoleKey: "service" };
    outcomes.push({ ...ok([]), ok: false, method: "manual", error: "none" });
    expect(await migrateOnBoot([1, 1], noWait)).toBe("manual");
    expect(migrate).toHaveBeenCalledTimes(1);
  });
});
