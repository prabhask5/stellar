import type { RoutineLog, Task } from "@stellar/db";
import { beforeEach, describe, expect, it } from "vitest";
import { findRow, getRows, patchRow, queryClient, removeRow, rowId, upsertRow } from "./cache";
import { withLingering } from "./complete";
import { deviceName } from "./device";
import { syncLabel } from "./sync-store";

const task = (id: string, patch: Partial<Task> = {}): Task => ({
  id,
  user_id: "u",
  name: id,
  description: null,
  due_date: null,
  due_time: null,
  list_id: null,
  completed: false,
  completed_at: null,
  sort_order: 1,
  deleted_at: null,
  created_at: "2026-11-21T00:00:00Z",
  updated_at: "2026-11-21T00:00:00Z",
  ...patch,
});

describe("collection cache", () => {
  beforeEach(() => queryClient.clear());

  it("inserts, replaces, patches and removes rows by id", () => {
    upsertRow("sp_tasks", task("a"));
    upsertRow("sp_tasks", task("b"));
    upsertRow("sp_tasks", task("a", { name: "renamed" }));
    expect(getRows("sp_tasks").map((t) => t.name)).toEqual(["renamed", "b"]);
    const before = patchRow("sp_tasks", "b", { completed: true });
    expect(before?.completed).toBe(false);
    expect(findRow("sp_tasks", "b")?.completed).toBe(true);
    expect(patchRow("sp_tasks", "missing", { completed: true })).toBeNull();
    expect(removeRow("sp_tasks", "a")?.name).toBe("renamed");
    expect(getRows("sp_tasks")).toHaveLength(1);
  });

  it("treats a soft-deleted row as removed, and a restored one as present", () => {
    upsertRow("sp_tasks", task("a"));
    upsertRow("sp_tasks", task("a", { deleted_at: "2026-11-21T01:00:00Z" }));
    expect(getRows("sp_tasks")).toEqual([]);
    upsertRow("sp_tasks", task("a", { deleted_at: null }));
    expect(getRows("sp_tasks")).toHaveLength(1);
  });

  it("keys routine logs by routine and date", () => {
    const log = (date: string, completed: boolean): RoutineLog => ({
      routine_id: "r1",
      date,
      user_id: "u",
      completed,
      amount: 0,
      created_at: "",
      updated_at: "",
    });
    upsertRow("sp_routine_logs", log("2026-11-20", false));
    upsertRow("sp_routine_logs", log("2026-11-21", false));
    upsertRow("sp_routine_logs", log("2026-11-21", true));
    expect(getRows("sp_routine_logs")).toHaveLength(2);
    expect(findRow("sp_routine_logs", "r1:2026-11-21")?.completed).toBe(true);
    expect(rowId("sp_routine_logs", { routine_id: "r1", date: "2026-11-20" })).toBe(
      "r1:2026-11-20",
    );
  });
});

describe("lingering completions", () => {
  it("shows a just-completed task as open while it lingers", () => {
    const tasks = [task("a", { completed: true }), task("b", { completed: true }), task("c")];
    const out = withLingering(tasks, new Set(["a"]));
    expect(out.map((t) => t.completed)).toEqual([false, true, false]);
    expect(withLingering(tasks, new Set())).toBe(tasks);
  });
});

describe("sync label", () => {
  const base = {
    online: true,
    pending: 0,
    syncing: false,
    realtime: "connected" as const,
    devices: 3,
  };
  it("describes each state", () => {
    expect(syncLabel(base)).toEqual({ tone: "live", text: "3 devices in sync" });
    expect(syncLabel({ ...base, devices: 1 }).text).toBe("1 device in sync");
    expect(syncLabel({ ...base, pending: 2 })).toEqual({ tone: "busy", text: "Syncing…" });
    expect(syncLabel({ ...base, online: false, pending: 2 })).toEqual({
      tone: "offline",
      text: "Offline, changes saved",
    });
    expect(syncLabel({ ...base, online: false }).text).toBe("Offline");
    expect(syncLabel({ ...base, realtime: "disconnected" }).text).toBe("Reconnecting…");
  });
});

describe("device names", () => {
  it("names the browser and platform", () => {
    expect(
      deviceName(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
      ),
    ).toBe("Safari on iPhone");
    expect(
      deviceName(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36",
      ),
    ).toBe("Chrome on Mac");
    expect(
      deviceName(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0",
      ),
    ).toBe("Firefox on Windows");
    expect(
      deviceName(
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0",
      ),
    ).toBe("Edge on Linux");
  });
});
