import type {
  CountdownEvent,
  BlockList,
  BlockListSite,
  FocusSession,
  Goal,
  GoalList,
  Quote,
  Routine,
  RoutineLog,
  Settings,
  Task,
  TaskList,
} from "@stellar/db";
import { addDays, type DateStr, todayIn } from "@stellar/shared";
import { type FocusCache, keys, queryClient } from "./cache";

/**
 * The sample data shown in demo mode. Everything is invented and built relative to today,
 * so the demo always looks lived-in. It is written straight into the in-memory cache;
 * nothing is stored and nothing is fetched (see demo.ts).
 */
const USER = "00000000-0000-4000-8000-00000000d3a0";
let n = 0;
const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;

export function seedDemo(): void {
  n = 0;
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const today = todayIn(zone, Date.now());
  const day = (offset: number): DateStr => addDays(today, offset);
  const at = (offset: number, hour = 9) =>
    new Date(
      Date.now() + offset * 86_400_000 - (new Date().getHours() - hour) * 3_600_000,
    ).toISOString();
  const now = new Date().toISOString();
  const base = { user_id: USER, created_at: at(-60), updated_at: now };

  // ── tasks ────────────────────────────────────────────────────────────────
  const lists: TaskList[] = [
    ["Groceries", "🛒"],
    ["Reading list", "📚"],
    ["Trip to Lisbon", "✈️"],
  ].map(([name, emoji], i) => ({
    ...base,
    id: id(),
    name: name!,
    emoji: emoji!,
    sort_order: i + 1,
    deleted_at: null,
  }));
  const task = (name: string, t: Partial<Task>): Task => ({
    ...base,
    id: id(),
    name,
    description: null,
    due_date: null,
    due_time: null,
    list_id: null,
    completed: false,
    completed_at: null,
    sort_order: n,
    deleted_at: null,
    ...t,
  });
  const done = (offset: number) => ({
    completed: true,
    completed_at: at(offset, 18),
    due_date: day(offset),
  });
  const tasks: Task[] = [
    task("Reply to the landlord", { due_date: day(-1) }),
    task("Morning pages", done(0)),
    task("Plan the week", { due_date: today, description: "Three outcomes, not thirty tasks." }),
    task("Call the dentist", { due_date: today, due_time: "15:30:00" }),
    task("Review pull requests", { due_date: today }),
    task("Renew passport", { due_date: day(2) }),
    task("Book flights", { due_date: day(4), description: "Check the Tuesday prices first." }),
    task("Dinner with Sam", { due_date: day(5), due_time: "19:00:00" }),
    task("Quarterly review notes", { due_date: day(9) }),
    ...[
      "Inbox to zero",
      "Run 5 km",
      "Water the plants",
      "Back up the laptop",
      "Send the invoice",
    ].map((name, i) => task(name, done(-1 - i))),
    ...["Oat milk", "Coffee beans", "Lemons", "Olive oil"].map((name, i) =>
      task(name, {
        list_id: lists[0]!.id,
        ...(i === 1 ? { completed: true, completed_at: at(-1) } : {}),
      }),
    ),
    ...["The Overstory", "Piranesi", "How Buildings Learn"].map((name) =>
      task(name, { list_id: lists[1]!.id }),
    ),
    ...["Pack the adapter", "Reserve the tile museum", "Find a pastel de nata class"].map((name) =>
      task(name, { list_id: lists[2]!.id }),
    ),
  ];

  // ── goals ────────────────────────────────────────────────────────────────
  const goalLists: GoalList[] = [
    ["Health", "💪"],
    ["Learning", "🧠"],
  ].map(([name, emoji], i) => ({
    ...base,
    id: id(),
    name: name!,
    emoji: emoji!,
    sort_order: i + 1,
    deleted_at: null,
  }));
  const progressOf = new Map<string, number>();
  const goal = (
    list: number,
    name: string,
    current?: number,
    total?: number,
    unit?: string,
  ): Goal => {
    const progress = total !== undefined;
    const fraction = progress ? Math.min(1, (current ?? 0) / total) : current === 1 ? 1 : 0;
    const goalId = id();
    progressOf.set(goalId, fraction);
    return {
      ...base,
      id: goalId,
      list_id: goalLists[list]!.id,
      name,
      description: null,
      type: progress ? "progress" : "todo",
      current_amount: current ?? 0,
      total_amount: total ?? null,
      unit: unit ?? null,
      completed: progress ? fraction === 1 : current === 1,
      completed_at: null,
      sort_order: n,
      deleted_at: null,
    };
  };
  const goals: Goal[] = [
    goal(0, "Workouts this quarter", 22, 36, "sessions"),
    goal(0, "Run a half marathon", 14, 21, "km"),
    goal(0, "Book a check-up", 1),
    goal(1, "Read 12 books", 7, 12, "books"),
    goal(1, "Finish the Portuguese course", 31, 60, "lessons"),
    goal(1, "Give a talk"),
  ];

  // ── routines, with six weeks of history ─────────────────────────────────
  const routine = (name: string, emoji: string, r: Partial<Routine>): Routine => ({
    ...base,
    id: id(),
    name,
    emoji,
    description: null,
    type: "todo",
    frequency: "daily",
    weekdays: null,
    interval_days: null,
    total_amount: null,
    unit: null,
    start_date: day(-45),
    end_date: null,
    sort_order: n,
    deleted_at: null,
    ...r,
  });
  const routines: Routine[] = [
    routine("Meditate", "🧘", {}),
    routine("Drink water", "💧", { type: "progress", total_amount: 8, unit: "glasses" }),
    routine("Strength training", "🏋️", { frequency: "weekdays", weekdays: [1, 3, 5] }),
    routine("Read", "📖", { type: "progress", total_amount: 20, unit: "pages" }),
  ];
  const logs: RoutineLog[] = [];
  for (let d = -45; d <= 0; d++) {
    routines.forEach((r, i) => {
      const weekday = new Date(`${day(d)}T12:00:00Z`).getUTCDay();
      if (r.frequency === "weekdays" && !r.weekdays?.includes(weekday)) return;
      // A fixed pattern, so the calendar shows full, partial and missed days.
      const score = (d * 7 + i * 13 + 100) % 10;
      if (d === 0 && i > 1) return; // leave something to do today
      if (score < 2) return;
      const total = r.total_amount ?? 0;
      const amount = r.type === "progress" ? (score < 5 ? Math.round(total * 0.6) : total) : 0;
      logs.push({
        user_id: USER,
        routine_id: r.id,
        date: day(d),
        amount,
        completed: r.type === "progress" ? amount >= total : true,
        created_at: at(d),
        updated_at: at(d),
      });
    });
  }

  // ── focus ────────────────────────────────────────────────────────────────
  const blockLists: BlockList[] = [
    { ...base, id: id(), name: "Social", emoji: "📵", sort_order: 1, deleted_at: null },
  ];
  const sites: BlockListSite[] = ["youtube.com", "reddit.com", "x.com", "instagram.com"].map(
    (pattern) => ({
      ...base,
      id: id(),
      block_list_id: blockLists[0]!.id,
      pattern,
    }),
  );
  const minutesByDay = [50, 75, 0, 100, 25, 50, 25];
  const sessions: FocusSession[] = minutesByDay.flatMap((minutes, back) =>
    Array.from({ length: minutes / 25 }, (_, k) => ({
      ...base,
      id: id(),
      session_id: null,
      phase: "focus",
      round: k + 1,
      planned_seconds: 1500,
      actual_seconds: 1500,
      completed: true,
      started_at: at(-back, 9 + k),
      ended_at: at(-back, 9 + k),
    })),
  );
  const focus: FocusCache = {
    state: {
      ...base,
      status: "idle",
      phase: "focus",
      round: 1,
      phase_started_at: null,
      phase_ends_at: null,
      paused_remaining_ms: null,
      phase_total_ms: null,
      session_id: null,
      version: 0,
      last_completed_phase: null,
      last_completed_at: null,
      notified_phase_end_at: null,
    },
    settings: {
      ...base,
      focus_min: 25,
      short_break_min: 5,
      long_break_min: 15,
      rounds_before_long: 4,
      auto_start_breaks: false,
      auto_start_focus: false,
      active_block_list_ids: [blockLists[0]!.id],
    },
  };
  const statDays = Array.from({ length: 30 }, (_, i) => ({
    date: day(i - 29),
    minutes: i >= 23 ? minutesByDay[29 - i]! : [25, 50, 0, 75][i % 4]!,
  }));

  // ── upcoming events ──────────────────────────────────────────────────────
  const events: CountdownEvent[] = [
    ["🏃", "Half marathon", 12, "09:00:00"],
    ["✈️", "Lisbon trip", 47, null],
    ["🎓", "Thesis deadline", 163, "17:00:00"],
    ["🎂", "Thirtieth birthday", 420, null],
  ].map(([emoji, name, inDays, time]) => ({
    ...base,
    id: id(),
    emoji: emoji as string,
    name: name as string,
    date: day(inDays as number),
    time: time as string | null,
  }));

  // ── everything else ──────────────────────────────────────────────────────
  const quotes: Quote[] = [
    ["The days are long, but the years are short.", "Gretchen Rubin"],
    ["What we do every day matters more than what we do once in a while.", ""],
    ["Somewhere, something incredible is waiting to be known.", "Carl Sagan"],
  ].map(([text, author]) => ({
    ...base,
    id: id(),
    text: text!,
    author: author!,
    is_builtin: true,
    user_id: null,
  }));
  const settings: Settings = {
    ...base,
    timezone: zone,
    week_start: 1,
    birthdate: "1994-06-15",
    lifespan_years: 90,
    lock_after_minutes: null,
    quality_tier: "auto",
    show_completed: true,
  };
  const set = queryClient.setQueryData.bind(queryClient);
  set(keys.settings, settings);
  set(keys.focus, focus);
  set(keys.focusStats(30), {
    today,
    today_minutes: minutesByDay[0],
    total_minutes: 4310,
    streak_days: 2,
    days: statDays,
  });
  set(keys.table("sp_task_lists"), lists);
  set(keys.table("sp_tasks"), tasks);
  set(keys.table("sp_goal_lists"), goalLists);
  set(keys.table("sp_goals"), goals);
  set(keys.table("sp_routines"), routines);
  set(keys.table("sp_routine_logs"), logs);
  set(keys.table("sp_block_lists"), blockLists);
  set(keys.table("sp_block_list_sites"), sites);
  set(keys.table("sp_quotes"), quotes);
  set(keys.table("sp_events"), events);
  set(keys.table("sp_focus_sessions"), sessions);
}
