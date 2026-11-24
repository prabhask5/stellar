// Flows from the owner's QA rounds, exercised the way a person does them: with animations
// on, by clicking through, and then checking that the app is still usable afterwards.
// Every test here is a bug that reached a human once. Screen-wide rules that apply
// everywhere live in invariants.ts and run after every test in the suite.
import type { Page } from "@playwright/test";
import {
  ensureConfigured,
  expect,
  isPhone,
  isTouch,
  listsInTab,
  signIn,
  sql,
  test,
  wipeData,
} from "./helpers";
import { expectInvariants, expectStillResponsive } from "./invariants";

const OWNER = "(select id from auth.users where email = 'owner@stellar.local')";

/** Everything the page throws while a test runs; an uncaught error is a failure. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => {
    // WebKit reports prefetches cancelled by a navigation as errors; they are not ours.
    if (!/access control checks|Load failed/.test(String(e))) errors.push(String(e).slice(0, 200));
  });
  return errors;
}

test.describe("ux flows", () => {
  test.beforeAll(async ({ request }) => {
    await ensureConfigured(request);
  });
  test.beforeEach(async ({ context }) => {
    await wipeData();
    await signIn(context);
  });

  test("opening and leaving a task list leaves the app usable", async ({ page }, info) => {
    const errors = watchErrors(page);
    await sql(
      `with l as (insert into sp_task_lists (user_id, name, emoji) values (${OWNER}, 'Groceries', '🛒') returning id)
       insert into sp_tasks (user_id, name, list_id) select ${OWNER}, 'Milk', id from l`,
    );
    await page.goto("/tasks");
    if (listsInTab(info.project.name))
      await page.getByRole("radio", { name: "Lists", exact: true }).click();
    const lists = page.getByTestId("task-lists").filter({ visible: true });

    for (let round = 0; round < 2; round++) {
      await lists
        .getByRole("button", { name: /Groceries/ })
        .first()
        .click();
      await expect(page.getByTestId("list-detail")).toBeVisible();
      await expect(page.getByTestId("list-detail")).toContainText("Milk");
      await expect(page).toHaveURL(/list=/);
      await expectStillResponsive(page);
      await expectInvariants(page, "an open task list");

      await page.getByRole("button", { name: "Back to tasks" }).click();
      await expect(page.getByTestId("list-detail")).toHaveCount(0);
      await expect(page).not.toHaveURL(/list=/);
      await expect(lists.getByRole("button", { name: /Groceries/ }).first()).toBeVisible();
      await expectStillResponsive(page);
      await expectInvariants(page, "the task lists after going back");
    }
    // Still a working app: another screen opens.
    await page.goto("/goals");
    await expect(page.getByRole("heading", { name: "Goals", level: 1 })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("opening and leaving a goal list leaves the app usable", async ({ page }) => {
    const errors = watchErrors(page);
    await sql(
      `with l as (insert into sp_goal_lists (user_id, name, emoji) values (${OWNER}, 'Health', '💪') returning id)
       insert into sp_goals (user_id, list_id, name, type) select ${OWNER}, id, 'Stretch', 'todo' from l`,
    );
    await page.goto("/goals");
    for (let round = 0; round < 2; round++) {
      await page.getByRole("button", { name: /^Open Health/ }).click();
      await expect(page.getByTestId("goal-list-detail")).toBeVisible();
      await expect(page.getByTestId("goal-list-detail")).toContainText("Stretch");
      await expectStillResponsive(page);
      await expectInvariants(page, "an open goal list");

      await page.getByRole("button", { name: "Back to goals" }).click();
      await expect(page.getByTestId("goal-list-detail")).toHaveCount(0);
      await expect(page.getByRole("button", { name: /^Open Health/ })).toBeVisible();
      await expectStillResponsive(page);
      await expectInvariants(page, "the goal lists after going back");
    }
    expect(errors).toEqual([]);
  });

  test("a sheet is solid, arrives quickly, and holds one scrollbar", async ({
    page,
    browserName,
  }) => {
    await page.goto("/goals");
    // The sheet's code is fetched when the browser is idle after load; a person clicks later
    // than that, so let it arrive and time the animation itself.
    await page.waitForTimeout(3000);
    // Timed inside the page, frame by frame: from the click to the sheet standing still.
    await page.evaluate(() => {
      const w = window as unknown as { __sheet?: { down: number; rest: number } };
      addEventListener(
        "pointerdown",
        () => {
          const t = { down: performance.now(), rest: 0 };
          w.__sheet = t;
          let last = "";
          let still = 0;
          const tick = () => {
            const el = document.querySelector('[role="dialog"]');
            const r = el?.getBoundingClientRect();
            const now = r
              ? `${r.top.toFixed(1)}:${r.height.toFixed(1)}:${getComputedStyle(el!).opacity}`
              : "";
            still = now && now === last ? still + 1 : 0;
            last = now;
            if (still >= 3) t.rest = performance.now();
            else requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        },
        { once: true, capture: true },
      );
    });
    await page.getByRole("button", { name: "New goal list" }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    const timing = await page.waitForFunction(() => {
      const t = (window as unknown as { __sheet?: { down: number; rest: number } }).__sheet;
      return t && t.rest ? Math.round(t.rest - t.down) : null;
    });
    // The animation is about 0.2 s. Playwright's WebKit paints at half the frame rate, so
    // it gets a wider budget; before the fix this was 720–920 ms there and 530 ms in Chromium.
    expect(await timing.jsonValue(), "milliseconds from click to a sheet at rest").toBeLessThan(
      browserName === "webkit" ? 700 : 500,
    );
    expect(
      await sheet.evaluate((el) => {
        const cs = getComputedStyle(el);
        const filter =
          cs.backdropFilter ||
          (cs as unknown as { webkitBackdropFilter?: string }).webkitBackdropFilter;
        return { background: cs.backgroundColor, filter: filter || "none" };
      }),
    ).toEqual({ background: "rgb(22, 18, 50)", filter: "none" });
    await expectInvariants(page, "the new goal list sheet");
  });

  test("the emoji picker opens in place, with one scrollbar and whole rows", async ({ page }) => {
    await page.goto("/goals");
    await page.getByRole("button", { name: "New goal list" }).click();
    await page.getByRole("button", { name: /^Emoji/ }).click();
    const search = page.getByLabel("Search emoji");
    await expect(search).toBeVisible();
    // The picker's frame: it must not move or resize while the emoji load in.
    const frame = () =>
      search.evaluate((el) => {
        const root = el.closest("[data-radix-popper-content-wrapper], [role='dialog']") ?? el;
        const r = root.getBoundingClientRect();
        return [Math.round(r.top), Math.round(r.height)];
      });
    const first = await frame();
    let elapsed = 0;
    for (const pause of [80, 120, 300, 400]) {
      await page.waitForTimeout(pause);
      elapsed += pause;
      expect(await frame(), `picker frame after ${elapsed} ms`).toEqual(first);
    }
    await expect(page.getByRole("gridcell").first()).toBeVisible();
    await expectInvariants(page, "the emoji picker");

    await search.fill("smile");
    await expect(page.getByRole("gridcell").first()).toBeVisible();
    // No row is shorter than the emoji in it (rows used to overlap and cut each other off).
    const clipped = await page.evaluate(() =>
      [...document.querySelectorAll('[role="row"]')]
        .filter((row) => row.querySelector('[role="gridcell"]'))
        .map((row) => {
          const cell = row.querySelector('[role="gridcell"]')!.getBoundingClientRect();
          return Math.round(cell.height - row.getBoundingClientRect().height);
        })
        .filter((d) => d > 1),
    );
    expect(clipped, "emoji rows shorter than their emoji").toEqual([]);
    await expectInvariants(page, "emoji search results");
  });

  test("the timer starts at the full time and only counts down", async ({ page }) => {
    await page.goto("/focus");
    await expect(page.getByTestId("timer-clock")).toHaveText("25:00");
    // Sample every frame from before the click, so a single wrong frame is caught.
    await page.evaluate(() => {
      const seen: string[] = [];
      (window as unknown as { __clock: string[] }).__clock = seen;
      const read = () => {
        const text = document.querySelector('[data-testid="timer-clock"]')?.textContent ?? "";
        if (seen[seen.length - 1] !== text) seen.push(text);
        requestAnimationFrame(read);
      };
      read();
    });
    await page.getByRole("button", { name: "Start focus" }).click();
    await page.waitForTimeout(2600);
    const seen = await page.evaluate(() => (window as unknown as { __clock: string[] }).__clock);
    const seconds = seen.map((t) => {
      const [m, s] = t.split(":").map(Number);
      return (m ?? 0) * 60 + (s ?? 0);
    });
    expect(seen[0]).toBe("25:00");
    expect(Math.max(...seconds), `clock values seen: ${seen.join(" ")}`).toBe(25 * 60);
    expect(seconds, `clock values seen: ${seen.join(" ")}`).toEqual(
      [...seconds].sort((a, b) => b - a),
    );
    expect(seconds[seconds.length - 1]).toBeLessThan(25 * 60);
  });

  test("the Pomodoro cycle shows every phase and where the session is", async ({ page }) => {
    await page.goto("/focus");
    const steps = page.getByTestId("phase-strip").getByRole("listitem");
    // Four rounds by default: focus, short break ×3, then focus, long break.
    await expect(page.locator('[data-testid="phase-strip"] [data-step]')).toHaveCount(8);
    expect(
      await page
        .locator('[data-testid="phase-strip"] [data-step]')
        .evaluateAll((els) => els.map((e) => e.getAttribute("data-step"))),
    ).toEqual([
      "focus",
      "short_break",
      "focus",
      "short_break",
      "focus",
      "short_break",
      "focus",
      "long_break",
    ]);
    await page.getByRole("button", { name: "Start focus" }).click();
    await expect(page.locator('[data-step][data-state="current"]')).toHaveAttribute(
      "data-step",
      "focus",
    );
    await page.getByRole("button", { name: "Skip phase" }).click();
    await expect(page.locator('[data-step][data-state="current"]')).toHaveAttribute(
      "data-step",
      "short_break",
    );
    await expect(page.locator('[data-step][data-state="done"]')).toHaveCount(1);
    await expect(steps.first()).toBeVisible();
  });

  test("focus stats keep their text inside the card", async ({ page }) => {
    await page.goto("/focus");
    await expect(page.getByText("Stats")).toBeVisible();
    await page.getByText("Stats").scrollIntoViewIfNeeded();
    // The table for screen readers is in the DOM but must not be painted.
    const caption = page.locator("caption", { hasText: "Focus minutes per day" });
    await expect(caption).toHaveCount(1);
    expect(
      await caption.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + 2, r.top + r.height / 2);
        return Boolean(hit && (hit === el || el.contains(hit)));
      }),
      "the screen-reader caption is visible on screen",
    ).toBe(false);
    await expectInvariants(page, "focus stats");
  });

  test("settings: chips scroll sideways only, long values are readable", async ({ page }, info) => {
    await page.goto("/settings");
    const nav = page.getByRole("navigation", { name: "Settings sections" });
    await expect(nav).toBeVisible();
    expect(
      await nav.evaluate((el) => ({
        vertical: el.scrollHeight - el.clientHeight,
        overflowY: getComputedStyle(el).overflowY,
      })),
    ).toEqual({ vertical: 0, overflowY: "hidden" });
    const zone = page.getByLabel("Time zone");
    await zone.selectOption("America/Los_Angeles");
    // City first, so the part that tells zones apart survives a narrow row; the tooltip has it all.
    await expect(zone).toHaveAttribute("title", "Los Angeles · America");
    if (isTouch(info.project.name))
      expect(await zone.evaluate((el) => el.getBoundingClientRect().right <= innerWidth)).toBe(
        true,
      );
    await expectInvariants(page, "settings");
  });

  test("every main screen is sound with animations on", async ({ page }, info) => {
    const errors = watchErrors(page);
    await sql(
      `insert into sp_tasks (user_id, name, due_date) select ${OWNER}, 'Task ' || g, sp__today(${OWNER}) from generate_series(1, 12) g`,
    );
    for (const [path, heading] of [
      ["/", null],
      ["/tasks", "Tasks"],
      ["/goals", "Goals"],
      ["/routines", "Routines"],
      ["/focus", "Focus"],
      ["/settings", "Settings"],
    ] as const) {
      await page.goto(path);
      if (heading)
        await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
      await page.waitForTimeout(600);
      await expectStillResponsive(page);
      await expectInvariants(page, path);
      // And half way down, where different cards are on screen.
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight / 2));
      await page.waitForTimeout(200);
      await expectInvariants(page, `${path}, scrolled`);
    }
    if (isPhone(info.project.name))
      await expect(
        page.getByRole("navigation", { name: "Main" }).filter({ visible: true }),
      ).toBeVisible();
    expect(errors).toEqual([]);
  });
});
