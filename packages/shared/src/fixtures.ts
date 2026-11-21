/**
 * Parity fixtures. The same cases are run against the TypeScript logic
 * (packages/shared tests) and the SQL functions (packages/db tests), with the
 * expected values written out by hand so neither side is the oracle.
 */
import type { RoutineSchedule } from "./recurrence.ts";
import type {
  TimerAction,
  TimerErrorCode,
  TimerPhase,
  TimerSettings,
  TimerStatus,
} from "./timer.ts";

// ── recurrence ──────────────────────────────────────────────────────────────
export interface RecurrenceFixture {
  name: string;
  routine: RoutineSchedule;
  date: string;
  expected: boolean;
}

const daily: RoutineSchedule = {
  start_date: "2026-03-01",
  end_date: null,
  frequency: "daily",
  weekdays: null,
  interval_days: null,
};
const dailyBounded: RoutineSchedule = { ...daily, end_date: "2026-03-10" };
const mwf: RoutineSchedule = {
  start_date: "2026-03-02", // a Monday
  end_date: null,
  frequency: "weekdays",
  weekdays: [1, 3, 5],
  interval_days: null,
};
const weekend: RoutineSchedule = { ...mwf, start_date: "2026-01-01", weekdays: [0, 6] };
const every3: RoutineSchedule = {
  start_date: "2026-03-01",
  end_date: "2026-04-30",
  frequency: "interval",
  weekdays: null,
  interval_days: 3,
};
const every2Leap: RoutineSchedule = {
  ...every3,
  start_date: "2028-02-27",
  end_date: null,
  interval_days: 2,
};

export const RECURRENCE_FIXTURES: RecurrenceFixture[] = [
  { name: "daily on start", routine: daily, date: "2026-03-01", expected: true },
  { name: "daily before start", routine: daily, date: "2026-02-28", expected: false },
  { name: "daily far future", routine: daily, date: "2031-12-31", expected: true },
  { name: "daily on end date", routine: dailyBounded, date: "2026-03-10", expected: true },
  { name: "daily after end date", routine: dailyBounded, date: "2026-03-11", expected: false },
  // US DST starts 2026-03-08 and EU DST 2026-03-29: civil dates must not shift.
  { name: "daily across US spring-forward", routine: daily, date: "2026-03-08", expected: true },
  { name: "daily across EU spring-forward", routine: daily, date: "2026-03-29", expected: true },
  { name: "weekdays Monday", routine: mwf, date: "2026-03-02", expected: true },
  { name: "weekdays Tuesday", routine: mwf, date: "2026-03-03", expected: false },
  { name: "weekdays Wednesday", routine: mwf, date: "2026-03-04", expected: true },
  { name: "weekdays Friday", routine: mwf, date: "2026-03-06", expected: true },
  { name: "weekdays Sunday", routine: mwf, date: "2026-03-08", expected: false },
  { name: "weekdays Monday after DST change", routine: mwf, date: "2026-03-09", expected: true },
  { name: "weekdays before start", routine: mwf, date: "2026-02-27", expected: false },
  { name: "weekend Saturday", routine: weekend, date: "2026-11-07", expected: true },
  { name: "weekend Sunday (fall-back day)", routine: weekend, date: "2026-11-01", expected: true },
  { name: "weekend Monday", routine: weekend, date: "2026-11-02", expected: false },
  { name: "interval day 0", routine: every3, date: "2026-03-01", expected: true },
  { name: "interval day 1", routine: every3, date: "2026-03-02", expected: false },
  { name: "interval day 2", routine: every3, date: "2026-03-03", expected: false },
  { name: "interval day 3", routine: every3, date: "2026-03-04", expected: true },
  { name: "interval across DST (day 9)", routine: every3, date: "2026-03-10", expected: true },
  {
    name: "interval across month end (day 33)",
    routine: every3,
    date: "2026-04-03",
    expected: true,
  },
  { name: "interval day 34", routine: every3, date: "2026-04-04", expected: false },
  {
    name: "interval last valid before end (day 60)",
    routine: every3,
    date: "2026-04-30",
    expected: true,
  },
  { name: "interval after end", routine: every3, date: "2026-05-03", expected: false },
  {
    name: "interval through leap day (day 2)",
    routine: every2Leap,
    date: "2028-02-29",
    expected: true,
  },
  {
    name: "interval after leap day (day 3)",
    routine: every2Leap,
    date: "2028-03-01",
    expected: false,
  },
  {
    name: "interval after leap day (day 4)",
    routine: every2Leap,
    date: "2028-03-02",
    expected: true,
  },
];

