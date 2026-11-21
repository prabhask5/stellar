import type { Page } from "@playwright/test";
import { ensureConfigured, expect, isPhone, signIn, sql, test, wipeData } from "./helpers";

const OWNER = "(select id from auth.users where email = 'owner@stellar.local')";
const TODAY = `sp__today(${OWNER})`;

async function today(): Promise<string> {
  return (await sql<{ d: string }>(`select to_char(${TODAY}, 'YYYY-MM-DD') as d`))[0]!.d;
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Four routines and three weeks of history, like the approved mockup. */
async function seedMockup(): Promise<void> {
  await sql(`
    insert into sp_routines (user_id, name, emoji, type, total_amount, unit, start_date, sort_order) values
      (${OWNER}, 'Meditate 10 min', null, 'todo', null, null, ${TODAY} - 25, 1),
      (${OWNER}, 'Drink water', null, 'progress', 8, 'glasses', ${TODAY} - 25, 2),
      (${OWNER}, 'Read', null, 'progress', 20, 'pages', ${TODAY} - 25, 3),
      (${OWNER}, 'Evening stretch', null, 'todo', null, null, ${TODAY} - 25, 4)`);
  // History: mostly complete days, a few partial ones.
  await sql(`
    insert into sp_routine_logs (routine_id, date, user_id, completed, amount)
    select r.id, d::date, r.user_id,
           case when r.type = 'todo' then (extract(day from d)::int % 5 <> 0) else false end,
           case when r.type = 'progress' then case when extract(day from d)::int % 4 = 0 then r.total_amount / 2 else r.total_amount end else 0 end
      from sp_routines r, generate_series(${TODAY} - 20, ${TODAY} - 1, interval '1 day') d`);
  await sql(`select sp__focus_ensure(${OWNER})`);
  await sql(`
    insert into sp_routine_logs (routine_id, date, user_id, completed, amount)
    select r.id, ${TODAY}, r.user_id, r.name = 'Meditate 10 min',
           case r.name when 'Drink water' then 5 when 'Read' then 12 else 0 end
      from sp_routines r where r.name <> 'Evening stretch'`);
}

async function openManage(page: Page): Promise<void> {
  const toggle = page.getByRole("button", { name: /Manage routines/ });
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
}

async function addRoutine(
  page: Page,
  name: string,
  configure?: () => Promise<void>,
): Promise<void> {
  await openManage(page);
  await page.getByRole("button", { name: "Add routine" }).click();
  const sheet = page.getByTestId("routine-sheet");
  await sheet.getByRole("textbox", { name: "Name", exact: true }).fill(name);
  await configure?.();
  await sheet.getByRole("button", { name: "Add routine" }).click();
  await expect(sheet).toBeHidden();
}

test.describe("routines", () => {
  test.beforeAll(async ({ request }) => {
    await ensureConfigured(request);
  });
  test.beforeEach(async ({ context }) => {
    await wipeData();
    await signIn(context);
  });

  test("month rings and today's panel match the design", async ({ page, shot }) => {
    await seedMockup();
    await page.goto("/routines");
    const t = await today();
    const calendar = page.getByTestId("month-calendar");
    const panel = page.getByTestId("day-panel").first();
    await expect(panel.getByRole("heading")).toHaveText(/^Today, /);
    // (1 + 5/8 + 12/20 + 0) / 4 = 55.6%
    await expect(panel.getByTestId("day-percent")).toHaveText("56%");
    await expect(panel.getByTestId("routine-row")).toHaveText([
      /Meditate 10 min/,
      /Drink water.*5 \/ 8 glasses/s,
      /Read.*12 \/ 20 pages/s,
      /Evening stretch/,
    ]);
    await expect(panel.getByRole("checkbox", { name: /Meditate/ })).toBeChecked();
    await expect(calendar.locator(`[data-date="${t}"]`)).toHaveAttribute("data-percent", "56");
    await expect(calendar.locator(`[data-date="${t}"]`)).toHaveAttribute("aria-current", "date");
    // Future days carry no ring.
    const tomorrow = addDays(t, 1);
    if (tomorrow.slice(0, 7) === t.slice(0, 7)) {
      await expect(calendar.locator(`[data-date="${tomorrow}"]`)).not.toHaveAttribute(
        "data-percent",
      );
    }
    await expect(page.getByRole("button", { name: /Manage routines/ })).toContainText("4 active");
    await shot("routines");
  });

  test("the day percentage updates live and the ledger follows", async ({ page }) => {
    await sql(`
      insert into sp_routines (user_id, name, type, total_amount, unit, start_date, sort_order) values
        (${OWNER}, 'Meditate', 'todo', null, null, ${TODAY} - 3, 1),
        (${OWNER}, 'Water', 'progress', 4, 'glasses', ${TODAY} - 3, 2)`);
    await page.goto("/routines");
    const t = await today();
    const panel = page.getByTestId("day-panel").first();
    const ring = page.getByTestId("month-calendar").locator(`[data-date="${t}"]`);
    await expect(panel.getByTestId("day-percent")).toHaveText("0%");

    await panel.getByRole("checkbox", { name: "Complete “Meditate”" }).click();
    await expect(panel.getByTestId("day-percent")).toHaveText("50%");
    await expect(ring).toHaveAttribute("data-percent", "50");

    const plus = panel.getByRole("button", { name: "Increase Water" });
    await plus.click();
    await plus.click();
    await expect(panel.getByTestId("day-percent")).toHaveText("75%");
    await expect(panel.getByTestId("routine-row").filter({ hasText: "Water" })).toContainText(
      "2 / 4 glasses",
    );

    // Type an exact amount: reaching the total completes the instance and the day.
    await panel.getByRole("button", { name: /Water: 2 of 4 glasses/ }).click();
    await panel.getByLabel("Water amount").fill("4");
    await panel.getByLabel("Water amount").press("Enter");
    await expect(panel.getByTestId("day-percent")).toHaveText("100%");
    await expect(ring).toHaveAttribute("data-percent", "100");
    // 5 + 5 for the instances, +20 for the complete day.
    await expect
      .poll(
        async () =>
          (await sql(`select coalesce(sum(points), 0)::int as p from sp_universe_events`))[0]?.p,
      )
      .toBe(30);

    // Un-checking drops the day below 100% and reverses the bonus.
    await panel.getByRole("checkbox", { name: /Meditate/ }).click();
    await expect(panel.getByTestId("day-percent")).toHaveText("50%");
    await expect
      .poll(
        async () =>
          (await sql(`select coalesce(sum(points), 0)::int as p from sp_universe_events`))[0]?.p,
      )
      .toBe(5);
  });

  test("past days are editable; phones use a sheet, desktop an inline panel", async ({
    page,
  }, info) => {
    await sql(
      `insert into sp_routines (user_id, name, start_date) values (${OWNER}, 'Journal', ${TODAY} - 10)`,
    );
    await page.goto("/routines");
    const t = await today();
    const past = addDays(t, -2);
    if (past.slice(0, 7) !== t.slice(0, 7))
      await page.getByRole("button", { name: "Previous month" }).click();
    await page.getByTestId("month-calendar").locator(`[data-date="${past}"]`).click();
    const panel = isPhone(info.project.name)
      ? page.getByRole("dialog").getByTestId("day-panel")
      : page.getByTestId("day-panel").first();
    await expect(panel).toHaveAttribute("data-date", past);
    await panel.getByRole("checkbox", { name: "Complete “Journal”" }).click();
    await expect(panel.getByTestId("day-percent")).toHaveText("100%");
    await expect
      .poll(
        async () =>
          (await sql(`select to_char(date, 'YYYY-MM-DD') as d, completed from sp_routine_logs`))[0],
      )
      .toEqual({ d: past, completed: true });
    await expect(
      page.getByTestId("month-calendar").locator(`[data-date="${past}"]`),
    ).toHaveAttribute("data-percent", "100");
  });

  test("all three frequencies schedule the right days, with a live preview", async ({ page }) => {
    await page.goto("/routines");
    const t = await today();
    const sheet = page.getByTestId("routine-sheet");
    const preview = sheet.getByTestId("schedule-preview");

    await addRoutine(page, "Daily walk", async () => {
      await expect(preview).toContainText("Every day · next 14 dates");
      await expect(preview.getByRole("listitem")).toHaveCount(14);
    });

    await addRoutine(page, "Gym", async () => {
      await sheet.getByRole("radio", { name: "Weekdays" }).click();
      await expect(preview).toContainText("Mon, Wed, Fri");
      // Deselect everything: the preview explains what is missing.
      for (const day of ["Monday", "Wednesday", "Friday"])
        await sheet.getByRole("button", { name: day, exact: true }).click();
      await expect(preview).toContainText("Pick at least one weekday.");
      await sheet.getByRole("button", { name: "Tuesday", exact: true }).click();
      await sheet.getByRole("button", { name: "Saturday", exact: true }).click();
      await expect(preview).toContainText("Tue, Sat · next 14 dates");
      const items = await preview.getByRole("listitem").allInnerTexts();
      expect(items.every((i) => /^(Tue|Sat) /.test(i))).toBe(true);
    });

    await addRoutine(page, "Deep clean", async () => {
      await sheet.getByRole("radio", { name: "Every N days" }).click();
      await sheet.getByLabel("Interval in days").fill("1");
      await expect(preview).toContainText("Use an interval of at least 2 days.");
      await sheet.getByLabel("Interval in days").fill("3");
      await expect(preview).toContainText("Every 3 days · next 14 dates");
      await sheet.getByRole("radio", { name: "Progress" }).click();
      await sheet.getByRole("textbox", { name: "Daily total" }).fill("30");
      await sheet.getByRole("textbox", { name: "Unit" }).fill("minutes");
    });

    const rows = await sql(
      `select name, type, frequency, weekdays, interval_days, total_amount::int as total, unit, to_char(start_date, 'YYYY-MM-DD') as start from sp_routines order by created_at`,
    );
    expect(rows).toEqual([
      {
        name: "Daily walk",
        type: "todo",
        frequency: "daily",
        weekdays: null,
        interval_days: null,
        total: null,
        unit: null,
        start: t,
      },
      {
        name: "Gym",
        type: "todo",
        frequency: "weekdays",
        weekdays: [2, 6],
        interval_days: null,
        total: null,
        unit: null,
        start: t,
      },
      {
        name: "Deep clean",
        type: "progress",
        frequency: "interval",
        weekdays: null,
        interval_days: 3,
        total: 30,
        unit: "minutes",
        start: t,
      },
    ]);

    await expect(page.getByTestId("routine-item")).toHaveText([
      /Daily walk.*Every day/s,
      /Gym.*Tue, Sat/s,
      /Deep clean.*Every 3 days · 30 minutes a day/s,
    ]);
    // Today: the daily and the interval routine (day 0) are due; the gym only on Tue/Sat.
    const dow = new Date(`${t}T00:00:00Z`).getUTCDay();
    const expected = ["Daily walk", ...(dow === 2 || dow === 6 ? ["Gym"] : []), "Deep clean"];
    await expect(page.getByTestId("day-panel").first().getByTestId("routine-row")).toHaveText(
      expected.map((n) => new RegExp(n)),
    );
  });

  test("editing rewrites every day; streaks follow; delete removes all history", async ({
    page,
  }) => {
    await sql(
      `insert into sp_routines (user_id, name, start_date) values (${OWNER}, 'Journal', ${TODAY} - 13)`,
    );
    await sql(`
      insert into sp_routine_logs (routine_id, date, user_id, completed)
      select r.id, d::date, r.user_id, true from sp_routines r, generate_series(${TODAY} - 13, ${TODAY}, interval '1 day') d`);
    await page.goto("/routines");
    await openManage(page);
    const item = page.getByTestId("routine-item").filter({ hasText: "Journal" });
    await expect(item.getByTestId("streak")).toHaveText("14-day streak");

    // Daily → Mon/Wed/Fri: logs on days that are no longer scheduled disappear, everywhere.
    await item.click();
    const sheet = page.getByTestId("routine-sheet");
    await expect(sheet.getByText("Changes apply to every day, past and future.")).toBeVisible();
    await sheet.getByRole("radio", { name: "Weekdays" }).click();
    await sheet.getByRole("button", { name: "Save changes" }).click();
    await expect(item).toContainText("Mon, Wed, Fri");
    await expect
      .poll(
        async () =>
          (
            await sql(
              `select count(*)::int as n, bool_and(extract(dow from date) in (1, 3, 5)) as ok from sp_routine_logs`,
            )
          )[0],
      )
      .toEqual({ n: 6, ok: true });
    await expect(item.getByTestId("streak")).toHaveText("6-day streak");

    // Changing the type resets what remains.
    await item.click();
    await sheet.getByRole("radio", { name: "Progress" }).click();
    await sheet.getByRole("textbox", { name: "Daily total" }).fill("3");
    await sheet.getByRole("textbox", { name: "Unit" }).fill("pages");
    await sheet.getByRole("button", { name: "Save changes" }).click();
    await expect(item.getByTestId("streak")).toHaveText("No streak");
    await expect
      .poll(
        async () =>
          (
            await sql(
              `select count(*)::int as n from sp_routine_logs where completed or amount <> 0`,
            )
          )[0]?.n,
      )
      .toBe(0);

    // Delete confirms with the exact consequence, then removes the routine and its logs.
    await item.click();
    await sheet.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("This removes the routine and all of its history.")).toBeVisible();
    await page.getByRole("button", { name: "Delete routine" }).click();
    await expect(page.getByTestId("routine-item")).toHaveCount(0);
    await expect
      .poll(
        async () =>
          (
            await sql(
              `select (select count(*) from sp_routines)::int as r, (select count(*) from sp_routine_logs)::int as l`,
            )
          )[0],
      )
      .toEqual({ r: 0, l: 0 });
    await expect(page.getByText("No constellations yet.")).toBeVisible();
  });
});
