// Flows found by hand testing, exercised the way a person does them: with animations
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
  swipe,
  test,
  wipeData,
} from "./support/helpers";
import { expectInvariants, expectStillResponsive } from "./support/invariants";

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
    const sheet = page.getByRole("dialog");
    const openAndTime = async (): Promise<number> => {
      await page.evaluate(() => {
        const w = window as unknown as { __sheet?: { down: number; rest: number } };
        w.__sheet = undefined;
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
      await expect(sheet).toBeVisible();
      const timing = await page.waitForFunction(() => {
        const t = (window as unknown as { __sheet?: { down: number; rest: number } }).__sheet;
        return t && t.rest ? Math.round(t.rest - t.down) : null;
      });
      return (await timing.jsonValue()) as number;
    };
    // Three opens, judged by the fastest. What this guards against is a delay built into
    // opening (it was 530 ms in Chromium and 720–920 ms in WebKit), which is there every
    // time; one slow sample only says the machine was busy for a moment.
    const samples: number[] = [];
    for (let i = 0; i < 3; i++) {
      if (i > 0) {
        await page.keyboard.press("Escape");
        await expect(sheet).toBeHidden();
      }
      samples.push(await openAndTime());
    }
    // The animation is about 0.2 s. Playwright's WebKit paints at half the frame rate, so
    // it gets a wider budget.
    expect(
      Math.min(...samples),
      `milliseconds from click to a sheet at rest, fastest of ${samples.join(", ")}`,
    ).toBeLessThan(browserName === "webkit" ? 700 : 500);
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

  test("the emoji picker opens in place, with one scrollbar and whole rows", async ({
    page,
  }, info) => {
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
    // On a phone the sheet is still sliding its last pixels into place when the field appears.
    if (isPhone(info.project.name)) await page.waitForTimeout(300);
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

  test("in a short window the emoji picker opens on one side and stays there", async ({
    page,
  }, info) => {
    test.skip(isTouch(info.project.name), "phones show the picker in a sheet");
    // Too short for the whole picker under the tile: it used to open above, then jump below.
    // The case from QA: Edit list on a laptop-sized window, picker under a centred dialog.
    await page.setViewportSize({ width: 1440, height: 690 });
    await sql(
      `insert into sp_task_lists (user_id, name, emoji) values (${OWNER}, 'Groceries', '🛒')`,
    );
    // Emoji data that takes a moment, as on a real connection: the picker shows its
    // loading state first, which is when it used to sit on the wrong side.
    await page.route("**/emoji/**", async (route) => {
      await new Promise((r) => setTimeout(r, 500));
      await route.continue();
    });
    await page.goto("/tasks");
    await page.getByTestId("task-lists").filter({ visible: true }).getByText("Groceries").click();
    await page.getByRole("button", { name: "Edit list" }).click();
    const tile = page.getByRole("button", { name: /emoji/i }).first();
    await expect(tile).toBeVisible();
    await page.waitForTimeout(400);
    // Every frame from the click on: where the picker is.
    await page.evaluate(() => {
      const seen: number[][] = [];
      (window as unknown as { __frames: number[][] }).__frames = seen;
      const tick = () => {
        const el = document.querySelector("[data-radix-popper-content-wrapper]");
        if (el) {
          const r = el.getBoundingClientRect();
          // Radix parks the popover far off screen until it has been placed.
          if (r.top > -1000) seen.push([Math.round(r.top), Math.round(r.height)]);
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    for (let round = 0; round < 3; round++) {
      await tile.click();
      await expect(page.getByRole("gridcell").first()).toBeVisible();
      await page.waitForTimeout(300);
      await page.keyboard.press("Escape");
      await expect(page.getByLabel("Search emoji")).toHaveCount(0);
    }
    const frames = await page.evaluate(
      () => (window as unknown as { __frames: number[][] }).__frames,
    );
    expect(frames.length).toBeGreaterThan(3);
    // A pixel of rounding is fine; changing sides or size is not.
    const spread = (i: number) =>
      Math.max(...frames.map((f) => f[i]!)) - Math.min(...frames.map((f) => f[i]!));
    const seen = [...new Set(frames.map((f) => f.join("x")))].join(" ");
    expect(spread(0), `the picker moved: ${seen}`).toBeLessThanOrEqual(2);
    expect(spread(1), `the picker changed size: ${seen}`).toBeLessThanOrEqual(2);
    const [top, height] = frames[0]!;
    expect(top! + height!, "the picker runs past the window").toBeLessThanOrEqual(690);
    expect(top!).toBeGreaterThanOrEqual(0);
  });

  test("on a phone the emoji picker fills its sheet and scrolls through every emoji", async ({
    page,
  }, info) => {
    test.skip(!isPhone(info.project.name), "the sheet is the phone layout");
    await page.goto("/goals");
    await page.getByRole("button", { name: "New goal list" }).click();
    await page.getByRole("button", { name: /^Emoji/ }).click();
    await expect(page.getByRole("gridcell").first()).toBeVisible();
    await page.waitForTimeout(400);
    const grid = page.locator("[frimousse-viewport]");
    const box = (await grid.boundingBox())!;
    const screen = page.viewportSize()!;
    // The grid runs to the bottom of the sheet (it used to stop at 440px, leaving half empty).
    expect(screen.height - (box.y + box.height), "empty space under the grid").toBeLessThan(60);
    // Dragging up on the grid scrolls it; the sheet used to take the gesture and nothing moved.
    const sheetTop = () =>
      page.getByRole("dialog", { name: "Choose an emoji" }).evaluate((el) => {
        return Math.round(el.getBoundingClientRect().top);
      });
    const before = await sheetTop();
    await swipe(page, { x: box.x + box.width / 2, y: box.y + box.height * 0.7 }, 0, -260, 10);
    await page.waitForTimeout(400);
    if (info.project.name === "iphone-15-pro" || info.project.name === "iphone-se")
      expect(await grid.evaluate((el) => el.scrollTop), "the grid did not scroll").toBeGreaterThan(
        100,
      );
    expect(await sheetTop(), "the sheet moved instead of the grid").toBe(before);
    await expectInvariants(page, "the emoji sheet");
  });

  test("a goal taken past its total laps its bar: colour, stars and the real percentage", async ({
    page,
  }) => {
    await sql(
      `with l as (insert into sp_goal_lists (user_id, name, emoji) values (${OWNER}, 'Reading', '📚') returning id)
       insert into sp_goals (user_id, list_id, name, type, current_amount, total_amount, unit)
       select ${OWNER}, id, v.name, 'progress', v.cur, 10, 'pages' from l,
         (values ('Under', 5, 1), ('Beyond', 15, 2), ('Stellar', 25, 3), ('Supernova', 40, 4)) as v(name, cur, ord)`,
    );
    await page.goto("/goals");
    await page.getByText("Reading").first().click();
    const bar = (name: string) => page.getByRole("progressbar", { name: `${name} progress` });
    await expect(bar("Under")).not.toHaveAttribute("data-over");
    await expect(bar("Under").getByTestId("over-badge")).toHaveCount(0);
    // One lap past the goal per 100%, capped at three times it.
    const wide = page.viewportSize()!.width >= 768;
    for (const [name, tier, percent] of [
      ["Beyond", "1", "150%"],
      ["Stellar", "2", "250%"],
      ["Supernova", "3", "300%"],
    ] as const) {
      await expect(bar(name)).toHaveAttribute("data-over", tier);
      // A desktop row names the lap; a phone shows the number alone.
      await expect(bar(name).getByTestId("over-badge")).toHaveText(
        wide ? `${name} · ${percent}` : percent,
        { useInnerText: true },
      );
      await expect(bar(name).locator(".sp-over__star")).toHaveCount(Number(tier));
    }
    const colours = await Promise.all(
      ["Beyond", "Stellar", "Supernova"].map((n) =>
        bar(n)
          .getByTestId("over-badge")
          .evaluate((el) => getComputedStyle(el).color),
      ),
    );
    expect(new Set(colours).size, colours.join(" ")).toBe(3);
    // Not every goal is complete, so the list itself is not past 100%.
    await expect(bar("Reading")).not.toHaveAttribute("data-over");
    await sql(`update sp_goals set current_amount = 10 where name = 'Under'`);
    await page.reload();
    // (100 + 150 + 250 + 300) / 4 = 200%: the list is on its second lap.
    await expect(bar("Reading")).toHaveAttribute("data-over", "2");
    await expectInvariants(page, "goals past their totals");
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
    // Each kind of phase has its own colour.
    const hues = await page
      .locator('[data-testid="phase-strip"] [data-step]')
      .evaluateAll((els) =>
        Object.fromEntries(
          els.map((e) => [
            e.getAttribute("data-step"),
            getComputedStyle(e).backgroundColor.replace(/\s*\/.*|,[^,]*\)$/, ""),
          ]),
        ),
      );
    expect(new Set(Object.values(hues)).size, JSON.stringify(hues)).toBe(3);
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
    // The control is as wide as its value, not as its longest option, so the row's title and
    // caption beside it keep their room.
    const row = await zone.evaluate((el) => {
      const title = [...el.closest("label, div.flex")!.querySelectorAll("span")].find(
        (s) => s.textContent === "Time zone",
      )!;
      return {
        control: el.getBoundingClientRect().width,
        titleCut: title.scrollWidth > title.clientWidth,
        titleWidth: title.getBoundingClientRect().width,
      };
    });
    expect(row.titleCut, "the row title is cut off").toBe(false);
    expect(row.control, "the select is wider than its value needs").toBeLessThan(230);
    expect(row.titleWidth, "the title and caption are squeezed").toBeGreaterThan(110);
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