// ── streaks ─────────────────────────────────────────────────────────────────
export interface StreakFixture {
  name: string;
  routine: RoutineSchedule;
  completed: string[];
  today: string;
  expected: number;
}

export const STREAK_FIXTURES: StreakFixture[] = [
  { name: "no history", routine: daily, completed: [], today: "2026-03-10", expected: 0 },
  {
    name: "three days ending today",
    routine: daily,
    completed: ["2026-03-08", "2026-03-09", "2026-03-10"],
    today: "2026-03-10",
    expected: 3,
  },
  {
    name: "today not done yet keeps yesterday's streak",
    routine: daily,
    completed: ["2026-03-07", "2026-03-08", "2026-03-09"],
    today: "2026-03-10",
    expected: 3,
  },
  {
    name: "missed yesterday breaks it",
    routine: daily,
    completed: ["2026-03-07", "2026-03-08"],
    today: "2026-03-10",
    expected: 0,
  },
  {
    name: "missed yesterday but done today",
    routine: daily,
    completed: ["2026-03-07", "2026-03-08", "2026-03-10"],
    today: "2026-03-10",
    expected: 1,
  },
  {
    name: "weekday routine skips unscheduled days",
    routine: mwf,
    completed: ["2026-03-02", "2026-03-04", "2026-03-06", "2026-03-09"],
    today: "2026-03-10", // Tuesday, not scheduled
    expected: 4,
  },
  {
    name: "weekday routine broken by a missed Friday",
    routine: mwf,
    completed: ["2026-03-02", "2026-03-04", "2026-03-09"],
    today: "2026-03-10",
    expected: 1,
  },
  {
    name: "interval routine",
    routine: every3,
    completed: ["2026-03-01", "2026-03-04", "2026-03-07"],
    today: "2026-03-09",
    expected: 3,
  },
  {
    name: "ended routine counts back from its end date",
    routine: dailyBounded,
    completed: ["2026-03-09", "2026-03-10"],
    today: "2026-03-20",
    expected: 2,
  },
  {
    name: "streak stops at the start date",
    routine: daily,
    completed: ["2026-03-01", "2026-03-02"],
    today: "2026-03-02",
    expected: 2,
  },
];

// ── timer ───────────────────────────────────────────────────────────────────
export interface TimerStepExpectation {
  ok: boolean;
  error?: TimerErrorCode;
  status: TimerStatus;
  phase: TimerPhase;
  round: number;
  version: number;
  /** Remaining ms: phase_ends_at − now when running, paused_remaining_ms when paused, null otherwise. */
  remaining: number | null;
  blocking: boolean;
  session?: {
    phase: TimerPhase;
    completed: boolean;
    planned_seconds: number;
    actual_seconds: number;
    round: number;
  } | null;
}

export interface TimerStep {
  action: TimerAction;
  /** Seconds after the scenario's start. */
  at: number;
  /** Override the version sent (defaults to the current version). */
  expectedVersion?: number;
  expect: TimerStepExpectation;
}

export interface TimerFixture {
  name: string;
  settings: TimerSettings;
  steps: TimerStep[];
}

const manual: TimerSettings = {
  focus_min: 25,
  short_break_min: 5,
  long_break_min: 15,
  rounds_before_long: 4,
  auto_start_breaks: false,
  auto_start_focus: false,
};
const auto: TimerSettings = { ...manual, auto_start_breaks: true, auto_start_focus: true };
const shortCycle: TimerSettings = {
  ...auto,
  focus_min: 10,
  short_break_min: 2,
  long_break_min: 6,
  rounds_before_long: 2,
};

const MIN = 60;
const ms = (minutes: number, seconds = 0) => (minutes * 60 + seconds) * 1000;

