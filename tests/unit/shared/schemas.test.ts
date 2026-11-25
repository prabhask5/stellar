import { describe, expect, it } from "vitest";
import {
  zFocusActionRequest,
  zGoalCreate,
  zPin,
  zPinRequest,
  zRoutineCreate,
  zRoutineUpdate,
  zSettingsUpdate,
  zSitePattern,
  zTaskCreate,
  zTaskUpdate,
} from "@stellar/shared/schemas";

describe("schemas", () => {
  it("accepts 6–12 digit PINs only", () => {
    expect(zPin.safeParse("123456").success).toBe(true);
    expect(zPin.safeParse("123456789012").success).toBe(true);
    expect(zPin.safeParse("12345").success).toBe(false);
    expect(zPin.safeParse("1234567890123").success).toBe(false);
    expect(zPin.safeParse("12a456").success).toBe(false);
    expect(
      zPinRequest.safeParse({ pin: "123456", device: { name: "Mac", kind: "web" } }).success,
    ).toBe(true);
    expect(
      zPinRequest.safeParse({ pin: "123456", device: { name: "Mac", kind: "toaster" } }).success,
    ).toBe(false);
  });

  it("enforces the task date rules", () => {
    expect(
      zTaskCreate.safeParse({ name: " Call Mom ", due_date: "2026-11-21", due_time: "9:05" }),
    ).toMatchObject({
      success: true,
      data: { name: "Call Mom", due_time: "09:05" },
    });
    expect(zTaskCreate.safeParse({ name: "x", due_time: "09:00" }).success).toBe(false);
    expect(
      zTaskCreate.safeParse({
        name: "x",
        list_id: "0b1e7c9e-1111-4222-8333-444455556666",
        due_date: "2026-11-21",
      }).success,
    ).toBe(false);
    expect(zTaskCreate.safeParse({ name: "   " }).success).toBe(false);
    expect(zTaskCreate.safeParse({ name: "x", due_date: "2026-02-30" }).success).toBe(false);
    expect(zTaskUpdate.safeParse({ due_date: null, due_time: "10:00" }).success).toBe(false);
    expect(zTaskUpdate.safeParse({ completed: true }).success).toBe(true);
  });

  it("requires totals for progress goals and complete routine rules", () => {
    const list_id = "0b1e7c9e-1111-4222-8333-444455556666";
    expect(zGoalCreate.safeParse({ list_id, name: "Read", type: "progress" }).success).toBe(false);
    expect(
      zGoalCreate.safeParse({ list_id, name: "Read", type: "progress", total_amount: 20 }).success,
    ).toBe(true);
    expect(zGoalCreate.parse({ list_id, name: "Ship" }).type).toBe("todo");
    const base = { name: "Stretch", type: "todo", start_date: "2026-11-21" } as const;
    expect(zRoutineCreate.safeParse({ ...base, frequency: "daily" }).success).toBe(true);
    expect(zRoutineCreate.safeParse({ ...base, frequency: "weekdays" }).success).toBe(false);
    expect(
      zRoutineCreate.safeParse({ ...base, frequency: "weekdays", weekdays: [1, 3] }).success,
    ).toBe(true);
    expect(
      zRoutineCreate.safeParse({ ...base, frequency: "interval", interval_days: 1 }).success,
    ).toBe(false);
    expect(
      zRoutineCreate.safeParse({ ...base, frequency: "daily", end_date: "2026-11-01" }).success,
    ).toBe(false);
    expect(zRoutineUpdate.safeParse({ name: "Renamed" }).success).toBe(true);
  });

  it("validates settings, timer actions and site patterns", () => {
    expect(zSettingsUpdate.safeParse({ timezone: "Europe/Berlin", week_start: 0 }).success).toBe(
      true,
    );
    expect(zSettingsUpdate.safeParse({ timezone: "Mars/Olympus" }).success).toBe(false);
    expect(zSettingsUpdate.safeParse({ week_start: 3 }).success).toBe(false);
    expect(zFocusActionRequest.safeParse({ action: "start", expectedVersion: 0 }).success).toBe(
      true,
    );
    expect(zFocusActionRequest.safeParse({ action: "explode", expectedVersion: 0 }).success).toBe(
      false,
    );
    expect(zSitePattern.parse("https://www.YouTube.com/feed")).toBe("youtube.com");
    expect(zSitePattern.safeParse("nope").success).toBe(false);
  });
});
