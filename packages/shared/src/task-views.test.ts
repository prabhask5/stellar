import { describe, expect, it } from "vitest";
import {
  allView,
  calendarView,
  dueLabel,
  listCounts,
  listView,
  nextDue,
  type TaskLike,
  todayStats,
  todayView,
} from "./task-views.ts";

const today = "2026-11-21";
let n = 0;
const task = (name: string, patch: Partial<TaskLike> = {}): TaskLike => ({
  id: name,
  name,
  due_date: null,
  due_time: null,
  list_id: null,
  completed: false,
  sort_order: ++n,
  ...patch,
});

const tasks: TaskLike[] = [
  task("passport", { due_date: "2026-11-17" }),
  task("dentist", { due_date: "2026-11-20" }),
  task("landlord", { due_date: "2026-11-19" }),
  task("roadmap", { due_date: today, due_time: "10:00:00" }),
  task("review", { due_date: today }),
  task("mom", { due_date: today, due_time: "18:00:00" }),
  task("grocery", { due_date: today, due_time: "13:30:00" }),
  task("tomorrow", { due_date: "2026-11-22" }),
  task("wednesday", { due_date: "2026-11-25" }),
  task("december", { due_date: "2026-12-05" }),
  task("someday"),
  task("milk", { list_id: "groceries" }),
  task("eggs", { list_id: "groceries", completed: true }),
  task("done-today", { due_date: today, completed: true }),
  task("done-earlier", { due_date: "2026-11-10", completed: true }),
  task("deleted", { due_date: today, deleted_at: "2026-11-21T00:00:00Z" }),
];

describe("task views", () => {
  it("Today splits overdue from today, earliest first, untimed last", () => {
    const v = todayView(tasks, today);
    expect(v.overdue.map((t) => t.name)).toEqual(["passport", "landlord", "dentist"]);
    expect(v.today.map((t) => t.name)).toEqual(["roadmap", "grocery", "mom", "review"]);
    expect(v.completed.map((t) => t.name)).toEqual(["done-today"]);
  });

  it("list tasks never appear in Today, All or Calendar", () => {
    const names = [
      ...todayView(tasks, today).overdue,
      ...todayView(tasks, today).today,
      ...allView(tasks, today, true).flatMap((g) => g.tasks),
      ...[...calendarView(tasks, true).values()].flat(),
    ].map((t) => t.name);
    expect(names).not.toContain("milk");
    expect(names).not.toContain("eggs");
    expect(names).not.toContain("deleted");
  });

  it("All groups by date headers with undated tasks last", () => {
    const groups = allView(tasks, today);
    expect(groups.map((g) => g.label)).toEqual([
      "Overdue",
      "Today",
      "Tomorrow",
      "Wednesday",
      "Dec 5",
      "No date",
    ]);
    expect(groups[0]).toMatchObject({ tone: "warning" });
    expect(groups[0]?.tasks.map((t) => t.name)).toEqual(["passport", "landlord", "dentist"]);
    expect(groups.at(-1)?.tasks.map((t) => t.name)).toEqual(["someday"]);
    const withDone = allView(tasks, today, true);
    expect(withDone[0]?.label).toBe("Overdue");
    expect(withDone.map((g) => g.label)).toContain("Nov 10");
    expect(withDone.find((g) => g.label === "Today")?.tasks.map((t) => t.name)).toContain(
      "done-today",
    );
  });

  it("Calendar holds dated non-list tasks by day", () => {
    const cal = calendarView(tasks);
    expect(cal.get(today)?.map((t) => t.name)).toEqual(["roadmap", "grocery", "mom", "review"]);
    expect(cal.has("2026-11-10")).toBe(false);
    expect(
      calendarView(tasks, true)
        .get("2026-11-10")
        ?.map((t) => t.name),
    ).toEqual(["done-earlier"]);
  });

  it("List detail shows only that list, in manual order", () => {
    expect(listView(tasks, "groceries").map((t) => t.name)).toEqual(["milk"]);
    expect(listView(tasks, "groceries", true).map((t) => t.name)).toEqual(["milk", "eggs"]);
    expect(listCounts(tasks).get("groceries")).toBe(1);
  });

  it("labels due dates", () => {
    const byName = (name: string) => tasks.find((t) => t.name === name)!;
    expect(dueLabel(byName("passport"), today)).toEqual({ text: "Nov 17", tone: "warning" });
    expect(dueLabel(byName("passport"), today, "home")).toEqual({
      text: "Overdue",
      tone: "warning",
    });
    expect(dueLabel(byName("roadmap"), today)).toEqual({ text: "10:00 AM", tone: "default" });
    expect(dueLabel(byName("review"), today)).toEqual({ text: "Today", tone: "default" });
    expect(dueLabel(byName("tomorrow"), today)).toEqual({ text: "Tomorrow", tone: "default" });
    expect(dueLabel(byName("tomorrow"), today, "all")).toBeNull();
    expect(dueLabel(byName("someday"), today)).toBeNull();
  });

  it("picks the next due tasks and today's totals", () => {
    expect(nextDue(tasks, today).map((t) => t.name)).toEqual(["passport", "landlord", "dentist"]);
    expect(nextDue([task("later", { due_date: "2026-12-01" })], today).map((t) => t.name)).toEqual([
      "later",
    ]);
    expect(todayStats(tasks, today, new Set(["done-today"]))).toEqual({ done: 1, total: 8 });
  });
});