export const TIMER_FIXTURES: TimerFixture[] = [
  {
    name: "start, pause, resume keeps blocking and remaining time",
    settings: manual,
    steps: [
      {
        action: "start",
        at: 0,
        expect: {
          ok: true,
          status: "running",
          phase: "focus",
          round: 1,
          version: 1,
          remaining: ms(25),
          blocking: true,
          session: null,
        },
      },
      {
        action: "pause",
        at: 10 * MIN,
        expect: {
          ok: true,
          status: "paused",
          phase: "focus",
          round: 1,
          version: 2,
          remaining: ms(15),
          blocking: true,
          session: null,
        },
      },
      {
        action: "resume",
        at: 30 * MIN,
        expect: {
          ok: true,
          status: "running",
          phase: "focus",
          round: 1,
          version: 3,
          remaining: ms(15),
          blocking: true,
          session: null,
        },
      },
      {
        action: "advance",
        at: 44 * MIN,
        expect: {
          ok: false,
          error: "not_due",
          status: "running",
          phase: "focus",
          round: 1,
          version: 3,
          remaining: ms(1),
          blocking: true,
        },
      },
      {
        action: "advance",
        at: 45 * MIN,
        expect: {
          ok: true,
          status: "awaiting",
          phase: "short_break",
          round: 1,
          version: 4,
          remaining: null,
          blocking: false,
          session: {
            phase: "focus",
            completed: true,
            planned_seconds: 1500,
            actual_seconds: 1500,
            round: 1,
          },
        },
      },
      {
        action: "start",
        at: 46 * MIN,
        expect: {
          ok: true,
          status: "running",
          phase: "short_break",
          round: 1,
          version: 5,
          remaining: ms(5),
          blocking: false,
          session: null,
        },
      },
      {
        action: "advance",
        at: 51 * MIN + 2,
        expect: {
          ok: true,
          status: "awaiting",
          phase: "focus",
          round: 2,
          version: 6,
          remaining: null,
          blocking: false,
          session: {
            phase: "short_break",
            completed: true,
            planned_seconds: 300,
            actual_seconds: 300,
            round: 1,
          },
        },
      },
    ],
  },
  {
    name: "stale version is rejected and changes nothing",
    settings: manual,
    steps: [
      {
        action: "start",
        at: 0,
        expect: {
          ok: true,
          status: "running",
          phase: "focus",
          round: 1,
          version: 1,
          remaining: ms(25),
          blocking: true,
          session: null,
        },
      },
      {
        action: "pause",
        at: 60,
        expectedVersion: 0,
        expect: {
          ok: false,
          error: "version_conflict",
          status: "running",
          phase: "focus",
          round: 1,
          version: 1,
          remaining: ms(24),
          blocking: true,
        },
      },
      {
        action: "pause",
        at: 60,
        expect: {
          ok: true,
          status: "paused",
          phase: "focus",
          round: 1,
          version: 2,
          remaining: ms(24),
          blocking: true,
          session: null,
        },
      },
      {
        action: "pause",
        at: 61,
        expect: {
          ok: false,
          error: "invalid_transition",
          status: "paused",
          phase: "focus",
          round: 1,
          version: 2,
          remaining: ms(24),
          blocking: true,
        },
      },
      {
        action: "advance",
        at: 62,
        expect: {
          ok: false,
          error: "invalid_transition",
          status: "paused",
          phase: "focus",
          round: 1,
          version: 2,
          remaining: ms(24),
          blocking: true,
        },
      },
    ],
  },
  {
    name: "two devices advance at once: only the first wins",
    settings: auto,
    steps: [
      {
        action: "start",
        at: 0,
        expect: {
          ok: true,
          status: "running",
          phase: "focus",
          round: 1,
          version: 1,
          remaining: ms(25),
          blocking: true,
          session: null,
        },
      },
      {
        action: "advance",
        at: 25 * MIN + 1,
        expectedVersion: 1,
        expect: {
          ok: true,
          status: "running",
          phase: "short_break",
          round: 1,
          version: 2,
          remaining: ms(4, 59),
          blocking: false,
          session: {
            phase: "focus",
            completed: true,
            planned_seconds: 1500,
            actual_seconds: 1500,
            round: 1,
          },
        },
      },
      {
        action: "advance",
        at: 25 * MIN + 1,
        expectedVersion: 1,
        expect: {
          ok: false,
          error: "version_conflict",
          status: "running",
          phase: "short_break",
          round: 1,
          version: 2,
          remaining: ms(4, 59),
          blocking: false,
        },
      },
    ],
  },
  {
    name: "auto-start cycle with long break every 2 rounds, then round resets",
    settings: shortCycle,
    steps: [
      {
        action: "start",
        at: 0,
        expect: {
          ok: true,
          status: "running",
          phase: "focus",
          round: 1,
          version: 1,
          remaining: ms(10),
          blocking: true,
          session: null,
        },
      },
      {
        action: "advance",
        at: 10 * MIN,
        expect: {
          ok: true,
          status: "running",
          phase: "short_break",
          round: 1,
          version: 2,
          remaining: ms(2),
          blocking: false,
          session: {
            phase: "focus",
            completed: true,
            planned_seconds: 600,
            actual_seconds: 600,
            round: 1,
          },
        },
      },
      {
        action: "advance",
        at: 12 * MIN,
        expect: {
          ok: true,
          status: "running",
          phase: "focus",
          round: 2,
          version: 3,
          remaining: ms(10),
          blocking: true,
          session: {
            phase: "short_break",
            completed: true,
            planned_seconds: 120,
            actual_seconds: 120,
            round: 1,
          },
        },
      },
      {
        action: "advance",
        at: 22 * MIN,
        expect: {
          ok: true,
          status: "running",
          phase: "long_break",
          round: 2,
          version: 4,
          remaining: ms(6),
          blocking: false,
          session: {
            phase: "focus",
            completed: true,
            planned_seconds: 600,
            actual_seconds: 600,
            round: 2,
          },
        },
      },
      {
        action: "advance",
        at: 28 * MIN,
        expect: {
          ok: true,
          status: "running",
          phase: "focus",
          round: 1,
          version: 5,
          remaining: ms(10),
          blocking: true,
          session: {
            phase: "long_break",
            completed: true,
            planned_seconds: 360,
            actual_seconds: 360,
            round: 2,
          },
        },
      },
    ],
  },
  {
    name: "late advance starts the next phase from now",
    settings: auto,
    steps: [
      {
        action: "start",
        at: 0,
        expect: {
          ok: true,
          status: "running",
          phase: "focus",
          round: 1,
          version: 1,
          remaining: ms(25),
          blocking: true,
          session: null,
        },
      },
      {
        action: "advance",
        at: 40 * MIN,
        expect: {
          ok: true,
          status: "running",
          phase: "short_break",
          round: 1,
          version: 2,
          remaining: ms(5),
          blocking: false,
          session: {
            phase: "focus",
            completed: true,
            planned_seconds: 1500,
            actual_seconds: 1500,
            round: 1,
          },
        },
      },
    ],
  },
  {
    name: "skip records an abandoned phase; end returns to idle",
    settings: manual,
    steps: [
      {
        action: "skip",
        at: 0,
        expect: {
          ok: false,
          error: "invalid_transition",
          status: "idle",
          phase: "focus",
          round: 1,
          version: 0,
          remaining: null,
          blocking: false,
        },
      },
      {
        action: "end",
        at: 0,
        expect: {
          ok: false,
          error: "invalid_transition",
          status: "idle",
          phase: "focus",
          round: 1,
          version: 0,
          remaining: null,
          blocking: false,
        },
      },
      {
        action: "start",
        at: 0,
        expect: {
          ok: true,
          status: "running",
          phase: "focus",
          round: 1,
          version: 1,
          remaining: ms(25),
          blocking: true,
          session: null,
        },
      },
      {
        action: "skip",
        at: 7 * MIN + 30,
        expect: {
          ok: true,
          status: "awaiting",
          phase: "short_break",
          round: 1,
          version: 2,
          remaining: null,
          blocking: false,
          session: {
            phase: "focus",
            completed: false,
            planned_seconds: 1500,
            actual_seconds: 450,
            round: 1,
          },
        },
      },
      {
        action: "skip",
        at: 8 * MIN,
        expect: {
          ok: true,
          status: "awaiting",
          phase: "focus",
          round: 2,
          version: 3,
          remaining: null,
          blocking: false,
          session: null,
        },
      },
      {
        action: "start",
        at: 9 * MIN,
        expect: {
          ok: true,
          status: "running",
          phase: "focus",
          round: 2,
          version: 4,
          remaining: ms(25),
          blocking: true,
          session: null,
        },
      },
      {
        action: "pause",
        at: 12 * MIN,
        expect: {
          ok: true,
          status: "paused",
          phase: "focus",
          round: 2,
          version: 5,
          remaining: ms(22),
          blocking: true,
          session: null,
        },
      },
      {
        action: "end",
        at: 60 * MIN,
        expect: {
          ok: true,
          status: "idle",
          phase: "focus",
          round: 1,
          version: 6,
          remaining: null,
          blocking: false,
          session: {
            phase: "focus",
            completed: false,
            planned_seconds: 1500,
            actual_seconds: 180,
            round: 2,
          },
        },
      },
      {
        action: "resume",
        at: 61 * MIN,
        expect: {
          ok: false,
          error: "invalid_transition",
          status: "idle",
          phase: "focus",
          round: 1,
          version: 6,
          remaining: null,
          blocking: false,
        },
      },
    ],
  },
  {
    name: "auto-start breaks only: focus waits for Start",
    settings: { ...manual, auto_start_breaks: true },
    steps: [
      {
        action: "start",
        at: 0,
        expect: {
          ok: true,
          status: "running",
          phase: "focus",
          round: 1,
          version: 1,
          remaining: ms(25),
          blocking: true,
          session: null,
        },
      },
      {
        action: "advance",
        at: 25 * MIN,
        expect: {
          ok: true,
          status: "running",
          phase: "short_break",
          round: 1,
          version: 2,
          remaining: ms(5),
          blocking: false,
          session: {
            phase: "focus",
            completed: true,
            planned_seconds: 1500,
            actual_seconds: 1500,
            round: 1,
          },
        },
      },
      {
        action: "pause",
        at: 26 * MIN,
        expect: {
          ok: true,
          status: "paused",
          phase: "short_break",
          round: 1,
          version: 3,
          remaining: ms(4),
          blocking: false,
          session: null,
        },
      },
      {
        action: "resume",
        at: 27 * MIN,
        expect: {
          ok: true,
          status: "running",
          phase: "short_break",
          round: 1,
          version: 4,
          remaining: ms(4),
          blocking: false,
          session: null,
        },
      },
      {
        action: "advance",
        at: 31 * MIN,
        expect: {
          ok: true,
          status: "awaiting",
          phase: "focus",
          round: 2,
          version: 5,
          remaining: null,
          blocking: false,
          session: {
            phase: "short_break",
            completed: true,
            planned_seconds: 300,
            actual_seconds: 300,
            round: 1,
          },
        },
      },
    ],
  },
];

