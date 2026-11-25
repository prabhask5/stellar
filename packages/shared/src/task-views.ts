/**
 * Task views as pure filters over one task array. "Same task object everywhere;
 * views are just filters." Mirrors SQL `sp_tasks_view`.
 */
import { type DateStr, formatShortDate, formatTime, relativeDayName } from "./dates.ts";

export interface TaskLike {
  id: string;
  name: string;
  due_date: DateStr | null;
  due_time: string | null;
  list_id: string | null;
  completed: boolean;
  completed_at?: string | null;
  sort_order: number | null;
  deleted_at?: string | null;
  created_at?: string;
}

const live = (t: TaskLike) => !t.deleted_at;

/** due_date, due_time NULLS LAST, sort_order. Undated tasks sort after dated ones. */
export function compareByDue(a: TaskLike, b: TaskLike): number {
  if (a.due_date !== b.due_date) {
    if (a.due_date === null) return 1;
    if (b.due_date === null) return -1;
    return a.due_date < b.due_date ? -1 : 1;
  }
  if (a.due_time !== b.due_time) {
    if (a.due_time === null) return 1;
    if (b.due_time === null) return -1;
    return a.due_time < b.due_time ? -1 : 1;
  }
  return (a.sort_order ?? 0) - (b.sort_order ?? 0);
}

export function compareBySortOrder(a: TaskLike, b: TaskLike): number {
  const d = (a.sort_order ?? 0) - (b.sort_order ?? 0);
  if (d !== 0) return d;
  return (a.created_at ?? "") < (b.created_at ?? "") ? -1 : 1;
}

export function isOverdue(task: TaskLike, today: DateStr): boolean {
  return (
    !task.completed && task.list_id === null && task.due_date !== null && task.due_date < today
  );
}

export interface TodayView<T extends TaskLike> {
  overdue: T[];
  today: T[];
  /** Tasks completed today (shown only with "Show completed"). */
  completed: T[];
}

/** Today: non-list tasks due today or earlier that are not completed; split into Overdue and Today. */
export function todayView<T extends TaskLike>(tasks: readonly T[], today: DateStr): TodayView<T> {
  const overdue: T[] = [];
  const due: T[] = [];
  const completed: T[] = [];
  for (const t of tasks) {
    if (!live(t) || t.list_id !== null || t.due_date === null || t.due_date > today) continue;
    if (t.completed) {
      if (t.due_date === today) completed.push(t);
    } else if (t.due_date < today) overdue.push(t);
    else due.push(t);
  }
  return {
    overdue: overdue.sort(compareByDue),
    today: due.sort(compareByDue),
    completed: completed.sort(compareByDue),
  };
}

export interface TaskGroup<T extends TaskLike> {
  key: string;
  label: string;
  tone: "warning" | "default";
  tasks: T[];
}

/**
 * All: every non-list task, earliest due first, undated last, grouped under
 * Overdue, Today, Tomorrow, weekday names, later dates and No date.
 */
export function allView<T extends TaskLike>(
  tasks: readonly T[],
  today: DateStr,
  includeCompleted = false,
): TaskGroup<T>[] {
  const rows = tasks
    .filter((t) => live(t) && t.list_id === null && (includeCompleted || !t.completed))
    .sort(compareByDue);
  const groups: TaskGroup<T>[] = [];
  const push = (key: string, label: string, tone: TaskGroup<T>["tone"], task: T) => {
    // Rows arrive by due date, so open overdue tasks are interleaved with completed ones
    // from the same days: look the group up instead of assuming it is the last one.
    const existing = groups.find((g) => g.key === key);
    if (existing) existing.tasks.push(task);
    else groups.push({ key, label, tone, tasks: [task] });
  };
  for (const t of rows) {
    if (t.due_date === null) push("none", "No date", "default", t);
    else if (t.due_date < today && !t.completed) push("overdue", "Overdue", "warning", t);
    else if (t.due_date < today)
      push(`d:${t.due_date}`, formatShortDate(t.due_date, today), "default", t);
    else push(`d:${t.due_date}`, relativeDayName(t.due_date, today), "default", t);
  }
  // Completed tasks from the past sort before "Overdue" by date; keep Overdue first.
  const overdueIndex = groups.findIndex((g) => g.key === "overdue");
  if (overdueIndex > 0) groups.unshift(...groups.splice(overdueIndex, 1));
  return groups;
}

/** Calendar: non-list tasks with a due date, keyed by date. */
export function calendarView<T extends TaskLike>(
  tasks: readonly T[],
  includeCompleted = false,
): Map<DateStr, T[]> {
  const map = new Map<DateStr, T[]>();
  for (const t of tasks) {
    if (!live(t) || t.list_id !== null || t.due_date === null) continue;
    if (!includeCompleted && t.completed) continue;
    const bucket = map.get(t.due_date);
    if (bucket) bucket.push(t);
    else map.set(t.due_date, [t]);
  }
  for (const bucket of map.values()) bucket.sort(compareByDue);
  return map;
}

/** List detail: tasks in one list, in manual order. */
export function listView<T extends TaskLike>(
  tasks: readonly T[],
  listId: string,
  includeCompleted = false,
): T[] {
  return tasks
    .filter((t) => live(t) && t.list_id === listId && (includeCompleted || !t.completed))
    .sort(compareBySortOrder);
}

/** Open (not completed) task count per list. */
export function listCounts(tasks: readonly TaskLike[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const t of tasks) {
    if (!live(t) || t.list_id === null || t.completed) continue;
    counts.set(t.list_id, (counts.get(t.list_id) ?? 0) + 1);
  }
  return counts;
}

export interface DueLabel {
  text: string;
  tone: "warning" | "default";
}

/**
 * Right-aligned due label for a row. Overdue rows show the date in the warning
 * colour (the section header carries the word "Overdue"); today's rows show the
 * time, or "Today".
 */
export function dueLabel(
  task: TaskLike,
  today: DateStr,
  context: "today" | "all" | "home" = "today",
): DueLabel | null {
  if (task.due_date === null) return null;
  if (isOverdue(task, today)) {
    return {
      text: context === "home" ? "Overdue" : formatShortDate(task.due_date, today),
      tone: "warning",
    };
  }
  if (task.due_date === today)
    return { text: task.due_time ? formatTime(task.due_time) : "Today", tone: "default" };
  const day = context === "all" ? null : relativeDayName(task.due_date, today);
  if (task.due_time)
    return {
      text: day ? `${day}, ${formatTime(task.due_time)}` : formatTime(task.due_time),
      tone: "default",
    };
  return day ? { text: day, tone: "default" } : null;
}

/** The next tasks due (overdue first), for the Universe home card. */
export function nextDue<T extends TaskLike>(tasks: readonly T[], today: DateStr, count = 3): T[] {
  const view = todayView(tasks, today);
  const upcoming = tasks
    .filter(
      (t) =>
        live(t) && t.list_id === null && !t.completed && t.due_date !== null && t.due_date > today,
    )
    .sort(compareByDue);
  return [...view.overdue, ...view.today, ...upcoming].slice(0, count);
}

/** Tasks done / total for today's stat tile: everything due today or overdue, plus what was completed today. */
export function todayStats(
  tasks: readonly TaskLike[],
  today: DateStr,
  completedTodayIds: ReadonlySet<string>,
): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const t of tasks) {
    if (!live(t) || t.list_id !== null) continue;
    const dueNow = t.due_date !== null && t.due_date <= today;
    if (t.completed) {
      if (completedTodayIds.has(t.id)) {
        done++;
        total++;
      }
    } else if (dueNow) total++;
  }
  return { done, total };
}
