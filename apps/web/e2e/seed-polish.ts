// Dev-only: fills the LOCAL test instance with realistic data for the polish pass
// (docs/polish/POLISH_SPEC.md §1). Run after the setup wizard has created the owner:
//
//   node scripts/seed-polish.mts            # uses DATABASE_URL from dev/supabase/dev.env
//   node scripts/seed-polish.mts --keep     # add to existing data instead of replacing it
//
// It refuses to run against anything that is not a loopback database.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.resolve(here, "../../../packages/db/package.json"));
interface PgClient {
  connect(): Promise<void>;
  query(text: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
  end(): Promise<void>;
}
const pg = require("pg") as { Client: new (config: { connectionString: string }) => PgClient };

function devDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const env = readFileSync(path.resolve(here, "../../../dev/supabase/dev.env"), "utf8");
  const m = /^DATABASE_URL=(.*)$/m.exec(env);
  if (!m?.[1]) throw new Error("DATABASE_URL not found in dev/supabase/dev.env");
  return m[1].trim();
}

/** Deterministic pseudo-random numbers, so every seed produces the same data. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LONG_NAME =
  "Write the long-form retrospective for the autumn launch, covering what shipped, what slipped, what we would do differently next time, and the three follow-ups nobody has picked up yet";
const MULTILINE =
  "Agenda:\n1. Budget review\n2. Hiring plan for Q2\n3. Offsite dates\n\nBring the printed contract and both chargers.";

const TASK_NAMES = [
  "Renew passport",
  "Reply to landlord about lease",
  "Book dentist appointment",
  "Draft Q1 roadmap",
  "Grocery run",
  "Call Mom",
  "Review pull request #142",
  "Plan the weekend",
  "Pay electricity bill",
  "Send invoice to Northwind",
  "Back up the photo library",
  "Order new running shoes 👟",
  "Fix the squeaky door",
  "Water the plants 🌿",
  "Schedule car service",
  "Buy birthday card for Sam 🎂",
  "Update résumé",
  "Clean out the inbox",
  "Return library books",
  "Prepare slides for Thursday",
  "Cancel unused subscriptions",
  "Research standing desks",
  "Mail the tax forms",
  "Pick up dry cleaning",
  "Refill prescription",
  "Write thank-you notes",
  "Tidy the garage",
  "Renew gym membership",
  "Check smoke detector batteries",
  "Book flights for June ✈️",
];

const TASK_LISTS: [string, string][] = [
  ["Groceries", "🛒"],
  ["Reading", "📚"],
  ["Apartment", "🏠"],
  ["Japan trip", "✈️"],
  ["Ideas", "💡"],
  ["Gift ideas", "🎁"],
  ["A list with a deliberately long name to test truncation in cards and headers", "🧪"],
  ["مهام البيت", "🕌"],
];

const BLOCK_LISTS: [string, string, string[]][] = [
  [
    "Social",
    "💬",
    [
      "twitter.com",
      "x.com",
      "facebook.com",
      "instagram.com",
      "tiktok.com",
      "reddit.com",
      "threads.net",
      "linkedin.com",
    ],
  ],
  [
    "Video",
    "📺",
    ["youtube.com", "netflix.com", "twitch.tv", "vimeo.com", "disneyplus.com", "hulu.com"],
  ],
  [
    "News",
    "📰",
    [
      "news.ycombinator.com",
      "nytimes.com",
      "theguardian.com",
      "bbc.co.uk",
      "cnn.com",
      "theverge.com",
    ],
  ],
];

export interface SeedResult {
  owner: string;
  tasks: number;
}

export async function seedPolish(
  opts: { databaseUrl?: string; keep?: boolean } = {},
): Promise<SeedResult> {
  const databaseUrl = opts.databaseUrl ?? devDatabaseUrl();
  const host = new URL(databaseUrl).hostname;
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(host)) {
    throw new Error(`Refusing to seed ${host}: seed-polish only runs against a local database.`);
  }
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  const q = async <T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params: unknown[] = [],
  ): Promise<T[]> => (await client.query(text, params)).rows as T[];
  const rand = rng(20261123);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)] as T;

  try {
    const ownerRow = (
      await q<{ id: string }>("select id from auth.users where email = 'owner@stellar.local'")
    )[0];
    if (!ownerRow) throw new Error("No owner yet. Run the setup wizard (or the e2e helper) first.");
    const owner = ownerRow.id;
    await q("begin");
    if (!opts.keep) {
      for (const t of [
        "sp_tasks",
        "sp_task_lists",
        "sp_goals",
        "sp_goal_lists",
        "sp_routines",
        "sp_block_lists",
        "sp_focus_sessions",
        "sp_tombstones",
      ])
        await q(`delete from public.${t} where user_id = $1`, [owner]);
      await q("delete from public.sp_quotes where user_id = $1 and not is_builtin", [owner]);
    }
    const today = (
      await q<{ d: string }>("select to_char(sp__today($1), 'YYYY-MM-DD') as d", [owner])
    )[0]!.d;
    const day = (offset: number) => `('${today}'::date + ${offset})`;

    // ── Tasks ────────────────────────────────────────────────────────────────
    const task = (
      name: string,
      due: string | null,
      time: string | null,
      description: string | null = null,
    ) =>
      q(
        `insert into public.sp_tasks (user_id, name, description, due_date, due_time)
         values ($1, $2, $3, ${due ?? "null"}, $4)`,
        [owner, name, description, time],
      );
    // 12 overdue
    for (let i = 0; i < 12; i++)
      await task(
        i === 0 ? LONG_NAME : `${TASK_NAMES[i % TASK_NAMES.length]}`,
        day(-(1 + Math.floor(rand() * 9))),
        i % 4 === 0 ? "09:30" : null,
        i === 1 ? MULTILINE : i % 3 === 0 ? "Photos are in the desk drawer" : null,
      );
    // 9 today
    const times = ["08:00", "10:00", "13:30", "18:00", "21:15", null, null, null, null];
    for (let i = 0; i < 9; i++)
      await task(
        i === 6
          ? "🚀🌙✨"
          : i === 7
            ? "اتصل بالمصرف بخصوص القرض"
            : `${TASK_NAMES[(i + 12) % TASK_NAMES.length]}`,
        day(0),
        times[i] ?? null,
        i === 2 ? "Outline three themes, share with Priya" : null,
      );
    // 40 upcoming across the next 30 days
    for (let i = 0; i < 40; i++)
      await task(
        `${pick(TASK_NAMES)}${i % 7 === 0 ? " (follow-up)" : ""}`,
        day(1 + Math.floor(rand() * 30)),
        rand() < 0.3 ? pick(["07:45", "12:00", "15:30", "19:00"]) : null,
        rand() < 0.2 ? "Check the shared doc first" : null,
      );
    // 15 undated
    for (let i = 0; i < 15; i++)
      await task(
        i === 3 ? "Someday: " + LONG_NAME : `Someday: ${pick(TASK_NAMES).toLowerCase()}`,
        null,
        null,
      );

    // 8 task lists, 6 items each (two completed)
    for (const [i, [name, emoji]] of TASK_LISTS.entries()) {
      const list = (
        await q<{ id: string }>(
          "insert into public.sp_task_lists (user_id, name, emoji, sort_order) values ($1, $2, $3, $4) returning id",
          [owner, name, emoji, (i + 1) * 1024],
        )
      )[0]!.id;
      for (let n = 1; n <= 6; n++)
        await q(
          "insert into public.sp_tasks (user_id, name, list_id, completed, description) values ($1, $2, $3, $4, $5)",
          [
            owner,
            n === 6 && i === 0 ? LONG_NAME : `${name.split(" ")[0]} item ${n}`,
            list,
            n <= 2,
            n === 3 ? "A note that explains the item" : null,
          ],
        );
    }

    // Completed history: 150 tasks across the last 90 days (each one is a star).
    for (let i = 0; i < 150; i++) {
      const ago = Math.floor(rand() * rand() * 90);
      await q(
        `insert into public.sp_tasks (user_id, name, due_date, completed, completed_at)
         values ($1, $2, ${day(-ago)}, true, now() - make_interval(days => $3, mins => $4))`,
        [owner, `${pick(TASK_NAMES)}`, ago, Math.floor(rand() * 600)],
      );
    }

    // ── Goals: 6 lists with every state ──────────────────────────────────────
    type G = [
      name: string,
      type: "todo" | "progress",
      current: number,
      total: number | null,
      unit: string | null,
    ];
    const goalLists: [string, string, G[]][] = [
      [
        "Health",
        "💪",
        [
          ["Run a half marathon", "todo", 0, null, null],
          ["Drink more water", "progress", 5, 8, "glasses"],
          ["Workouts this quarter", "progress", 22, 36, "sessions"],
          ["Sleep before midnight", "progress", 0, 30, "nights"],
        ],
      ],
      [
        "Reading",
        "📚",
        [
          ["Read 24 books", "progress", 17, 24, "books"],
          ["Finish Middlemarch", "todo", 1, null, null],
          ["Pages this month", "progress", 412.5, 600, "pages"],
        ],
      ],
      [
        "Finished things",
        "🏁",
        [
          ["Ship the portfolio site", "todo", 1, null, null],
          ["Save the emergency fund", "progress", 10000, 10000, "$"],
          // Over-100% input attempt: stored as entered, shown capped.
          ["Push-up challenge", "progress", 130, 100, "reps"],
        ],
      ],
      [
        "Not started",
        "🌱",
        [
          ["Learn to sail", "todo", 0, null, null],
          ["Meditate", "progress", 0, 100, "sessions"],
        ],
      ],
      [
        "Money with a long list name that has to truncate somewhere sensible on a phone",
        "💰",
        [
          [LONG_NAME, "progress", 1, 3, "drafts"],
          ["Max out retirement contributions", "progress", 0.5, 1, null],
          ["Cancel three subscriptions", "progress", 2, 3, null],
        ],
      ],
      ["Empty list", "🫙", []],
    ];
    for (const [i, [name, emoji, goals]] of goalLists.entries()) {
      const list = (
        await q<{ id: string }>(
          "insert into public.sp_goal_lists (user_id, name, emoji, sort_order) values ($1, $2, $3, $4) returning id",
          [owner, name, emoji, (i + 1) * 1024],
        )
      )[0]!.id;
      for (const [gname, type, current, total, unit] of goals)
        await q(
          `insert into public.sp_goals (user_id, list_id, name, type, current_amount, total_amount, unit, completed)
           values ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [owner, list, gname, type, current, total, unit, type === "todo" && current === 1],
        );
    }

    // ── Routines: every frequency, 90 days of logs with streak breaks ────────
    type R = {
      name: string;
      emoji: string | null;
      type: "todo" | "progress";
      total: number | null;
      unit: string | null;
      frequency: "daily" | "weekdays" | "interval";
      weekdays: number[] | null;
      interval: number | null;
      start: number;
      end: number | null;
      /** Chance a scheduled day was done; `gap` days ago starts a broken stretch. */
      rate: number;
      gap: [number, number] | null;
    };
    const routines: R[] = [
      {
        name: "Morning stretch",
        emoji: "🧘",
        type: "todo",
        total: null,
        unit: null,
        frequency: "daily",
        weekdays: null,
        interval: null,
        start: -90,
        end: null,
        rate: 0.97,
        gap: [40, 37],
      },
      {
        name: "Drink water",
        emoji: "💧",
        type: "progress",
        total: 8,
        unit: "glasses",
        frequency: "daily",
        weekdays: null,
        interval: null,
        start: -90,
        end: null,
        rate: 0.8,
        gap: null,
      },
      {
        name: "Gym",
        emoji: "🏋️",
        type: "todo",
        total: null,
        unit: null,
        frequency: "weekdays",
        weekdays: [1, 3, 5],
        interval: null,
        start: -90,
        end: null,
        rate: 0.85,
        gap: [6, 1],
      },
      {
        name: "Read",
        emoji: "📖",
        type: "progress",
        total: 30,
        unit: "pages",
        frequency: "weekdays",
        weekdays: [0, 2, 4, 6],
        interval: null,
        start: -60,
        end: null,
        rate: 0.7,
        gap: null,
      },
      {
        name: "Deep clean",
        emoji: null,
        type: "todo",
        total: null,
        unit: null,
        frequency: "interval",
        weekdays: null,
        interval: 3,
        start: -89,
        end: null,
        rate: 0.9,
        gap: null,
      },
      {
        name: "Physio exercises (ended)",
        emoji: "🦵",
        type: "progress",
        total: 3,
        unit: "sets",
        frequency: "interval",
        weekdays: null,
        interval: 2,
        start: -80,
        end: -20,
        rate: 0.75,
        gap: null,
      },
    ];
    for (const [i, r] of routines.entries()) {
      const id = (
        await q<{ id: string }>(
          `insert into public.sp_routines (user_id, name, emoji, type, total_amount, unit, start_date, end_date,
                                           frequency, weekdays, interval_days, sort_order)
           values ($1, $2, $3, $4, $5, $6, ${day(r.start)}, ${r.end === null ? "null" : day(r.end)}, $7, $8, $9, $10)
           returning id`,
          [
            owner,
            r.name,
            r.emoji,
            r.type,
            r.total,
            r.unit,
            r.frequency,
            r.weekdays,
            r.interval,
            (i + 1) * 1024,
          ],
        )
      )[0]!.id;
      const scheduled = await q<{ d: string; ago: number }>(
        `select to_char(d, 'YYYY-MM-DD') as d, ('${today}'::date - d::date) as ago
           from generate_series(${day(r.start)}, ${day(r.end ?? 0)}, interval '1 day') d
          where sp_routine_scheduled((select x from public.sp_routines x where x.id = $1), d::date)`,
        [id],
      );
      for (const { d, ago } of scheduled) {
        const inGap = r.gap !== null && ago <= r.gap[0] && ago >= r.gap[1];
        const done = !inGap && rand() < r.rate;
        // Today stays partly open so there is something to tick.
        if (ago === 0 && i % 2 === 0) continue;
        const amount =
          r.type === "progress" ? (done ? r.total! : Math.floor(rand() * r.total!)) : 0;
        if (!done && amount === 0 && rand() < 0.5) continue;
        await q(
          "insert into public.sp_routine_logs (routine_id, date, user_id, completed, amount) values ($1, $2, $3, $4, $5)",
          [id, d, owner, done, amount],
        );
      }
    }

    // ── Focus: 60 days of sessions ───────────────────────────────────────────
    for (let ago = 60; ago >= 0; ago--) {
      if (rand() < 0.18 && ago !== 0) continue; // a day off breaks the streak
      const rounds = 1 + Math.floor(rand() * 5);
      let minute = 9 * 60 + Math.floor(rand() * 90);
      const session = (await q<{ id: string }>("select gen_random_uuid() as id"))[0]!.id;
      for (let r = 1; r <= rounds; r++) {
        const abandoned = rand() < 0.12;
        const focusSeconds = abandoned ? 300 + Math.floor(rand() * 900) : 1500;
        const add = (phase: string, planned: number, actual: number, completed: boolean) =>
          q(
            `insert into public.sp_focus_sessions (user_id, session_id, started_at, ended_at, phase, planned_seconds,
                                                    actual_seconds, completed, round)
             values ($1, $2,
                     (${day(-ago)}::timestamp + make_interval(mins => $3)) at time zone sp__timezone($1),
                     (${day(-ago)}::timestamp + make_interval(mins => $3, secs => $5)) at time zone sp__timezone($1),
                     $4, $6, $5, $7, $8)`,
            [owner, session, minute, phase, actual, planned, completed, r],
          );
        // Today's sessions must already be in the past.
        if (ago === 0 && minute > 0) minute = Math.min(minute, 30 * r);
        await add("focus", 1500, focusSeconds, !abandoned);
        minute += Math.ceil(focusSeconds / 60);
        if (abandoned) break;
        const long = r % 4 === 0;
        await add(long ? "long_break" : "short_break", long ? 900 : 300, long ? 900 : 300, true);
        minute += long ? 15 : 5;
      }
    }
    await q(`delete from public.sp_focus_sessions where user_id = $1 and ended_at > now()`, [
      owner,
    ]);

    // ── Block lists: 3 lists, 20 sites; the first two are active ─────────────
    const blockIds: string[] = [];
    for (const [i, [name, emoji, sites]] of BLOCK_LISTS.entries()) {
      const id = (
        await q<{ id: string }>(
          "insert into public.sp_block_lists (user_id, name, emoji, sort_order) values ($1, $2, $3, $4) returning id",
          [owner, name, emoji, (i + 1) * 1024],
        )
      )[0]!.id;
      blockIds.push(id);
      for (const site of sites)
        await q(
          "insert into public.sp_block_list_sites (user_id, block_list_id, pattern) values ($1, $2, $3)",
          [owner, id, site],
        );
    }
    await q("update public.sp_focus_settings set active_block_list_ids = $2 where user_id = $1", [
      owner,
      blockIds.slice(0, 2),
    ]);

    await q(
      `insert into public.sp_quotes (user_id, text, author, is_builtin) values
         ($1, 'Slow is smooth, and smooth is fast.', 'Me', false),
         ($1, 'A deliberately long personal quote that keeps going well past the point where a card would comfortably hold it, to check wrapping, clamping and the height of the quote card on small phones.', 'Notebook', false)`,
      [owner],
    );

    const tasks = (
      await q<{ n: string }>("select count(*) as n from public.sp_tasks where user_id = $1", [
        owner,
      ])
    )[0]!.n;
    await q("commit");
    return { owner, tasks: Number(tasks) };
  } catch (err) {
    await q("rollback").catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

/** Command-line entry, used by scripts/seed-polish.mts. */
export function runCli(): void {
  seedPolish({ keep: process.argv.includes("--keep") })
    .then((r) => {
      console.info(`Seeded ${r.tasks} tasks for ${r.owner}.`);
    })
    .catch((err: unknown) => {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