// ── site patterns ───────────────────────────────────────────────────────────
export const SITE_FIXTURES: { input: string; expected: string | null }[] = [
  { input: "youtube.com", expected: "youtube.com" },
  { input: "  YouTube.com  ", expected: "youtube.com" },
  { input: "https://www.youtube.com/watch?v=abc", expected: "youtube.com" },
  { input: "http://news.ycombinator.com:8080/item?id=1", expected: "news.ycombinator.com" },
  { input: "www.reddit.com/r/all", expected: "reddit.com" },
  { input: "*.twitter.com", expected: "twitter.com" },
  { input: "m.facebook.com.", expected: "m.facebook.com" },
  { input: "user:pass@example.org/path", expected: "example.org" },
  { input: "sub.domain.co.uk#frag", expected: "sub.domain.co.uk" },
  { input: "xn--bcher-kva.example", expected: "xn--bcher-kva.example" },
  { input: "", expected: null },
  { input: "   ", expected: null },
  { input: "localhost", expected: null },
  { input: "not a site", expected: null },
  { input: "exa_mple.com", expected: null },
  { input: "-bad.com", expected: null },
  { input: "192.168.1.1", expected: null },
  { input: "https://", expected: null },
  { input: "www.com", expected: null },
];

// ── eras ────────────────────────────────────────────────────────────────────
export const ERA_FIXTURES: { total: number; index: number; name: string }[] = [
  { total: -50, index: 0, name: "Void" },
  { total: 0, index: 0, name: "Void" },
  { total: 99, index: 0, name: "Void" },
  { total: 100, index: 1, name: "First Light" },
  { total: 999, index: 1, name: "First Light" },
  { total: 1000, index: 2, name: "Nebula" },
  { total: 4999, index: 2, name: "Nebula" },
  { total: 5000, index: 3, name: "Star Cluster" },
  { total: 15000, index: 4, name: "Galaxy" },
  { total: 39999, index: 4, name: "Galaxy" },
  { total: 40000, index: 5, name: "Supercluster" },
  { total: 100000, index: 6, name: "Cosmic Web" },
  { total: 2500000, index: 6, name: "Cosmic Web" },
];
