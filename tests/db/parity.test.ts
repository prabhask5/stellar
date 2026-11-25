import {
  RECURRENCE_FIXTURES,
  SITE_FIXTURES,
  STREAK_FIXTURES,
  TIMER_FIXTURES,
} from "@stellar/shared/fixtures";
import { isScheduled, normalizeSitePattern } from "@stellar/shared";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { available, asUser, createUser, dropUser, open } from "./support/helpers.ts";

const T0 = Date.UTC(2026, 0, 5, 9, 0, 0);

describe.skipIf(!available)("TS ↔ SQL parity", () => {
  let db: pg.Client;
  const users: string[] = [];
  beforeAll(async () => {
    db = await open();
  });
  afterAll(async () => {
    for (const u of users) await dropUser(db, u);
    await db.end();
  });

  describe("recurrence: sp__scheduled", () => {
    it.each(RECURRENCE_FIXTURES)("$name", async ({ routine, date, expected }) => {
      const r = await db.query(
        "select public.sp__scheduled($1::date, $2::date, $3, $4::smallint[], $5::int, $6::date) as s",
        [
          routine.start_date,
          routine.end_date,
          routine.frequency,
          routine.weekdays,
          routine.interval_days,
          date,
        ],
      );
      expect(r.rows[0].s).toBe(expected);
      expect(isScheduled(routine, date)).toBe(expected);
    });

    it("agrees with TypeScript on every day of a two-year sweep", async () => {
      const rules = [
        {
          start_date: "2026-01-01",
          end_date: null,
          frequency: "daily",
          weekdays: null,
          interval_days: null,
        },
        {
          start_date: "2026-01-07",
          end_date: "2027-06-30",
          frequency: "weekdays",
          weekdays: [0, 2, 4, 6],
          interval_days: null,
        },
        {
          start_date: "2026-02-28",
          end_date: null,
          frequency: "interval",
          weekdays: null,
          interval_days: 7,
        },
        {
          start_date: "2026-05-15",
          end_date: "2027-11-01",
          frequency: "interval",
          weekdays: null,
          interval_days: 5,
        },
      ] as const;
      for (const rule of rules) {
        const r = await db.query(
          `select to_char(d, 'YYYY-MM-DD') as date,
                  public.sp__scheduled($1::date, $2::date, $3, $4::smallint[], $5::int, d::date) as s
             from generate_series('2025-12-25'::date, '2027-12-31'::date, interval '1 day') d`,
          [rule.start_date, rule.end_date, rule.frequency, rule.weekdays, rule.interval_days],
        );
        const mismatches = r.rows.filter(
          (row) =>
            isScheduled(
              { ...rule, weekdays: rule.weekdays ? [...rule.weekdays] : null },
              row.date,
            ) !== row.s,
        );
        expect(mismatches).toEqual([]);
      }
    });
  });

  describe("streaks: sp_routine_streak", () => {
    it.each(STREAK_FIXTURES)("$name", async ({ routine, completed, today, expected }) => {
      const user = await createUser(db);
      users.push(user);
      const streak = await asUser(db, user, async (q) => {
        const [row] = await q<{ id: string }>(
          `insert into public.sp_routines (name, type, start_date, end_date, frequency, weekdays, interval_days)
           values ('Fixture', 'todo', $1, $2, $3, $4::smallint[], $5) returning id`,
          [
            routine.start_date,
            routine.end_date,
            routine.frequency,
            routine.weekdays,
            routine.interval_days,
          ],
        );
        for (const d of completed) {
          await q(
            "insert into public.sp_routine_logs (routine_id, date, completed) values ($1, $2, true)",
            [row!.id, d],
          );
        }
        const [s] = await q<{ s: number }>(
          "select public.sp_routine_streak(r, $2::date) as s from public.sp_routines r where r.id = $1",
          [row!.id, today],
        );
        return s!.s;
      });
      expect(streak).toBe(expected);
    });
  });

  describe("timer: sp__timer_apply", () => {
    for (const fixture of TIMER_FIXTURES) {
      it(fixture.name, async () => {
        const user = await createUser(db);
        users.push(user);
        await db.query("select public.sp__focus_ensure($1)", [user]);
        await db.query(
          `update public.sp_focus_settings set focus_min = $2, short_break_min = $3, long_break_min = $4,
             rounds_before_long = $5, auto_start_breaks = $6, auto_start_focus = $7 where user_id = $1`,
          [
            user,
            fixture.settings.focus_min,
            fixture.settings.short_break_min,
            fixture.settings.long_break_min,
            fixture.settings.rounds_before_long,
            fixture.settings.auto_start_breaks,
            fixture.settings.auto_start_focus,
          ],
        );
        let version = 0;
        for (const [i, step] of fixture.steps.entries()) {
          const now = new Date(T0 + step.at * 1000);
          const r = await db.query("select public.sp__timer_apply($1, $2, $3, $4) as res", [
            user,
            step.action,
            step.expectedVersion ?? version,
            now.toISOString(),
          ]);
          const res = r.rows[0].res as {
            ok: boolean;
            error: string | null;
            state: {
              status: string;
              phase: string;
              round: number;
              version: number;
              phase_ends_at: string | null;
              paused_remaining_ms: number | null;
              session_id: string | null;
            };
            session: Record<string, unknown> | null;
          };
          const label = `step ${i} (${step.action})`;
          expect(res.ok, label).toBe(step.expect.ok);
          expect(res.error ?? undefined, label).toBe(step.expect.error);
          expect(res.state.status, label).toBe(step.expect.status);
          expect(res.state.phase, label).toBe(step.expect.phase);
          expect(res.state.round, label).toBe(step.expect.round);
          expect(Number(res.state.version), label).toBe(step.expect.version);
          const remaining =
            res.state.status === "running"
              ? Date.parse(res.state.phase_ends_at!) - now.getTime()
              : res.state.status === "paused"
                ? res.state.paused_remaining_ms
                : null;
          expect(remaining, label).toBe(step.expect.remaining);
          const blocking =
            res.state.phase === "focus" && ["running", "paused"].includes(res.state.status);
          expect(blocking, label).toBe(step.expect.blocking);
          const viaSql = await db.query("select public.sp__blocking($1) -> 'active' as a", [user]);
          expect(viaSql.rows[0].a, label).toBe(step.expect.blocking);
          if (step.expect.session !== undefined) {
            if (step.expect.session === null) expect(res.session, label).toBeNull();
            else expect(res.session, label).toMatchObject(step.expect.session);
          }
          expect(res.state.session_id === null, label).toBe(res.state.status === "idle");
          version = Number(res.state.version);
        }
        const expectedSessions = fixture.steps.filter(
          (s) => s.expect.ok && s.expect.session,
        ).length;
        const rows = await db.query(
          "select count(*)::int as n from public.sp_focus_sessions where user_id = $1",
          [user],
        );
        expect(rows.rows[0].n).toBe(expectedSessions);
      });
    }
  });

  describe("site patterns: sp_normalize_site", () => {
    it.each(SITE_FIXTURES)("normalises $input", async ({ input, expected }) => {
      const r = await db.query("select public.sp_normalize_site($1) as s", [input]);
      expect(r.rows[0].s).toBe(expected);
      const ts = normalizeSitePattern(input);
      expect(ts.ok ? ts.value : null).toBe(expected);
    });
  });
});
