// A sweep over every screen and sheet with a realistic data set (tests/support/seed.ts).
// Each one must open, fit the viewport without sideways overflow, keep its controls
// unselectable, and have no serious or critical accessibility violation (axe-core).
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { seed } from "../support/seed";
import {
  ensureConfigured,
  expect,
  isPhone,
  listsInTab,
  signIn,
  sql,
  test,
  wipeData,
} from "./support/helpers";

/** Checks the screen that is showing and returns one line per problem. */
async function problemsOn(page: Page, screen: string, axe: boolean): Promise<string[]> {
  // Let the sheet or page that just opened settle.
  await page.waitForTimeout(700);
  const facts = await page.evaluate(() => {
    const vw = window.innerWidth;
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return (
        r.width > 0 &&
        r.height > 0 &&
        cs.visibility !== "hidden" &&
        cs.display !== "none" &&
        r.bottom > 0 &&
        r.top < window.innerHeight * 3
      );
    };
    const label = (el: Element) =>
      (
        el.getAttribute("aria-label") ||
        (el as HTMLElement).innerText ||
        el.getAttribute("placeholder") ||
        el.tagName
      )
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, 50);
    const interactive = [
      ...document.querySelectorAll(
        'a[href], button, [role="button"], [role="radio"], [role="switch"], [role="checkbox"], [role="tab"], [role="option"], [role="gridcell"], select, input:not([type="hidden"])',
      ),
    ].filter(
      (el) =>
        visible(el) &&
        !(el as HTMLButtonElement).disabled &&
        el.getAttribute("aria-hidden") !== "true" &&
        !el.closest('[aria-hidden="true"]'),
    );
    const overflow = [...document.querySelectorAll("body *")]
      .filter((el) => visible(el) && !el.closest(".sp-sky, .sp-universe, .sp-events"))
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.right > vw + 1 || r.left < -1)
      .filter(({ el }) => {
        // Content inside a horizontal scroller, or clipped by its container, is fine.
        for (let p = el.parentElement; p; p = p.parentElement) {
          const o = getComputedStyle(p).overflowX;
          if (o === "auto" || o === "scroll" || o === "hidden" || o === "clip") return false;
        }
        return true;
      })
      .slice(0, 8)
      .map(
        ({ el, r }) =>
          `${el.tagName.toLowerCase()}.${String((el as HTMLElement).className).slice(0, 40)} right=${Math.round(r.right)} vw=${vw}`,
      );
    const selectable = interactive
      .filter((el) => !/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName))
      .filter((el) => {
        const cs = getComputedStyle(el) as CSSStyleDeclaration & { webkitUserSelect?: string };
        return (cs.userSelect || cs.webkitUserSelect) !== "none";
      })
      .slice(0, 8)
      .map(label);
    return { docOverflow: document.documentElement.scrollWidth - vw, overflow, selectable };
  });
  const out: string[] = [];
  if (facts.docOverflow > 1) out.push(`${screen}: the page is ${facts.docOverflow}px too wide`);
  for (const el of facts.overflow) out.push(`${screen}: overflows sideways: ${el}`);
  for (const name of facts.selectable) out.push(`${screen}: selectable control "${name}"`);
  if (axe) {
    const res = await new AxeBuilder({ page }).exclude(".sp-sky").exclude(".sp-universe").analyze();
    for (const v of res.violations)
      if (v.impact === "serious" || v.impact === "critical")
        out.push(
          `${screen}: axe ${v.impact} ${v.id} (${v.help}) at ${v.nodes
            .slice(0, 4)
            .map((n) => n.target.join(" "))
            .join(", ")}`,
        );
  }
  return out;
}

