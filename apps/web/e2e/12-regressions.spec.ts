// Regression tests from polish pass 1 (docs/polish/AUDIT.md). Each began as a failing
// adversarial test in the audit: rapid input, offline replay, two tabs, lock isolation,
// time zones, gestures and two server behaviours. The ADV numbers are quoted in AUDIT.md.
import type { BrowserContext, Page } from "@playwright/test";
import {
  ensureConfigured,
  expect,
  listsInTab,
  pickersInSheet,
  isTouch,
  signIn,
  sql,
  swipe,
  test,
  uniqueIp,
  wipeData,
} from "./helpers";

const OWNER = "(select id from auth.users where email = 'owner@stellar.local')";
const count = async (where: string) =>
  (await sql<{ n: number }>(`select count(*)::int as n from ${where}`))[0]!.n;
const today = `sp__today(${OWNER})`;

async function goOnline(context: BrowserContext, page: Page) {
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
}
async function goOffline(context: BrowserContext, page: Page) {
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
}

test.describe("regressions", () => {
  test.beforeAll(async ({ request }) => {
    await ensureConfigured(request);
  });
  test.beforeEach(async ({ context }) => {
    await wipeData();
    await signIn(context);
  });

  // ── rapid input ───────────────────────────────────────────────────────────
  test("ADV-01 holding Enter in quick add creates one task", async ({ page }) => {
    await page.goto("/tasks");
    const name = page.getByLabel("Task name");
    await name.fill("Held enter");
    await page.keyboard.down("Enter");
    for (let i = 0; i < 6; i++) await page.keyboard.down("Enter"); // auto-repeat
    await page.keyboard.up("Enter");
    await page.waitForTimeout(1500);
    expect(await count(`sp_tasks where name = 'Held enter'`)).toBe(1);
  });

  test("ADV-02 tapping a just-completed task again un-completes it", async ({ page }) => {
    await sql(
      `insert into sp_tasks (user_id, name, due_date) values (${OWNER}, 'Twice', ${today})`,
    );
    await page.goto("/tasks");
    const box = page.getByTestId("task-row").filter({ hasText: "Twice" }).getByRole("checkbox");
    // Two taps 150 ms apart, timed inside the page so a slow engine cannot stretch the gap
    // past the 600 ms the row lingers.
    await expect(box).toBeVisible();
    await box.evaluate(
      (el: HTMLElement) =>
        new Promise<void>((resolve) => {
          el.click();
          setTimeout(() => {
            document.querySelector<HTMLElement>('[data-task="Twice"] [role="checkbox"]')?.click();
            resolve();
          }, 150);
        }),
    );
    await page.waitForTimeout(1500);
    await expect(page.getByText("2 tasks completed")).toHaveCount(0);
    await expect(page.getByTestId("task-row").filter({ hasText: "Twice" })).toBeVisible();
    expect((await sql(`select completed from sp_tasks where name = 'Twice'`))[0]?.completed).toBe(
      false,
    );
    expect(
      (await sql(`select coalesce(sum(points), 0)::int as p from sp_universe_events`))[0]?.p,
    ).toBe(0);
  });

  test("ADV-03 ten rapid + taps on a progress goal add exactly ten and never step back", async ({
    page,
  }) => {
    await sql(`with l as (insert into sp_goal_lists (user_id, name) values (${OWNER}, 'Health') returning id)
      insert into sp_goals (user_id, list_id, name, type, total_amount) select ${OWNER}, id, 'Water', 'progress', 100 from l`);
    await page.goto("/goals");
    await page.getByRole("button", { name: "Open Health" }).click();
    const row = page.getByTestId("goal-row").filter({ hasText: "Water" });
    const plus = row.getByRole("button", { name: "Increase Water" });
    await expect(plus).toBeVisible();
    await page.evaluate(() => {
      const w = window as unknown as { __seen: number[] };
      w.__seen = [];
      const el = document.querySelector('[data-testid="goal-row"]')!;
      new MutationObserver(() => {
        const m = /(\d+)\s*\/\s*100/.exec(el.textContent ?? "");
        if (m) w.__seen.push(Number(m[1]));
      }).observe(el, { subtree: true, childList: true, characterData: true });
    });
    for (let i = 0; i < 10; i++) await plus.click({ delay: 0 });
    await expect
      .poll(async () => (await sql(`select current_amount::int as a from sp_goals`))[0]?.a, {
        timeout: 15_000,
      })
      .toBe(10);
    await page.waitForTimeout(1500);
    const seen = await page.evaluate(() => (window as unknown as { __seen: number[] }).__seen);
    const steppedBack = seen.some((v, i) => i > 0 && v < (seen[i - 1] ?? 0));
    expect(steppedBack, `displayed amounts: ${seen.join(",")}`).toBe(false);
    await expect(row).toContainText("10");
  });

  test("ADV-04 double-activating Create makes one list", async ({ page }, info) => {
    await page.goto("/tasks");
    if (listsInTab(info.project.name))
      await page.getByRole("radio", { name: "Lists", exact: true }).click();
    const panel = page.getByTestId("task-lists").filter({ visible: true });
    await panel.getByRole("button", { name: "New task list" }).click();
    await page.getByRole("textbox", { name: "Name", exact: true }).fill("Dupes");
    const create = page.getByRole("button", { name: "Create" });
    // Three taps as fast as a finger or a bouncing mouse button can produce them: separate
    // events a few milliseconds apart, the later ones landing while the sheet animates out.
    await create.evaluate((el: HTMLElement) => {
      el.click();
      setTimeout(() => el.click(), 0);
      setTimeout(() => el.click(), 60);
    });
    await page.waitForTimeout(1500);
    expect(await count(`sp_task_lists where name = 'Dupes'`)).toBe(1);
  });

  // ── offline / outbox ──────────────────────────────────────────────────────
  test("ADV-10 two edits to one task made offline both survive reconnect", async ({
    page,
    context,
  }) => {
    test.setTimeout(120_000);
    await sql(
      `insert into sp_tasks (user_id, name, due_date) values (${OWNER}, 'Edit me', ${today})`,
    );
    await page.goto("/tasks");
    await expect(page.getByTestId("today-tab")).toContainText("Edit me");
    await goOffline(context, page);
    await page.getByRole("button", { name: "Edit Edit me" }).click();
    const sheet = page.getByTestId("task-sheet");
    await sheet.getByLabel("Name").fill("Edited offline");
    await sheet.getByRole("button", { name: "Done" }).click();
    await page.getByRole("button", { name: "Edit Edited offline" }).click();
    await sheet.getByLabel("Description").fill("Second edit");
    await sheet.getByRole("button", { name: "Done" }).click();
    // Offline long enough to count as an offline edit (the outbox guard starts at 15 s).
    await page.waitForTimeout(17_000);
    await goOnline(context, page);
    await expect
      .poll(async () => (await sql(`select name from sp_tasks`))[0]?.name, { timeout: 20_000 })
      .toBe("Edited offline");
    await page.waitForTimeout(3000);
    expect((await sql(`select name, description from sp_tasks`))[0]).toEqual({
      name: "Edited offline",
      description: "Second edit",
    });
  });

  test("ADV-11 a task created and completed offline is completed after reconnect", async ({
    page,
    context,
  }) => {
    test.setTimeout(120_000);
    await page.goto("/tasks");
    await expect(page.getByTestId("today-tab")).toBeVisible();
    await page.waitForTimeout(1500);
    await goOffline(context, page);
    const name = page.getByLabel("Task name");
    await name.fill("Offline both");
    await name.press("Enter");
    await page.getByRole("checkbox", { name: "Complete “Offline both”" }).click();
    await page.waitForTimeout(17_000);
    await goOnline(context, page);
    await expect
      .poll(() => count(`sp_tasks where name = 'Offline both'`), { timeout: 20_000 })
      .toBe(1);
    await page.waitForTimeout(3000);
    expect((await sql(`select completed from sp_tasks`))[0]?.completed).toBe(true);
  });

  test("ADV-12 twenty offline changes replay in order with nothing lost or doubled", async ({
    page,
    context,
  }) => {
    test.setTimeout(150_000);
    await sql(`insert into sp_tasks (user_id, name, due_date)
      select ${OWNER}, 'Seed ' || g, ${today} from generate_series(1, 6) g`);
    await page.goto("/tasks");
    await expect(page.getByTestId("today-tab")).toContainText("Seed 6");
    await page.waitForTimeout(1500);
    await goOffline(context, page);
    const name = page.getByLabel("Task name");
    for (let i = 1; i <= 10; i++) {
      await name.fill(`Offline ${i}`);
      await name.press("Enter");
    }
    for (const n of [1, 2, 3]) {
      await page.getByRole("checkbox", { name: `Complete “Seed ${n}”` }).click();
    }
    for (const n of [1, 2, 3]) {
      await page.getByRole("checkbox", { name: `Complete “Offline ${n}”` }).click();
    }
    for (const n of [4, 5]) {
      await page.getByRole("button", { name: `Edit Seed ${n}` }).click();
      await page.getByTestId("task-sheet").getByLabel("Name").fill(`Renamed ${n}`);
      await page.getByTestId("task-sheet").getByRole("button", { name: "Done" }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
    }
    await page.getByRole("button", { name: "Edit Seed 6" }).click();
    await page.getByTestId("task-sheet").getByRole("button", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Edit Offline 10" }).click();
    await page.getByTestId("task-sheet").getByRole("button", { name: "Delete" }).click();
    await page.waitForTimeout(17_000);
    // The app is killed and relaunched before the network returns.
    await page.reload().catch(() => {});
    await goOnline(context, page);
    await page.reload();
    await expect
      .poll(() => count(`sp_tasks where name like 'Offline %'`), { timeout: 30_000 })
      .toBe(10);
    await page.waitForTimeout(4000);
    const rows = await sql<{ name: string; completed: boolean; gone: boolean }>(
      `select name, completed, deleted_at is not null as gone from sp_tasks order by name`,
    );
    const by = Object.fromEntries(rows.map((r) => [r.name, r]));
    expect(rows.length, "no duplicates").toBe(16);
    for (const n of ["Seed 1", "Seed 2", "Seed 3", "Offline 1", "Offline 2", "Offline 3"])
      expect(by[n]?.completed, `${n} completed`).toBe(true);
    expect(by["Renamed 4"], "rename 4").toBeTruthy();
    expect(by["Renamed 5"], "rename 5").toBeTruthy();
    expect(by["Seed 6"]?.gone, "Seed 6 deleted").toBe(true);
    expect(by["Offline 10"]?.gone, "Offline 10 deleted").toBe(true);
    // And the screen agrees with the database.
    await expect(page.getByTestId("today-tab").getByTestId("task-row")).toHaveCount(8);
  });

  test("ADV-13 a request that never answers does not freeze sync for good", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/tasks");
    await expect(page.getByTestId("today-tab")).toBeVisible();
    await page.waitForTimeout(1000);
    let hung = 0;
    await page.route("**/rest/v1/sp_tasks**", async (route) => {
      if (route.request().method() === "POST" && hung === 0) {
        hung += 1;
        return; // never answered
      }
      await route.continue();
    });
    const name = page.getByLabel("Task name");
    await name.fill("Hangs first");
    await name.press("Enter");
    await name.fill("Then this");
    await name.press("Enter");
    await expect
      .poll(() => count(`sp_tasks where name in ('Hangs first', 'Then this')`), { timeout: 60_000 })
      .toBe(2);
  });

  test("ADV-14 a goal increment queued offline is applied once with two tabs open", async ({
    page,
    context,
  }) => {
    test.setTimeout(90_000);
    await sql(`with l as (insert into sp_goal_lists (user_id, name) values (${OWNER}, 'Health') returning id)
      insert into sp_goals (user_id, list_id, name, type, total_amount) select ${OWNER}, id, 'Water', 'progress', 100 from l`);
    await page.goto("/goals");
    await page.getByRole("button", { name: "Open Health" }).click();
    await page.waitForTimeout(1500);
    await goOffline(context, page);
    await page.getByRole("button", { name: "Increase Water" }).click();
    await page.waitForTimeout(800);
    const page2 = await context.newPage();
    await context.setOffline(false);
    await Promise.all([
      page2.goto("/goals"),
      page.evaluate(() => window.dispatchEvent(new Event("online"))),
    ]);
    await expect
      .poll(async () => (await sql(`select current_amount::int as a from sp_goals`))[0]?.a, {
        timeout: 20_000,
      })
      .toBeGreaterThan(0);
    await page.waitForTimeout(4000);
    expect((await sql(`select current_amount::int as a from sp_goals`))[0]?.a).toBe(1);
  });

  // ── concurrency ───────────────────────────────────────────────────────────
  test("ADV-20 deleting a task that is open in another tab closes it there without errors", async ({
    page,
    browser,
    baseURL,
  }, info) => {
    await sql(
      `insert into sp_tasks (user_id, name, due_date) values (${OWNER}, 'Shared', ${today})`,
    );
    const other = await browser.newContext({
      ...info.project.use,
      baseURL,
      extraHTTPHeaders: { "x-forwarded-for": uniqueIp() },
    });
    await signIn(other);
    const page2 = await other.newPage();
    const errors: string[] = [];
    page2.on("pageerror", (e) => errors.push(e.message));
    await Promise.all([page.goto("/tasks"), page2.goto("/tasks")]);
    await page2.getByRole("button", { name: "Edit Shared" }).click();
    await expect(page2.getByTestId("task-sheet")).toBeVisible();
    await page.waitForTimeout(2500); // realtime joined
    await page.getByRole("button", { name: "Edit Shared" }).click();
    await page.getByTestId("task-sheet").getByRole("button", { name: "Delete" }).click();
    await expect(page2.getByTestId("today-tab")).not.toContainText("Shared", { timeout: 8000 });
    // The other tab's open editor must not resurrect or keep editing a deleted task.
    await expect(page2.getByTestId("task-sheet")).toHaveCount(0, { timeout: 5000 });
    expect(errors).toEqual([]);
    await other.close();
  });

  test("ADV-21 an edit in tab A is not overwritten by tab B's stale open editor", async ({
    page,
    browser,
    baseURL,
  }, info) => {
    await sql(
      `insert into sp_tasks (user_id, name, due_date) values (${OWNER}, 'Original', ${today})`,
    );
    const other = await browser.newContext({
      ...info.project.use,
      baseURL,
      extraHTTPHeaders: { "x-forwarded-for": uniqueIp() },
    });
    await signIn(other);
    const page2 = await other.newPage();
    await Promise.all([page.goto("/tasks"), page2.goto("/tasks")]);
    await page.waitForTimeout(2500);
    await page2.getByRole("button", { name: "Edit Original" }).click();
    const sheet2 = page2.getByTestId("task-sheet");
    await expect(sheet2).toBeVisible();
    // A renames while B's sheet is open.
    await page.getByRole("button", { name: "Edit Original" }).click();
    await page.getByTestId("task-sheet").getByLabel("Name").fill("Renamed in A");
    await page.getByTestId("task-sheet").getByRole("button", { name: "Done" }).click();
    await expect(page2.getByTestId("today-tab")).toContainText("Renamed in A", { timeout: 8000 });
    // B only changes the description.
    await sheet2.getByLabel("Description").fill("From B");
    await sheet2.getByRole("button", { name: "Done" }).click();
    await expect
      .poll(async () => (await sql(`select description from sp_tasks`))[0]?.description)
      .toBe("From B");
    expect((await sql(`select name from sp_tasks`))[0]?.name).toBe("Renamed in A");
    await other.close();
  });

  test("ADV-22 timer pressed from two tabs and the API at once settles on one state", async ({
    page,
    browser,
    baseURL,
    request,
  }, info) => {
    const other = await browser.newContext({
      ...info.project.use,
      baseURL,
      extraHTTPHeaders: { "x-forwarded-for": uniqueIp() },
    });
    await signIn(other);
    const page2 = await other.newPage();
    await Promise.all([page.goto("/focus"), page2.goto("/focus")]);
    await page.waitForTimeout(2500);
    const pin = await request.post("/api/v1/auth/pin", {
      data: { pin: "246810", device: { name: "api", kind: "ios" } },
    });
    const token = (await pin.json()).session.access_token as string;
    await Promise.all([
      page.getByRole("button", { name: "Start focus" }).click(),
      page2.getByRole("button", { name: "Start focus" }).click(),
      request.post("/api/v1/focus/actions", {
        headers: { Authorization: `Bearer ${token}` },
        data: { action: "start", expectedVersion: 0 },
      }),
    ]);
    await page.waitForTimeout(3000);
    const db = (
      await sql<{ status: string; version: number }>(
        `select status, version::int as version from sp_focus_state`,
      )
    )[0]!;
    // One Start wins. A second tap may land after the button has turned into Pause, which
    // is a legitimate second action; what matters is that everyone agrees on the result.
    expect([
      { status: "running", version: 1 },
      { status: "paused", version: 2 },
    ]).toContainEqual(db);
    for (const p of [page, page2])
      await expect(p.getByTestId("focus")).toHaveAttribute("data-status", db.status);
    const [a, b] = await Promise.all(
      [page, page2].map(async (p) => {
        const [m, s] = (await p.getByTestId("timer-clock").innerText()).split(":").map(Number);
        return (m ?? 0) * 60 + (s ?? 0);
      }),
    );
    expect(Math.abs((a ?? 0) - (b ?? 0))).toBeLessThanOrEqual(1);
    expect(await count(`sp_focus_sessions`)).toBe(0);
    await other.close();
  });

  // ── lock ──────────────────────────────────────────────────────────────────
  test("ADV-30 nothing underneath the inactivity lock can be reached from the keyboard", async ({
    page,
  }, info) => {
    test.skip(isTouch(info.project.name), "keyboard path");
    await sql(`update sp_settings set lock_after_minutes = 5`);
    await page.goto("/tasks");
    await page.getByLabel("Task name").click();
    // The lock arms once the settings have loaded and stamps the time of last activity.
    await page.waitForFunction(() => localStorage.getItem("sp-last-active") !== null);
    await page.evaluate(() => {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)!;
        if (/active|lock/i.test(k) && !/pin/.test(k))
          localStorage.setItem(k, String(Date.now() - 3_600_000));
      }
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(page.getByTestId("inactivity-lock")).toBeVisible({ timeout: 20_000 });
    // Typing the PIN must not leak into the page below.
    await page.keyboard.type("999999");
    await page.keyboard.press("Enter");
    await page.keyboard.press("ControlOrMeta+k");
    await page.waitForTimeout(500);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.waitForTimeout(1200);
    expect(await count(`sp_tasks`)).toBe(0);
  });

  // ── time ──────────────────────────────────────────────────────────────────
  test("ADV-40 Today follows the owner's time zone, not the device's", async ({
    browser,
    baseURL,
  }, info) => {
    await sql(`update sp_settings set timezone = 'Pacific/Kiritimati'`);
    const ctx = await browser.newContext({
      ...info.project.use,
      baseURL,
      timezoneId: "Pacific/Pago_Pago",
      extraHTTPHeaders: { "x-forwarded-for": uniqueIp() },
    });
    await signIn(ctx);
    const page = await ctx.newPage();
    await page.goto("/tasks");
    const name = page.getByLabel("Task name");
    await expect(page.getByTestId("today-tab").getByText("Clear skies.")).toBeVisible();
    await name.fill("Zone check");
    await name.press("Enter");
    await expect(page.getByTestId("today-tab")).toContainText("Zone check");
    await expect
      .poll(async () => (await sql(`select (due_date - ${today})::int as d from sp_tasks`))[0]?.d)
      .toBe(0);
    // A date picked as "Tomorrow" is the owner's tomorrow.
    await name.fill("Zone tomorrow");
    await page.getByRole("button", { name: /Due date/ }).click();
    await page.getByRole("button", { name: "Tomorrow", exact: true }).click();
    if (pickersInSheet(info.project.name)) await page.getByRole("button", { name: "Done" }).click();
    else await page.keyboard.press("Escape");
    await name.press("Enter");
    await expect
      .poll(
        async () =>
          (
            await sql(
              `select (due_date - ${today})::int as d from sp_tasks where name = 'Zone tomorrow'`,
            )
          )[0]?.d,
      )
      .toBe(1);
    // The time zone the device reports must not replace the owner's setting.
    expect((await sql(`select timezone from sp_settings`))[0]?.timezone).toBe("Pacific/Kiritimati");
    await ctx.close();
  });

  test("ADV-41 midnight passing while the app is open moves today's tasks to Overdue", async ({
    page,
  }) => {
    await sql(
      `insert into sp_tasks (user_id, name, due_date) values (${OWNER}, 'Due today', ${today})`,
    );
    await page.clock.install();
    await page.goto("/tasks");
    await expect(page.getByText("Today · 1")).toBeVisible();
    await page.clock.fastForward("24:00:30");
    await expect(page.getByText("Overdue · 1")).toBeVisible({ timeout: 5000 });
  });

  test("ADV-42 All with Show completed has one group per heading and no React key warnings", async ({
    page,
  }) => {
    await sql(`insert into sp_tasks (user_id, name, due_date, completed) values
      (${OWNER}, 'Old done 1', ${today} - 5, true), (${OWNER}, 'Old open', ${today} - 4, false),
      (${OWNER}, 'Old done 2', ${today} - 3, true), (${OWNER}, 'Old open 2', ${today} - 2, false)`);
    const warnings: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error" || m.type() === "warning") warnings.push(m.text());
    });
    await page.goto("/tasks");
    await page.getByRole("radio", { name: "All", exact: true }).click();
    await page.getByRole("switch", { name: "Show completed" }).click();
    await expect(page.getByTestId("all-tab")).toContainText("Old done 2");
    await expect(page.getByTestId("all-tab").getByRole("region", { name: "Overdue" })).toHaveCount(
      1,
    );
    expect(warnings.filter((w) => /same key|unique "key"/i.test(w))).toEqual([]);
  });

  // ── gestures ──────────────────────────────────────────────────────────────
  test("ADV-50 closing an open row by swiping it back does not complete the task", async ({
    page,
  }, info) => {
    test.skip(!isTouch(info.project.name), "touch only");
    await sql(
      `insert into sp_tasks (user_id, name, due_date) values (${OWNER}, 'Swipe me', ${today})`,
    );
    await page.goto("/tasks");
    const row = page.getByTestId("task-row").filter({ hasText: "Swipe me" });
    const box = (await row.boundingBox())!;
    const y = box.y + box.height / 2;
    await swipe(page, { x: box.x + box.width - 60, y }, -150);
    await expect(page.getByRole("button", { name: "Delete “Swipe me”" })).toBeVisible();
    await page.waitForTimeout(400);
    await swipe(page, { x: box.x + 60, y }, 150);
    await page.waitForTimeout(1500);
    expect((await sql(`select completed from sp_tasks`))[0]?.completed).toBe(false);
    await expect(row).toBeVisible();
  });

  // ── server ────────────────────────────────────────────────────────────────
  test("ADV-60 parallel wrong PINs cannot get more than five guesses evaluated", async ({
    request,
  }, info) => {
    test.skip(info.project.name !== "desktop", "server behaviour, once");
    await sql(`delete from sp_auth_events`);
    const attempts = await Promise.all(
      Array.from({ length: 25 }, (_, i) =>
        request.post("/api/v1/auth/pin", {
          headers: { "x-forwarded-for": `10.9.${i}.1` },
          data: { pin: String(100000 + i), device: { name: "x", kind: "ios" } },
        }),
      ),
    );
    const evaluated = attempts.filter((r) => r.status() === 401).length;
    const { clearLockout } = await import("./helpers");
    clearLockout();
    expect(evaluated, "guesses that were actually checked").toBeLessThanOrEqual(5);
  });

  test("ADV-61 DELETE /routines/:id removes the routine and its history", async ({
    request,
  }, info) => {
    test.skip(info.project.name !== "desktop", "server behaviour, once");
    await sql(
      `insert into sp_routines (user_id, name, start_date, frequency) values (${OWNER}, 'Zombie', ${today} - 3, 'daily')`,
    );
    await sql(
      `insert into sp_routine_logs (routine_id, date, user_id, completed) select id, ${today}, user_id, true from sp_routines`,
    );
    const pin = await request.post("/api/v1/auth/pin", {
      data: { pin: "246810", device: { name: "api", kind: "ios" } },
    });
    const headers = { Authorization: `Bearer ${(await pin.json()).session.access_token}` };
    const id = (await sql<{ id: string }>(`select id from sp_routines`))[0]!.id;
    expect((await request.delete(`/api/v1/routines/${id}`, { headers })).ok()).toBe(true);
    expect(await count(`sp_routines`)).toBe(0);
    expect(await count(`sp_routine_logs`)).toBe(0);
  });
});
