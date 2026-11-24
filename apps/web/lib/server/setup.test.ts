import { LATEST_SCHEMA_VERSION } from "@stellar/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// What is stored on disk, and the writes made to it.
let stored: { schemaVerified: boolean; setupCompletedAt: string | null };
const writes: Record<string, unknown>[] = [];

vi.mock("./config", () => ({
  getConfig: () => ({
    supabaseUrl: "http://supabase.test",
    supabaseAnonKey: "anon",
    supabaseServiceRoleKey: "service",
  }),
  readStoredConfig: () => stored,
  updateStoredConfig: (patch: Record<string, unknown>) => {
    writes.push(patch);
    Object.assign(stored, patch);
  },
}));
vi.mock("./lockout", () => ({ clearLockout: () => {} }));
vi.mock("./pin", () => ({ hashPin: async () => "", isValidPin: () => true }));
vi.mock("./supabase", () => ({ adminClient: () => ({}) }));

const { verifySchema } = await import("./setup");

/** PostgREST answering the schema-version query with the given version (null = table missing). */
function answerWith(version: number | null) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (String(url).includes("sp_schema_version")) {
        return version === null
          ? new Response('{"code":"PGRST205"}', { status: 404 })
          : new Response(JSON.stringify([{ version }]), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    }),
  );
}

describe("verifySchema (Settings → Connection → Verify)", () => {
  beforeEach(() => {
    writes.length = 0;
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("P0-003: never takes a finished instance out of service when the check fails", async () => {
    stored = { schemaVerified: true, setupCompletedAt: "2026-11-01T00:00:00Z" };
    // The app was updated and the database is one migration behind.
    answerWith(LATEST_SCHEMA_VERSION - 1);
    const behind = await verifySchema();
    expect(behind.ok).toBe(false);
    expect(behind.message).toContain(`version ${LATEST_SCHEMA_VERSION} is needed`);
    // The tables are briefly not visible at all (schema cache reload, gateway hiccup).
    answerWith(null);
    const missing = verifySchema();
    await vi.advanceTimersByTimeAsync(1500);
    expect((await missing).ok).toBe(false);
    expect(stored.schemaVerified).toBe(true);
    expect(writes).toEqual([]);
  });

  it("still records a failed check during first-run setup, and success afterwards", async () => {
    stored = { schemaVerified: true, setupCompletedAt: null };
    answerWith(LATEST_SCHEMA_VERSION - 1);
    await verifySchema();
    expect(stored.schemaVerified).toBe(false);
    answerWith(LATEST_SCHEMA_VERSION);
    expect((await verifySchema()).ok).toBe(true);
    expect(stored.schemaVerified).toBe(true);
  });
});