test.describe("screens", () => {
  test.beforeAll(async ({ request }) => {
    await ensureConfigured(request);
    await wipeData();
    await sql(`update sp_settings set birthdate = '1996-04-12'`);
    await seed();
  });
  test.beforeEach(async ({ context }) => {
    await signIn(context);
  });

  test("every screen and sheet", async ({ page }, info) => {
    test.setTimeout(300_000);
    const problems: string[] = [];
    const phone = isPhone(info.project.name);
    // axe-core crashes the Playwright Firefox page as soon as a sheet is open (the same
    // screens open and close without trouble in the rest of the Firefox suite). The DOM axe
    // checks is the same in every engine, so the other projects cover it.
    const axeHere = info.project.name !== "firefox-desktop";
    // A screen that fails to open is reported with its name and the sweep moves on, so one
    // run lists every problem instead of stopping at the first.
    const step = async (screen: string, open: () => Promise<void>) => {
      try {
        await open();
        problems.push(...(await problemsOn(page, screen, axeHere)));
      } catch (err) {
        problems.push(`${screen}: did not open: ${String(err).split("\n")[0]}`);
      }
      await page.keyboard.press("Escape").catch(() => {});
      await page.waitForTimeout(300);
    };

    await step("home", async () => {
      await page.goto("/");
      await expect(page.getByTestId("today-card")).toBeVisible();
    });
    await step("tasks/today", async () => {
      await page.goto("/tasks");
      await expect(page.getByTestId("today-tab")).toBeVisible();
    });
    await step("tasks/task-sheet", async () => {
      await page
        .getByRole("button", { name: /^Edit / })
        .first()
        .click();
      await expect(page.getByTestId("task-sheet")).toBeVisible();
    });
    await step("tasks/date-picker", async () => {
      await page
        .getByRole("button", { name: /Due date/ })
        .first()
        .click();
      await expect(page.getByRole("button", { name: "Tomorrow", exact: true })).toBeVisible();
    });
    await step("tasks/all", async () => {
      await page.goto("/tasks");
      await page.getByRole("radio", { name: "All", exact: true }).click();
      await expect(page.getByTestId("all-tab")).toBeVisible();
    });
    await step("tasks/calendar", async () => {
      await page.getByRole("radio", { name: "Calendar", exact: true }).click();
      await page.waitForTimeout(500);
    });
    await step("tasks/lists", async () => {
      if (listsInTab(info.project.name))
        await page.getByRole("radio", { name: "Lists", exact: true }).click();
      await expect(page.getByTestId("list-card").first()).toBeVisible();
    });
    await step("tasks/new-list-sheet", async () => {
      await page
        .getByTestId("task-lists")
        .filter({ visible: true })
        .getByRole("button", { name: "New task list" })
        .click();
      await expect(page.getByRole("dialog")).toBeVisible();
    });
    await step("tasks/emoji-picker", async () => {
      await page
        .getByTestId("task-lists")
        .filter({ visible: true })
        .getByRole("button", { name: "New task list" })
        .click();
      await page.getByRole("button", { name: /^Emoji/ }).click();
      await expect(page.getByLabel("Search emoji")).toBeVisible();
    });
    await step("tasks/list-detail", async () => {
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: /^Open A list with/ }).click();
      await expect(page.getByTestId("list-detail")).toBeVisible();
    });
    await step("goals", async () => {
      await page.goto("/goals");
      await expect(page.getByTestId("goal-list-card").first()).toBeVisible();
    });
    await step("goals/list-detail", async () => {
      await page.getByRole("button", { name: /^Open Money/ }).click();
      await expect(page.getByTestId("goal-list-detail")).toBeVisible();
    });
    await step("goals/goal-sheet", async () => {
      await page
        .getByTestId("goal-list-detail")
        .getByRole("button", { name: "Add goal" })
        .first()
        .click();
      await expect(page.getByTestId("goal-sheet")).toBeVisible();
    });
    await step("routines", async () => {
      await page.goto("/routines");
      await expect(page.getByTestId("month-calendar")).toBeVisible();
    });
    await step("routines/manage+sheet", async () => {
      await page.getByRole("button", { name: /Manage routines/ }).click();
      await page.getByRole("button", { name: "Add routine" }).click();
      await expect(page.getByTestId("routine-sheet")).toBeVisible();
    });
    await step("focus", async () => {
      await page.goto("/focus");
      await expect(page.getByTestId("timer-clock")).toBeVisible();
    });
    await step("focus/settings-sheet", async () => {
      await page
        .getByRole("button", { name: /settings/i })
        .first()
        .click();
      await expect(page.getByRole("dialog")).toBeVisible();
    });
    await step("focus/block-lists", async () => {
      await page.getByRole("button", { name: "Edit lists" }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
    });
    await step("settings", async () => {
      await page.goto("/settings");
      await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
    });
    if (!phone)
      await step("command-bar", async () => {
        await page.keyboard.press("ControlOrMeta+k");
        await expect(page.getByRole("combobox", { name: "Command" })).toBeVisible();
      });
    await step("lock", async () => {
      await page.context().clearCookies();
      await page.goto("/lock");
      await expect(page.getByRole("heading", { name: "Enter your PIN" })).toBeVisible();
    });

    expect(problems, "problems found on the sweep").toEqual([]);
  });
});
