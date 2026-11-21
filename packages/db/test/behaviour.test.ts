import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { available, asUser, createUser, dropUser, kinds, open, points } from "./helpers.ts";

describe.skipIf(!available)("database behaviour", () => {
  let db: pg.Client;
  const users: string[] = [];
  const newUser = async (tz = "UTC") => {
    const u = await createUser(db, tz);
    users.push(u);
    return u;
  };
  beforeAll(async () => {
    db = await open();
  });
  afterAll(async () => {
    for (const u of users) await dropUser(db, u);
    await db.end();
  });

  describe("row level security", () => {
    it("hides every row from other users and from anon", async () => {
      const a = await newUser();
      const b = await newUser();
      await asUser(db, a, async (q) => {
        const [list] = await q<{ id: string }>(
          "insert into sp_task_lists (name) values ('Private') returning id",
        );
        await q("insert into sp_tasks (name, list_id) values ('In list', $1)", [list!.id]);
        await q("insert into sp_tasks (name, due_date) values ('Dated', '2026-01-01')");
        const [gl] = await q<{ id: string }>(
          "insert into sp_goal_lists (name) values ('Goals') returning id",
        );
        await q("insert into sp_goals (name, list_id) values ('Goal', $1)", [gl!.id]);
        const [r] = await q<{ id: string }>(
          "insert into sp_routines (name, start_date) values ('Routine', '2026-01-01') returning id",
        );
        await q(
          "insert into sp_routine_logs (routine_id, date, completed) values ($1, '2026-01-02', true)",
          [r!.id],
        );
        const [bl] = await q<{ id: string }>(
          "insert into sp_block_lists (name) values ('Social') returning id",
        );
        await q(
          "insert into sp_block_list_sites (block_list_id, pattern) values ($1, 'example.com')",
          [bl!.id],
        );
        await q("insert into sp_quotes (text, author) values ('Mine', 'Me')");
        await q("select sp_timer_action('start', 0)");
      });
      const tables = [
        "sp_task_lists",
        "sp_tasks",
        "sp_goal_lists",
        "sp_goals",
        "sp_routines",
        "sp_routine_logs",
        "sp_block_lists",
        "sp_block_list_sites",
        "sp_focus_state",
        "sp_focus_settings",
        "sp_focus_sessions",
        "sp_universe_events",
        "sp_settings",
        "sp_devices",
        "sp_auth_events",
        "sp_push_subscriptions",
        "sp_tombstones",
      ];
      await asUser(db, a, async (q) => {
        for (const t of ["sp_tasks", "sp_goals", "sp_routines", "sp_focus_state", "sp_settings"]) {
          const [row] = await q<{ n: number }>(`select count(*)::int as n from ${t}`);
          expect(row!.n, `${t} visible to owner`).toBeGreaterThan(0);
        }
      });
      await asUser(db, b, async (q) => {
        for (const t of tables) {
          const [row] = await q<{ n: number }>(
            `select count(*)::int as n from ${t} where user_id <> $1`,
            [b],
          );
          expect(row!.n, `${t} leaked`).toBe(0);
        }
        const [quotes] = await q<{ n: number }>(
          "select count(*)::int as n from sp_quotes where not is_builtin",
        );
        expect(quotes!.n).toBe(0);
        const upd = await q("update sp_tasks set name = 'hacked' where user_id = $1 returning id", [
          a,
        ]);
        expect(upd).toEqual([]);
      });
      await expect(asUser(db, null, (q) => q("select * from sp_tasks"))).rejects.toThrow(
        /permission denied/,
      );
      await expect(asUser(db, null, (q) => q("select sp_today()"))).rejects.toThrow(
        /permission denied/,
      );
    });

    it("stops users from writing rows for someone else or touching timer state directly", async () => {
      const a = await newUser();
      const b = await newUser();
      await expect(
        asUser(db, a, (q) => q("insert into sp_tasks (name, user_id) values ('x', $1)", [b])),
      ).rejects.toThrow(/row-level security/);
      await expect(
        asUser(db, a, (q) => q("update sp_focus_state set status = 'running'")),
      ).rejects.toThrow(/permission denied/);
      await expect(
        asUser(db, a, (q) =>
          q("insert into sp_universe_events (kind, points) values ('task_completed', 99999)"),
        ),
      ).rejects.toThrow(/permission denied/);
      await expect(
        asUser(db, a, (q) => q("select sp__timer_apply($1, 'start', 0, now())", [b])),
      ).rejects.toThrow(/permission denied/);
      await expect(asUser(db, a, (q) => q("select sp_scheduler_tick()"))).rejects.toThrow(
        /permission denied/,
      );
      await expect(
        asUser(db, a, (q) => q("update sp_quotes set text = 'x' where is_builtin returning id")),
      ).resolves.toEqual([]);
    });
  });

  describe("tasks", () => {
    it("enforces the date rules and clears dates when moved into a list", async () => {
      const u = await newUser();
      await asUser(db, u, async (q) => {
        const [list] = await q<{ id: string }>(
          "insert into sp_task_lists (name, emoji) values ('  Groceries ', '🛒') returning id, name",
        );
        expect((list as unknown as { name: string }).name).toBe("Groceries");
        const [t] = await q<{ id: string; due_time: string }>(
          "insert into sp_tasks (name, due_date, due_time) values ('Call', '2026-05-01', '15:00') returning id, due_time",
        );
        expect(t!.due_time).toBe("15:00:00");
        const [moved] = await q<{ due_date: string | null; due_time: string | null }>(
          "update sp_tasks set list_id = $2 where id = $1 returning due_date, due_time",
          [t!.id, list!.id],
        );
        expect(moved).toEqual({ due_date: null, due_time: null });
        const [cleared] = await q<{ due_time: string | null }>(
          "insert into sp_tasks (name, due_time) values ('Time only', '09:00') returning due_time",
        );
        expect(cleared!.due_time).toBeNull();
      });
      await expect(
        asUser(db, u, (q) => q("insert into sp_tasks (name) values ('   ')")),
      ).rejects.toThrow(/sp_tasks_name_chk/);
    });

    it("maintains completed_at and default ordering", async () => {
      const u = await newUser();
      await asUser(db, u, async (q) => {
        const [a] = await q<{ id: string; sort_order: number }>(
          "insert into sp_tasks (name) values ('A') returning id, sort_order",
        );
        const [b] = await q<{ sort_order: number }>(
          "insert into sp_tasks (name) values ('B') returning sort_order",
        );
        expect(b!.sort_order).toBeGreaterThan(a!.sort_order);
        const [done] = await q<{ completed_at: string | null }>(
          "update sp_tasks set completed = true where id = $1 returning completed_at",
          [a!.id],
        );
        expect(done!.completed_at).not.toBeNull();
        const [undone] = await q<{ completed_at: string | null }>(
          "update sp_tasks set completed = false where id = $1 returning completed_at",
          [a!.id],
        );
        expect(undone!.completed_at).toBeNull();
      });
    });

    it("serves the Today, All, Calendar and List views in the owner's time zone", async () => {
      const u = await newUser("Pacific/Auckland");
      await asUser(db, u, async (q) => {
        const [{ today }] = (await q<{ today: string }>(
          "select to_char(sp_today(), 'YYYY-MM-DD') as today",
        )) as [{ today: string }];
        const utcToday = new Date().toISOString().slice(0, 10);
        expect(today >= utcToday).toBe(true);
        const [list] = await q<{ id: string }>(
          "insert into sp_task_lists (name) values ('List') returning id",
        );
        await q(
          `insert into sp_tasks (name, due_date, due_time, list_id) values
            ('overdue-late', sp_today() - 1, '18:00', null),
            ('overdue-early', sp_today() - 3, null, null),
            ('today-untimed', sp_today(), null, null),
            ('today-morning', sp_today(), '08:00', null),
            ('tomorrow', sp_today() + 1, null, null),
            ('undated', null, null, null),
            ('in-list', null, null, $1)`,
          [list!.id],
        );
        await q(
          "insert into sp_tasks (name, due_date, completed) values ('done-today', sp_today(), true)",
        );
        await q("update sp_tasks set deleted_at = now() where name = 'tomorrow' and false");

        const names = async (sql: string, params?: unknown[]) =>
          (await q<{ name: string }>(sql, params)).map((r) => r.name);
        expect(await names("select name from sp_tasks_view('today')")).toEqual([
          "overdue-early",
          "overdue-late",
          "today-morning",
          "today-untimed",
        ]);
        expect(
          await names("select name from sp_tasks_view('today', null, null, null, true)"),
        ).toContain("done-today");
        expect(await names("select name from sp_tasks_view('all')")).toEqual([
          "overdue-early",
          "overdue-late",
          "today-morning",
          "today-untimed",
          "tomorrow",
          "undated",
        ]);
        expect(
          await names(
            "select name from sp_tasks_view('calendar', null, sp_today(), sp_today() + 1)",
          ),
        ).toEqual(["today-morning", "today-untimed", "tomorrow"]);
        expect(await names("select name from sp_tasks_view('list', $1)", [list!.id])).toEqual([
          "in-list",
        ]);
      });
      await expect(asUser(db, u, (q) => q("select * from sp_tasks_view('nope')"))).rejects.toThrow(
        /Unknown view/,
      );
    });

    it("postpones overdue tasks to today, keeps times, and can undo", async () => {
      const u = await newUser();
      await asUser(db, u, async (q) => {
        const [list] = await q<{ id: string }>(
          "insert into sp_task_lists (name) values ('List') returning id",
        );
        await q(
          `insert into sp_tasks (name, due_date, due_time, completed, list_id) values
            ('a', sp_today() - 4, '10:30', false, null),
            ('b', sp_today() - 1, null, false, null),
            ('done', sp_today() - 2, null, true, null),
            ('today', sp_today(), null, false, null),
            ('listed', null, null, false, $1)`,
          [list!.id],
        );
        const [{ res }] = (await q<{
          res: { count: number; moved: { id: string; due_date: string }[] };
        }>("select sp_postpone_overdue_to_today() as res")) as [
          { res: { count: number; moved: { id: string; due_date: string }[] } },
        ];
        expect(res.count).toBe(2);
        const after = await q<{ name: string; is_today: boolean; due_time: string | null }>(
          "select name, due_date = sp_today() as is_today, due_time from sp_tasks where name in ('a', 'b', 'done') order by name",
        );
        expect(after).toEqual([
          { name: "a", is_today: true, due_time: "10:30:00" },
          { name: "b", is_today: true, due_time: null },
          { name: "done", is_today: false, due_time: null },
        ]);
        const [{ n }] = (await q<{ n: number }>("select sp_restore_due_dates($1::jsonb) as n", [
          JSON.stringify(res.moved),
        ])) as [{ n: number }];
        expect(n).toBe(2);
        const restored = await q<{ d: number }>(
          "select (sp_today() - due_date)::int as d from sp_tasks where name in ('a', 'b') order by name",
        );
        expect(restored.map((r) => r.d)).toEqual([4, 1]);
        const [{ res: none }] = (await q<{ res: { count: number } }>(
          "select sp_postpone_overdue_to_today() as res",
        )) as [{ res: { count: number } }];
        expect(none.count).toBe(2);
      });
    });

    it("soft-deleting a list hides its tasks and undo restores exactly those", async () => {
      const u = await newUser();
      await asUser(db, u, async (q) => {
        const [list] = await q<{ id: string }>(
          "insert into sp_task_lists (name) values ('List') returning id",
        );
        await q("insert into sp_tasks (name, list_id) values ('keep', $1), ('gone-before', $1)", [
          list!.id,
        ]);
        await q(
          "update sp_tasks set deleted_at = now() - interval '1 day' where name = 'gone-before'",
        );
        await q("update sp_task_lists set deleted_at = now() where id = $1", [list!.id]);
        const [{ n }] = (await q<{ n: number }>(
          "select count(*)::int as n from sp_tasks where list_id = $1 and deleted_at is null",
          [list!.id],
        )) as [{ n: number }];
        expect(n).toBe(0);
        await q("update sp_task_lists set deleted_at = null where id = $1", [list!.id]);
        const live = await q<{ name: string }>(
          "select name from sp_tasks where list_id = $1 and deleted_at is null",
          [list!.id],
        );
        expect(live.map((r) => r.name)).toEqual(["keep"]);
      });
    });
  });

  describe("goals", () => {
    it("derives completion for progress goals and supports increments", async () => {
      const u = await newUser();
      await asUser(db, u, async (q) => {
        const [list] = await q<{ id: string }>(
          "insert into sp_goal_lists (name, emoji) values ('Health', '💪') returning id",
        );
        const [g] = await q<{ id: string; completed: boolean }>(
          "insert into sp_goals (list_id, name, type, total_amount, unit, completed) values ($1, 'Read', 'progress', 20, 'books', true) returning id, completed",
          [list!.id],
        );
        expect(g!.completed).toBe(false);
        const inc = async (d: number) =>
          (
            await q<{
              g: { current_amount: number; completed: boolean; completed_at: string | null };
            }>("select to_jsonb(sp_goal_increment($1, $2)) as g", [g!.id, d])
          )[0]!.g;
        expect(await inc(5)).toMatchObject({
          current_amount: 5,
          completed: false,
          completed_at: null,
        });
        const full = await inc(15);
        expect(full.completed).toBe(true);
        expect(full.completed_at).not.toBeNull();
        expect(await inc(-30)).toMatchObject({
          current_amount: 0,
          completed: false,
          completed_at: null,
        });
        await q(
          "insert into sp_goals (list_id, name, completed) values ($1, 'Todo done', true), ($1, 'Todo open', false)",
          [list!.id],
        );
        await inc(10);
        const [p] = await q<{ total: number; complete: number; fraction: string }>(
          "select total, complete, fraction from sp_goal_list_progress()",
        );
        expect(p!.total).toBe(3);
        expect(p!.complete).toBe(1);
        expect(Number(p!.fraction)).toBeCloseTo((0.5 + 1 + 0) / 3);
      });
      await expect(
        asUser(db, u, (q) =>
          q(
            "insert into sp_goals (list_id, name, type) select id, 'No total', 'progress' from sp_goal_lists",
          ),
        ),
      ).rejects.toThrow(/sp_goals_total_chk/);
    });
  });

  describe("routines", () => {
    it("validates rules and rejects logs on unscheduled days", async () => {
      const u = await newUser();
      await expect(
        asUser(db, u, (q) =>
          q(
            "insert into sp_routines (name, start_date, frequency) values ('x', '2026-03-02', 'weekdays')",
          ),
        ),
      ).rejects.toThrow(/sp_routines_weekdays_chk/);
      await expect(
        asUser(db, u, (q) =>
          q(
            "insert into sp_routines (name, start_date, frequency, interval_days) values ('x', '2026-03-02', 'interval', 1)",
          ),
        ),
      ).rejects.toThrow(/sp_routines_interval_chk/);
      await expect(
        asUser(db, u, (q) =>
          q(
            "insert into sp_routines (name, start_date, end_date) values ('x', '2026-03-02', '2026-03-01')",
          ),
        ),
      ).rejects.toThrow(/sp_routines_dates_chk/);
      await asUser(db, u, async (q) => {
        const [r] = await q<{ id: string; weekdays: number[] }>(
          "insert into sp_routines (name, start_date, frequency, weekdays) values ('MWF', '2026-03-02', 'weekdays', '{5,1,3,1}') returning id, weekdays",
        );
        expect(r!.weekdays).toEqual([1, 3, 5]);
        await q("select sp_routine_log_set($1, '2026-03-04', true)", [r!.id]);
      });
      await expect(
        asUser(db, u, (q) =>
          q("select sp_routine_log_set(id, '2026-03-03', true) from sp_routines"),
        ),
      ).rejects.toThrow(/not scheduled/);
    });

    it("computes day instances, percentages and progress completion", async () => {
      const u = await newUser();
      await asUser(db, u, async (q) => {
        await q(
          `insert into sp_routines (name, type, total_amount, unit, start_date, frequency, weekdays, interval_days, sort_order) values
            ('Meditate', 'todo', null, null, '2026-03-01', 'daily', null, null, 1),
            ('Water', 'progress', 8, 'glasses', '2026-03-01', 'daily', null, null, 2),
            ('Stretch', 'todo', null, null, '2026-03-01', 'interval', null, 2, 3)`,
        );
        await q(
          "select sp_routine_log_set(id, '2026-03-01', true) from sp_routines where name = 'Meditate'",
        );
        const [w] = await q<{ l: { completed: boolean; amount: number } }>(
          "select to_jsonb(sp_routine_log_set(id, '2026-03-01', null, 4)) as l from sp_routines where name = 'Water'",
        );
        expect(w!.l).toMatchObject({ completed: false, amount: 4 });
        const [{ days }] = (await q<{
          days: {
            date: string;
            percent: number;
            instances: { name: string; progress: number }[];
          }[];
        }>("select sp_routine_days('2026-03-01', '2026-03-02') as days")) as [
          {
            days: {
              date: string;
              percent: number;
              instances: { name: string; progress: number }[];
            }[];
          },
        ];
        expect(days).toHaveLength(2);
        expect(days[0]!.date).toBe("2026-03-01");
        expect(days[0]!.instances.map((i) => i.name)).toEqual(["Meditate", "Water", "Stretch"]);
        expect(days[0]!.percent).toBe(50);
        expect(days[1]!.instances.map((i) => i.name)).toEqual(["Meditate", "Water"]);
        expect(days[1]!.percent).toBe(0);
        const [full] = await q<{ l: { completed: boolean } }>(
          "select to_jsonb(sp_routine_log_set(id, '2026-03-01', null, 9)) as l from sp_routines where name = 'Water'",
        );
        expect(full!.l.completed).toBe(true);
      });
      await expect(
        asUser(db, u, (q) => q("select sp_routine_days('2026-01-01', '2028-01-01')")),
      ).rejects.toThrow(/too large/);
    });

    it("rewrites history on edit: drops unscheduled days, resets on type change", async () => {
      const u = await newUser();
      await asUser(db, u, async (q) => {
        const [r] = await q<{ id: string }>(
          "insert into sp_routines (name, start_date) values ('Daily', '2026-03-02') returning id",
        );
        for (const d of ["2026-03-02", "2026-03-03", "2026-03-04", "2026-03-05", "2026-03-06"]) {
          await q("select sp_routine_log_set($1, $2::date, true)", [r!.id, d]);
        }
        await q("update sp_routines set name = 'Renamed' where id = $1", [r!.id]);
        expect(
          (await q("select 1 from sp_routine_logs where routine_id = $1 and completed", [r!.id]))
            .length,
        ).toBe(5);

        await q(
          "update sp_routines set frequency = 'weekdays', weekdays = '{1,3,5}' where id = $1",
          [r!.id],
        );
        const kept = await q<{ d: string }>(
          "select to_char(date, 'YYYY-MM-DD') as d from sp_routine_logs where routine_id = $1 order by date",
          [r!.id],
        );
        expect(kept.map((k) => k.d)).toEqual(["2026-03-02", "2026-03-04", "2026-03-06"]);

        await q("update sp_routines set start_date = '2026-03-04' where id = $1", [r!.id]);
        expect(
          (await q("select 1 from sp_routine_logs where routine_id = $1", [r!.id])).length,
        ).toBe(2);

        await q("update sp_routines set type = 'progress', total_amount = 10 where id = $1", [
          r!.id,
        ]);
        const reset = await q<{ completed: boolean; amount: string }>(
          "select completed, amount from sp_routine_logs where routine_id = $1",
          [r!.id],
        );
        expect(reset).toEqual([
          { completed: false, amount: "0" },
          { completed: false, amount: "0" },
        ]);
      });
    });

    it("hard-deletes a routine with all of its history and leaves tombstones", async () => {
      const u = await newUser();
      const id = await asUser(db, u, async (q) => {
        const [r] = await q<{ id: string }>(
          "insert into sp_routines (name, start_date) values ('Gone', '2026-03-02') returning id",
        );
        await q("select sp_routine_log_set($1, '2026-03-02', true)", [r!.id]);
        await q("delete from sp_routines where id = $1", [r!.id]);
        expect(
          (await q("select 1 from sp_routine_logs where routine_id = $1", [r!.id])).length,
        ).toBe(0);
        const stones = await q<{ table_name: string }>(
          "select table_name from sp_tombstones order by table_name",
        );
        expect(stones.map((s) => s.table_name)).toEqual(["sp_routine_logs", "sp_routines"]);
        return r!.id;
      });
      expect(await points(db, u)).toBe(25); // earned stardust is kept
      expect(id).toBeTruthy();
    });
  });

  describe("stardust ledger", () => {
    it("task: +10, reversal −10", async () => {
      const u = await newUser();
      await asUser(db, u, async (q) => {
        const [t] = await q<{ id: string }>(
          "insert into sp_tasks (name) values ('t') returning id",
        );
        await q("update sp_tasks set completed = true where id = $1", [t!.id]);
        await q("update sp_tasks set name = 'renamed' where id = $1", [t!.id]);
        await q("update sp_tasks set completed = false where id = $1", [t!.id]);
        await q("update sp_tasks set completed = true where id = $1", [t!.id]);
        await q("update sp_tasks set deleted_at = now() where id = $1", [t!.id]);
      });
      expect(await kinds(db, u)).toEqual(["task_completed", "task_uncompleted", "task_completed"]);
      expect(await points(db, u)).toBe(10);
    });

    it("routine: +5 per instance, +20 when the day reaches 100%, reversed when it drops", async () => {
      const u = await newUser();
      await asUser(db, u, async (q) => {
        await q(
          `insert into sp_routines (name, type, total_amount, start_date) values
            ('A', 'todo', null, '2026-03-01'), ('B', 'progress', 8, '2026-03-01')`,
        );
        await q(
          "select sp_routine_log_set(id, '2026-03-01', true) from sp_routines where name = 'A'",
        );
      });
      expect(await points(db, u)).toBe(5);
      await asUser(db, u, (q) =>
        q("select sp_routine_log_set(id, '2026-03-01', null, 7) from sp_routines where name = 'B'"),
      );
      expect(await points(db, u)).toBe(5);
      await asUser(db, u, (q) =>
        q("select sp_routine_log_set(id, '2026-03-01', null, 8) from sp_routines where name = 'B'"),
      );
      expect(await points(db, u)).toBe(5 + 5 + 20);
      await asUser(db, u, (q) =>
        q("select sp_routine_log_set(id, '2026-03-01', false) from sp_routines where name = 'A'"),
      );
      expect(await points(db, u)).toBe(5);
      expect(await kinds(db, u)).toEqual([
        "routine_instance",
        "routine_instance",
        "routine_day",
        "routine_instance_reversed",
        "routine_day_reversed",
      ]);
      await asUser(db, u, (q) =>
        q("select sp_routine_log_set(id, '2026-03-01', true) from sp_routines where name = 'A'"),
      );
      expect(await points(db, u)).toBe(30);
      // Rewrites are structural: resetting logs does not claw points back or double-award later.
      await asUser(db, u, (q) => q("update sp_routines set total_amount = 4 where name = 'B'"));
      expect(await points(db, u)).toBe(30);
    });

    it("goals: 50 × Δfraction, +100 on completion, +250 when the list is complete", async () => {
      const u = await newUser();
      const ids = await asUser(db, u, async (q) => {
        const [list] = await q<{ id: string }>(
          "insert into sp_goal_lists (name) values ('L') returning id",
        );
        const [p] = await q<{ id: string }>(
          "insert into sp_goals (list_id, name, type, total_amount) values ($1, 'P', 'progress', 10) returning id",
          [list!.id],
        );
        const [t] = await q<{ id: string }>(
          "insert into sp_goals (list_id, name) values ($1, 'T') returning id",
          [list!.id],
        );
        return { list: list!.id, p: p!.id, t: t!.id };
      });
      expect(await points(db, u)).toBe(0);
      await asUser(db, u, (q) => q("select sp_goal_increment($1, 5)", [ids.p]));
      expect(await points(db, u)).toBe(25);
      await asUser(db, u, (q) => q("select sp_goal_increment($1, -2)", [ids.p]));
      expect(await points(db, u)).toBe(15);
      await asUser(db, u, (q) => q("select sp_goal_increment($1, 7)", [ids.p]));
      expect(await points(db, u)).toBe(50 + 100);
      await asUser(db, u, (q) => q("update sp_goals set completed = true where id = $1", [ids.t]));
      expect(await points(db, u)).toBe(150 + 100 + 250);
      await asUser(db, u, (q) => q("update sp_goals set completed = false where id = $1", [ids.t]));
      expect(await points(db, u)).toBe(150);
      await asUser(db, u, (q) => q("update sp_goals set completed = true where id = $1", [ids.t]));
      expect(await points(db, u)).toBe(500);
      // Adding an unfinished goal means the list is no longer 100%.
      await asUser(db, u, (q) =>
        q("insert into sp_goals (list_id, name) values ($1, 'New')", [ids.list]),
      );
      expect(await points(db, u)).toBe(250);
      // Deleting the list keeps what was earned.
      await asUser(db, u, (q) =>
        q("update sp_goal_lists set deleted_at = now() where id = $1", [ids.list]),
      );
      expect(await points(db, u)).toBe(250);
    });

    it("focus: 25 per 25 minutes for completed focus phases only", async () => {
      const u = await newUser();
      const t0 = Date.UTC(2026, 0, 5, 9);
      const at = (min: number) => new Date(t0 + min * 60_000).toISOString();
      await db.query("select sp__timer_apply($1, 'start', 0, $2)", [u, at(0)]);
      await db.query("select sp__timer_apply($1, 'advance', 1, $2)", [u, at(25)]);
      expect(await points(db, u)).toBe(25);
      await db.query("select sp__timer_apply($1, 'start', 2, $2)", [u, at(26)]);
      await db.query("select sp__timer_apply($1, 'advance', 3, $2)", [u, at(31)]);
      expect(await points(db, u)).toBe(25); // breaks earn nothing
      await db.query("select sp__timer_apply($1, 'start', 4, $2)", [u, at(32)]);
      await db.query("select sp__timer_apply($1, 'skip', 5, $2)", [u, at(40)]);
      expect(await points(db, u)).toBe(25); // abandoned focus earns nothing
      await db.query("update sp_focus_settings set focus_min = 50 where user_id = $1", [u]);
      await db.query("select sp__timer_apply($1, 'skip', 6, $2)", [u, at(41)]);
      await db.query("select sp__timer_apply($1, 'start', 7, $2)", [u, at(42)]);
      await db.query("select sp__timer_apply($1, 'advance', 8, $2)", [u, at(92)]);
      expect(await points(db, u)).toBe(75);
    });

    it("builds a compact snapshot with era progress", async () => {
      const u = await newUser();
      await asUser(db, u, async (q) => {
        await q(
          "insert into sp_tasks (name, completed) select 'task ' || g, true from generate_series(1, 12) g",
        );
        const [list] = await q<{ id: string }>(
          "insert into sp_goal_lists (name, emoji) values ('Health', '💪') returning id",
        );
        await q(
          "insert into sp_goals (list_id, name, type, total_amount, current_amount) values ($1, 'Run', 'progress', 100, 40)",
          [list!.id],
        );
        const [r] = await q<{ id: string }>(
          "insert into sp_routines (name, emoji, start_date) values ('Meditate', '🧘', sp_today() - 2) returning id",
        );
        await q("select sp_routine_log_set($1, sp_today() - 1, true)", [r!.id]);
        await q("select sp_routine_log_set($1, sp_today(), true)", [r!.id]);
      });
      const snap = await asUser(
        db,
        u,
        async (q) =>
          (await q<{ s: Record<string, never> }>("select sp_universe_snapshot() as s"))[0]!
            .s as unknown as {
            total: number;
            era: {
              index: number;
              name: string;
              remaining: number;
              next_name: string;
              fraction: number;
            };
            stars: { count: number; recent: unknown[]; months: { month: string; count: number }[] };
            lists: { name: string; total: number; all_complete: boolean }[];
            planets: { name: string; progress: number; completed: boolean }[];
            constellations: { name: string; streak: number; broken: boolean; stars: number }[];
          },
      );
      expect(snap.total).toBe(120 + 20 + 10 + 40);
      expect(snap.era).toMatchObject({
        index: 1,
        name: "First Light",
        next_name: "Nebula",
        remaining: 810,
      });
      expect(snap.stars.count).toBe(12);
      expect(snap.stars.recent).toHaveLength(12);
      expect(snap.stars.months).toHaveLength(1);
      expect(snap.stars.months[0]!.count).toBe(12);
      expect(snap.lists).toMatchObject([{ name: "Health", total: 1, all_complete: false }]);
      expect(snap.planets).toMatchObject([{ name: "Run", progress: 0.4, completed: false }]);
      expect(snap.constellations).toMatchObject([
        { name: "Meditate", streak: 2, broken: false, stars: 2 },
      ]);
      expect(JSON.stringify(snap).length).toBeLessThan(4000);
    });
  });

  describe("focus and blocking", () => {
    it("returns server time, enforces versions, and exposes blocking state", async () => {
      const u = await newUser();
      await asUser(db, u, async (q) => {
        const [bl] = await q<{ id: string }>(
          "insert into sp_block_lists (name) values ('Social') returning id",
        );
        await q(
          "insert into sp_block_list_sites (block_list_id, pattern) values ($1, 'https://www.YouTube.com/feed'), ($1, 'reddit.com')",
          [bl!.id],
        );
        const [get] = await q<{
          r: {
            state: { status: string; version: number };
            settings: { focus_min: number };
            server_time: string;
          };
        }>("select sp_focus_get() as r");
        expect(get!.r.state).toMatchObject({ status: "idle", version: 0 });
        expect(get!.r.settings.focus_min).toBe(25);
        expect(Math.abs(Date.parse(get!.r.server_time) - Date.now())).toBeLessThan(60_000);
        await q("update sp_focus_settings set active_block_list_ids = array[$1::uuid]", [bl!.id]);
        const [idle] = await q<{ b: { active: boolean; patterns: string[] } }>(
          "select sp_blocking_state() as b",
        );
        expect(idle!.b.active).toBe(false);
        const [start] = await q<{
          r: { ok: boolean; server_time: string; state: { status: string } };
        }>("select sp_timer_action('start', 0) as r");
        expect(start!.r.ok).toBe(true);
        expect(start!.r.server_time).toBeTruthy();
        const [stale] = await q<{ r: { ok: boolean; error: string } }>(
          "select sp_timer_action('pause', 0) as r",
        );
        expect(stale!.r).toMatchObject({ ok: false, error: "version_conflict" });
        await q("select sp_timer_action('pause', 1)");
        const [paused] = await q<{
          b: { active: boolean; patterns: string[]; lists: { name: string }[] };
        }>("select sp_blocking_state() as b");
        expect(paused!.b.active).toBe(true);
        expect(paused!.b.patterns.sort()).toEqual(["reddit.com", "youtube.com"]);
        expect(paused!.b.lists).toMatchObject([{ name: "Social" }]);
        await q("update sp_block_lists set deleted_at = now() where id = $1", [bl!.id]);
        const [after] = await q<{ ids: string[] }>(
          "select active_block_list_ids as ids from sp_focus_settings",
        );
        expect(after!.ids).toEqual([]);
      });
      await expect(asUser(db, u, (q) => q("select sp_timer_action('explode', 0)"))).rejects.toThrow(
        /Unknown action/,
      );
      await expect(
        asUser(db, u, (q) =>
          q(
            "insert into sp_block_list_sites (block_list_id, pattern) select id, 'not a site' from sp_block_lists",
          ),
        ),
      ).rejects.toThrow(/Invalid website/);
    });

    it("scheduler tick advances due timers and reports each phase end once", async () => {
      const u = await newUser();
      await db.query("select sp__timer_apply($1, 'start', 0, now() - interval '26 minutes')", [u]);
      const first = await db.query("select sp_scheduler_tick() as t");
      const mine = (
        first.rows[0].t as {
          user_id: string;
          completed_phase: string;
          next_phase: string;
          status: string;
          stale: boolean;
        }[]
      ).filter((n) => n.user_id === u);
      expect(mine).toMatchObject([
        { completed_phase: "focus", next_phase: "short_break", status: "awaiting", stale: false },
      ]);
      const second = await db.query("select sp_scheduler_tick() as t");
      expect((second.rows[0].t as { user_id: string }[]).filter((n) => n.user_id === u)).toEqual(
        [],
      );
      const s = await db.query(
        "select count(*)::int as n from sp_focus_sessions where user_id = $1 and completed",
        [u],
      );
      expect(s.rows[0].n).toBe(1);
      const stats = await asUser(
        db,
        u,
        async (q) =>
          (
            await q<{ s: { today_minutes: number; streak_days: number; days: unknown[] } }>(
              "select sp_focus_stats(7) as s",
            )
          )[0]!.s,
      );
      expect(stats).toMatchObject({ today_minutes: 25, streak_days: 1 });
      expect(stats.days).toHaveLength(7);
    });
  });

  describe("maintenance", () => {
    it("bootstraps singleton rows once", async () => {
      const id = await newUser();
      await db.query("delete from sp_settings where user_id = $1", [id]);
      const boot = await asUser(
        db,
        id,
        async (q) =>
          (
            await q<{
              b: {
                settings: { timezone: string; week_start: number };
                focus_state: { status: string };
                schema_version: number;
              };
            }>("select sp_bootstrap('Europe/Berlin', 0::smallint) as b")
          )[0]!.b,
      );
      expect(boot.settings).toMatchObject({ timezone: "Europe/Berlin", week_start: 0 });
      expect(boot.focus_state.status).toBe("idle");
      expect(boot.schema_version).toBeGreaterThanOrEqual(8);
      const again = await asUser(
        db,
        id,
        async (q) =>
          (
            await q<{ b: { settings: { timezone: string } } }>(
              "select sp_bootstrap('Asia/Tokyo') as b",
            )
          )[0]!.b,
      );
      expect(again.settings.timezone).toBe("Europe/Berlin");
      await expect(
        asUser(db, id, (q) => q("update sp_settings set timezone = 'Mars/Olympus'")),
      ).rejects.toThrow(/Unknown time zone/);
    });

    it("purges soft-deleted rows after 30 days", async () => {
      const u = await newUser();
      await asUser(db, u, async (q) => {
        await q(
          "insert into sp_tasks (name, deleted_at) values ('old', now() - interval '31 days'), ('recent', now() - interval '2 days'), ('live', null)",
        );
      });
      await db.query("select sp_purge_deleted()");
      const left = await db.query("select name from sp_tasks where user_id = $1 order by name", [
        u,
      ]);
      expect(left.rows.map((r) => r.name)).toEqual(["live", "recent"]);
    });

    it("rebalances sort order", async () => {
      const u = await newUser();
      await asUser(db, u, async (q) => {
        await q(
          "insert into sp_task_lists (name, sort_order) values ('a', 1), ('b', 1.0000001), ('c', 1.0000002)",
        );
        await q("select sp_rebalance('sp_task_lists')");
        const rows = await q<{ name: string; sort_order: number }>(
          "select name, sort_order from sp_task_lists order by sort_order",
        );
        expect(rows).toEqual([
          { name: "a", sort_order: 1024 },
          { name: "b", sort_order: 2048 },
          { name: "c", sort_order: 3072 },
        ]);
      });
      await expect(asUser(db, u, (q) => q("select sp_rebalance('auth.users')"))).rejects.toThrow(
        /cannot be rebalanced/,
      );
    });

    it("exports everything and imports it into another account without double counting", async () => {
      const a = await newUser("Europe/Paris");
      await asUser(db, a, async (q) => {
        const [list] = await q<{ id: string }>(
          "insert into sp_task_lists (name) values ('List') returning id",
        );
        await q("insert into sp_tasks (name, list_id) values ('listed', $1)", [list!.id]);
        await q(
          "insert into sp_tasks (name, due_date, completed) values ('done', '2026-02-02', true)",
        );
        const [gl] = await q<{ id: string }>(
          "insert into sp_goal_lists (name) values ('G') returning id",
        );
        await q("insert into sp_goals (list_id, name, completed) values ($1, 'goal', true)", [
          gl!.id,
        ]);
        const [r] = await q<{ id: string }>(
          "insert into sp_routines (name, start_date) values ('R', '2026-03-01') returning id",
        );
        await q("select sp_routine_log_set($1, '2026-03-01', true)", [r!.id]);
        const [bl] = await q<{ id: string }>(
          "insert into sp_block_lists (name) values ('B') returning id",
        );
        await q(
          "insert into sp_block_list_sites (block_list_id, pattern) values ($1, 'example.com')",
          [bl!.id],
        );
        await q("insert into sp_quotes (text, author) values ('Stay curious.', 'Me')");
      });
      const total = await points(db, a);
      expect(total).toBe(10 + 100 + 250 + 5 + 20);
      const dump = await asUser(
        db,
        a,
        async (q) => (await q<{ d: Record<string, unknown> }>("select sp_export() as d"))[0]!.d,
      );
      expect(dump.format).toBe("stellar-planner-export");
      expect(JSON.stringify(dump)).not.toContain(a);

      const b = await newUser();
      // Ids are global, so remove the source rows before importing the copy elsewhere.
      await dropUser(db, a);
      const res = await asUser(
        db,
        b,
        async (q) =>
          (
            await q<{ r: { ok: boolean; imported: Record<string, number> } }>(
              "select sp_import($1::jsonb) as r",
              [JSON.stringify(dump)],
            )
          )[0]!.r,
      );
      expect(res.ok).toBe(true);
      expect(res.imported).toMatchObject({
        tasks: 2,
        task_lists: 1,
        goals: 1,
        routines: 1,
        routine_logs: 1,
        block_list_sites: 1,
        quotes: 1,
      });
      expect(await points(db, b)).toBe(total);
      const tz = await db.query("select timezone from sp_settings where user_id = $1", [b]);
      expect(tz.rows[0].timezone).toBe("Europe/Paris");
      await asUser(db, b, (q) => q("select sp_import($1::jsonb)", [JSON.stringify(dump)]));
      expect(await points(db, b)).toBe(total);
      const n = await db.query("select count(*)::int as n from sp_tasks where user_id = $1", [b]);
      expect(n.rows[0].n).toBe(2);
      await expect(
        asUser(db, b, (q) => q('select sp_import(\'{"format":"other"}\'::jsonb)')),
      ).rejects.toThrow(/not a Stellar Planner export/);
    });
  });
});
