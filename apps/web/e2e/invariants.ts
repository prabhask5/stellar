// UX invariants: things that must be true of ANY screen, whatever the test was about.
// They run automatically at the end of every e2e test (see the `page` fixture in
// helpers.ts) on whatever is on screen at that moment, and on demand with
// `expectInvariants(page)`. Each rule exists because a real bug got past tests that only
// asserted what they were written for:
//
//  - a navigation animation that never finished left an invisible layer over the page;
//  - a screen-reader-only table caption was painted outside its card;
//  - a row of chips that scrolls sideways could also be dragged up and down;
//  - a picker scrolled inside a popover that scrolled as well (two scrollbars);
//  - sheets were see-through, with the buttons behind them showing.
import { expect, type Page } from "@playwright/test";

/** Runs in the page. Returns one line per problem; an empty list means the screen is sound. */
export function findProblems(): string[] {
  const out: string[] = [];
  const style = (el: Element) => getComputedStyle(el);
  const shown = (el: Element) => {
    const r = el.getBoundingClientRect();
    const cs = style(el);
    return r.width > 1 && r.height > 1 && cs.visibility === "visible" && cs.display !== "none";
  };
  const name = (el: Element) =>
    `${el.tagName.toLowerCase()}${el.getAttribute("data-testid") ? `[${el.getAttribute("data-testid")}]` : ""} "${(el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40)}"`;
  const scrollsY = (el: Element) =>
    /auto|scroll/.test(style(el).overflowY) && el.scrollHeight > el.clientHeight + 1;
  const dialogOpen = document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]');

  // 1. Nothing invisible sits on top of the page: a visible navigation link can be hit.
  if (!dialogOpen && !document.querySelector("[data-locked], [data-testid='lock-screen']")) {
    const link = [...document.querySelectorAll('nav[aria-label="Main"] a')].find((a) => {
      const r = a.getBoundingClientRect();
      return shown(a) && r.top >= 0 && r.bottom <= innerHeight && !a.closest("[inert]");
    });
    if (link) {
      const r = link.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (hit && !link.contains(hit) && !hit.closest('nav[aria-label="Main"]'))
        out.push(
          `the page is covered: a tap on "${link.textContent?.trim()}" would land on ${name(hit)}`,
        );
    }
  }

  // 2. Text stays inside its card. Checked by hit-testing the part that sticks out, so
  //    text that is clipped or scrolled away (and so not actually visible there) passes.
  for (const card of document.querySelectorAll(".glass, .glass-strong, .sp-sheet")) {
    if (!shown(card)) continue;
    const c = card.getBoundingClientRect();
    for (const el of card.querySelectorAll(
      "p, span, caption, h1, h2, h3, li, dt, dd, label, td, th",
    )) {
      if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent?.trim())) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      const below = r.bottom > c.bottom + 2;
      const right = r.right > c.right + 2;
      if (!below && !right) continue;
      const x = right ? r.right - 2 : r.left + Math.min(r.width / 2, 8);
      const y = below ? r.bottom - 2 : r.top + r.height / 2;
      if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue;
      const hit = document.elementFromPoint(x, y);
      if (hit && (hit === el || el.contains(hit)))
        out.push(`text is outside its card: ${name(el)}`);
    }
  }

  // 3. A row that scrolls sideways does not also scroll up and down.
  for (const el of document.querySelectorAll("*")) {
    const cs = style(el);
    if (!/auto|scroll/.test(cs.overflowX) || el.scrollWidth <= el.clientWidth + 1) continue;
    if (el.clientHeight > 120 || !shown(el)) continue; // a row, not a pane
    if (scrollsY(el)) out.push(`a sideways scroller also scrolls vertically: ${name(el)}`);
  }

  // 4. One scrollbar at most inside a dialog, sheet or popover.
  for (const root of document.querySelectorAll(
    '[role="dialog"], [data-radix-popper-content-wrapper]',
  )) {
    for (const el of root.querySelectorAll("*")) {
      if (!scrollsY(el) || !shown(el)) continue;
      for (let p = el.parentElement; p && root.contains(p); p = p.parentElement)
        if (scrollsY(p)) out.push(`two nested scrollbars: ${name(el)} inside ${name(p)}`);
    }
  }

  // 5. Sheets and dialogs hide what is behind them.
  for (const el of document.querySelectorAll(".sp-sheet")) {
    if (!shown(el)) continue;
    const parts = /rgba?\(([^)]+)\)/.exec(style(el).backgroundColor)?.[1]?.split(",") ?? [];
    const alpha = parts.length === 4 ? Number(parts[3]) : 1;
    if (alpha < 0.95) out.push(`a sheet is see-through (alpha ${alpha})`);
  }
  return [...new Set(out)];
}

/** Asserts the invariants on the current screen. */
export async function expectInvariants(page: Page, where = "this screen"): Promise<void> {
  expect(await page.evaluate(findProblems), `UX invariants on ${where}`).toEqual([]);
}

/**
 * Clicks, then proves the page did not freeze: within a second the next frame is painted
 * and the main thread answers. A navigation that hangs fails here, not minutes later.
 */
export async function expectStillResponsive(page: Page): Promise<void> {
  const answered = await Promise.race([
    page.evaluate(
      () =>
        new Promise<boolean>((resolve) =>
          requestAnimationFrame(() => setTimeout(() => resolve(true), 0)),
        ),
    ),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 1500)),
  ]);
  expect(answered, "the page stopped painting or answering").toBe(true);
}
