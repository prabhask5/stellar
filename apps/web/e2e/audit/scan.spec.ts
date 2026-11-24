// POLISH_SPEC §2.1 / §2.3: measuring sweep over every screen and sheet with the
// realistic seed. Collects axe violations, horizontal overflow, touch targets under
// 44px and native-feel CSS facts into docs/polish/data/scan-<project>.json.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { seedPolish } from "../seed-polish";
import {
  ensureConfigured,
  expect,
  isPhone,
  listsInTab,
  signIn,
  sql,
  test,
  wipeData,
} from "../helpers";

const OUT = path.resolve(import.meta.dirname, "../../../../docs/polish/data");

interface Finding {
  screen: string;
  kind: string;
  detail: unknown;
}

async function measure(page: Page, screen: string, out: Finding[], axe = true): Promise<void> {
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
    // A control's touch target is its box or, where it has one, its extended ::after hit area.
    const target = (el: Element) => {
      const r = el.getBoundingClientRect();
      const after = getComputedStyle(el, "::after");
      if (after.content === "none" || after.position !== "absolute") return r;
      return {
        width: Math.max(r.width, parseFloat(after.width) || 0),
        height: Math.max(r.height, parseFloat(after.height) || 0),
      };
    };
    const small = interactive
      .map((el) => ({ el, r: target(el) }))
      .filter(({ r }) => r.width < 43.5 || r.height < 43.5)
      .map(
        ({ el, r }) =>
          `${el.tagName.toLowerCase()}[${label(el)}] ${Math.round(r.width)}×${Math.round(r.height)}`,
      );
    const overflow = [...document.querySelectorAll("body *")]
      .filter((el) => visible(el) && !el.closest(".sp-sky, .sp-universe, .sp-events"))
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.right > vw + 1 || r.left < -1)
      .filter(({ el }) => {
        // Ignore content inside a horizontal scroller.
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
      }).length;
    const callout = interactive.filter((el) => {
      const v = getComputedStyle(el).getPropertyValue("-webkit-touch-callout");
      return v !== "none";
    }).length;
    const smallInputs = [...document.querySelectorAll("input, textarea, select")]
      .filter(visible)
      .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16)
      .map(label);
    const missingHints = [
      ...document.querySelectorAll(
        'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), textarea',
      ),
    ]
      .filter(visible)
      .filter((el) => !el.getAttribute("enterkeyhint") || !el.getAttribute("autocomplete"))
      .map(
        (el) =>
          `${label(el)} [enterkeyhint=${el.getAttribute("enterkeyhint")}, autocomplete=${el.getAttribute("autocomplete")}, inputmode=${el.getAttribute("inputmode")}, autocapitalize=${el.getAttribute("autocapitalize")}]`,
      );
    const blurLayers = [...document.querySelectorAll("body *")].filter((el) => {
      if (!visible(el)) return false;
      const cs = getComputedStyle(el) as CSSStyleDeclaration & { webkitBackdropFilter?: string };
      const v = cs.backdropFilter || cs.webkitBackdropFilter || "none";
      return v !== "none";
    }).length;
    return {
      docOverflow: document.documentElement.scrollWidth - vw,
      small,
      overflow,
      interactive: interactive.length,
      selectable,
      callout,
      smallInputs,
      missingHints,
      blurLayers,
    };
  });
  if (facts.docOverflow > 1 || facts.overflow.length)
    out.push({
      screen,
      kind: "overflow",
      detail: { by: facts.docOverflow, elements: facts.overflow },
    });
  if (facts.small.length)
    out.push({ screen, kind: "touch-target", detail: [...new Set(facts.small)] });
  out.push({
    screen,
    kind: "facts",
    detail: {
      interactive: facts.interactive,
      selectableChrome: facts.selectable,
      calloutNotNone: facts.callout,
      blurLayers: facts.blurLayers,
      smallInputs: facts.smallInputs,
      missingHints: facts.missingHints,
    },
  });
  if (axe) {
    const res = await new AxeBuilder({ page }).exclude(".sp-sky").exclude(".sp-universe").analyze();
    for (const v of res.violations)
      out.push({
        screen,
        kind: `axe:${v.impact}`,
        detail: {
          id: v.id,
          help: v.help,
          nodes: v.nodes.slice(0, 4).map((n) => n.target.join(" ")),
          count: v.nodes.length,
        },
      });
  }
}

test.describe("scan", () => {
  test.beforeAll(async ({ request }) => {
    await ensureConfigured(request);
    await wipeData();
    await sql(`update sp_settings set birthdate = '1996-04-12'`);
    await seedPolish();
  });
  test.beforeEach(async ({ context }) => {
    await signIn(context);
  });

  test("every screen and sheet", async ({ page }, info) => {
    test.setTimeout(300_000);
    const out: Finding[] = [];
    const phone = isPhone(info.project.name);
    // axe-core crashes the Playwright Firefox page as soon as a sheet is open (the same
    // screens open and close without trouble in the Firefox e2e suite, and this scan
    // completes in Firefox without axe). The DOM axe checks is the same in every engine,
    // so the five other projects cover it.
    const axeHere = info.project.name !== "firefox-desktop";
    const step = async (screen: string, fn: () => Promise<void>, axe = true) => {
      try {
        await fn();
        await measure(page, screen, out, axe && axeHere);
      } catch (err) {
        out.push({ screen, kind: "scan-error", detail: String(err).slice(0, 300) });
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
        await expect(page.getByLabel("Command")).toBeVisible();
      });
    await step("lock", async () => {
      await page.context().clearCookies();
      await page.goto("/lock");
      await expect(page.getByRole("heading", { name: "Enter your PIN" })).toBeVisible();
    });

    mkdirSync(OUT, { recursive: true });
    writeFileSync(
      path.join(OUT, `scan-${info.project.name}.json`),
      `${JSON.stringify(out, null, 1)}\n`,
    );
  });
});
