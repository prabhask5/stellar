import type { Page } from "@playwright/test";
import { ensureConfigured, expect, isPhone, signIn, sql, test, wipeData } from "./support/helpers";

const OWNER = "(select id from auth.users where email = 'owner@stellar.local')";
// The universe animates, so these tests run with motion allowed.
test.use({ reducedMotion: "no-preference" });

async function seedUniverse(): Promise<void> {
  // Completed tasks become stars, goals planets, routines constellations.
  await sql(
    `insert into sp_tasks (user_id, name, completed, due_date) select ${OWNER}, 'Star ' || g, true, sp__today(${OWNER}) - (g % 40) from generate_series(1, 120) g`,
  );
  await sql(`
    with l as (insert into sp_goal_lists (user_id, name, emoji, sort_order) values
        (${OWNER}, 'Health', '💪', 1), (${OWNER}, 'Career', '💼', 2), (${OWNER}, 'Creative', '🎸', 3) returning id, name)
    insert into sp_goals (user_id, list_id, name, type, total_amount, current_amount, completed)
    select ${OWNER}, l.id, l.name || ' goal ' || g, case when g % 2 = 0 then 'progress' else 'todo' end,
           case when g % 2 = 0 then 10 else null end, case when g % 2 = 0 then g * 2 else 0 end, l.name = 'Health' or g = 1
      from l, generate_series(1, 4) g`);
  await sql(
    `insert into sp_routines (user_id, name, emoji, start_date, sort_order) values (${OWNER}, 'Meditate', '🧘', sp__today(${OWNER}) - 9, 1), (${OWNER}, 'Read', '📚', sp__today(${OWNER}) - 9, 2)`,
  );
  await sql(
    `insert into sp_routine_logs (routine_id, date, user_id, completed) select r.id, d::date, r.user_id, true from sp_routines r, generate_series(sp__today(${OWNER}) - 9, sp__today(${OWNER}) - 1, interval '1 day') d where r.name = 'Meditate' or extract(day from d)::int % 3 = 0`,
  );
}

async function waitForScene(page: Page): Promise<void> {
  await expect(page.locator('.sp-universe[data-ready="true"]')).toBeAttached({ timeout: 30_000 });
  await expect(page.locator("canvas[data-engine], .sp-universe canvas").first()).toBeAttached();
}

/** Sum of alpha on the event layer: zero when nothing is playing. */
const overlayInk = (page: Page) =>
  page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(".sp-events__canvas");
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return -1;
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let sum = 0;
    for (let i = 3; i < data.length; i += 64) sum += data[i] ?? 0;
    return sum;
  });

test.describe("universe", () => {
  test.beforeAll(async ({ request }) => {
    await ensureConfigured(request);
  });
  test.beforeEach(async ({ context }) => {
    await wipeData();
    await signIn(context);
  });

  test("the 3D scene loads after first paint and never blocks the interface", async ({
    page,
    shot,
  }) => {
    await seedUniverse();
    await sql(`update sp_settings set quality_tier = 'balanced'`);
    const requests: string[] = [];
    page.on("request", (r) => r.resourceType() === "script" && requests.push(r.url()));
    await page.goto("/");
    // The interface is usable on the CSS sky straight away.
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      /Good (morning|afternoon|evening|night)/,
    );
    await expect(page.locator(".sp-sky")).toBeAttached();
    await waitForScene(page);

    // three.js is only in chunks fetched lazily, never in the scripts the page's HTML starts with.
    const html = await (await page.request.get("/")).text();
    const initial = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1] as string);
    expect(initial.length).toBeGreaterThan(0);
    const hasThree = async (url: string) =>
      (await (await page.request.get(url)).text()).includes("WebGLRenderer");
    for (const src of initial)
      expect(await hasThree(src), `${src} is in the initial HTML`).toBe(false);
    const lazy = requests.filter((u) => !initial.some((src) => u.endsWith(src)));
    const withThree = [];
    for (const url of lazy) if (await hasThree(url)) withThree.push(url);
    expect(withThree.length).toBeGreaterThan(0);
    await expect(page.locator("html")).toHaveAttribute("data-tier", "balanced");
    await expect(page.locator("html")).toHaveAttribute("data-sky", "3d");
    await page.waitForTimeout(1500);
    await shot("universe-home");
  });

  test("the canvas persists across navigation and dims behind other pages", async ({
    page,
  }, info) => {
    await seedUniverse();
    await sql(`update sp_settings set quality_tier = 'balanced'`);
    await page.goto("/");
    // A first launch starts on Auto until the settings arrive; the chosen tier's canvas is the
    // one that must then survive.
    await expect(page.locator("html")).toHaveAttribute("data-tier", "balanced");
    await waitForScene(page);
    await page.evaluate(() => {
      (
        document.querySelector(".sp-universe canvas") as HTMLCanvasElement & { __mark?: string }
      ).__mark = "same-canvas";
    });
    // Replacing a canvas (here Auto → Balanced) must not start a rebuild loop.
    await page.waitForTimeout(1500);
    await expect(page.locator(".sp-universe")).toHaveAttribute("data-mode", "home");

    await page
      .getByRole("navigation", { name: "Main" })
      .filter({ visible: true })
      .getByRole("link", { name: "Tasks" })
      .click();
    await expect(page.getByRole("heading", { name: "Tasks", level: 1 })).toBeVisible();
    await expect(page.locator(".sp-universe")).toHaveAttribute("data-mode", "page");
    await page
      .getByRole("navigation", { name: "Main" })
      .filter({ visible: true })
      .getByRole("link", { name: "Focus" })
      .click();
    await expect(page.getByRole("heading", { name: "Focus", level: 1 })).toBeVisible();
    await page
      .getByRole("navigation", { name: "Main" })
      .filter({ visible: true })
      .getByRole("link", { name: "Universe" })
      .click();
    await expect(page.locator(".sp-universe")).toHaveAttribute("data-mode", "home");
    expect(
      await page.evaluate(
        () =>
          (document.querySelector(".sp-universe canvas") as HTMLCanvasElement & { __mark?: string })
            .__mark,
      ),
    ).toBe("same-canvas");

    // The canvas takes no pointer input; the stage does, and it shows a label for what is under the pointer.
    expect(
      await page.evaluate(
        () => getComputedStyle(document.querySelector(".sp-universe") as Element).pointerEvents,
      ),
    ).toBe("none");
    if (!isPhone(info.project.name)) {
      const stage = page.locator("[data-universe-stage]");
      const box = (await stage.boundingBox())!;
      // Ask the scene where its planets are right now, and hover one that is inside the stage.
      const target = await page.waitForFunction(
        (b) => {
          const u = (
            window as Window & {
              __stellarUniverse?: { screenTargets: { kind: string; x: number; y: number }[] };
            }
          ).__stellarUniverse;
          return (
            u?.screenTargets.find(
              (t) =>
                t.kind === "planet" &&
                t.x > b.x + 30 &&
                t.x < b.x + b.width - 30 &&
                t.y > b.y + 30 &&
                t.y < b.y + b.height - 30,
            ) ?? null
          );
        },
        box,
        { timeout: 15_000 },
      );
      const { x, y } = (await target.jsonValue()) as { x: number; y: number };
      await page.mouse.move(x - 3, y - 3);
      await page.mouse.move(x, y);
      await expect(page.getByTestId("universe-label")).toBeVisible();
      await expect(page.getByTestId("universe-label")).toContainText(/%|Complete|streak|Streak/);
    }
  });

  test("completing tasks plays one coalesced ignition that never blocks input, then clears", async ({
    page,
  }) => {
    await sql(
      `insert into sp_tasks (user_id, name, due_date) select ${OWNER}, 'Task ' || g, sp__today(${OWNER}) from generate_series(1, 3) g`,
    );
    await sql(`update sp_settings set quality_tier = 'balanced'`);
    await page.goto("/");
    await waitForScene(page);
    await expect(page.getByTestId("event-overlay")).toBeAttached();
    expect(await overlayInk(page)).toBe(0);
    expect(
      await page.evaluate(
        () => getComputedStyle(document.querySelector(".sp-events") as Element).pointerEvents,
      ),
    ).toBe("none");

    const card = page.getByTestId("today-card");
    await card.getByRole("checkbox", { name: "Complete “Task 1”" }).click();
    // The effect starts on the next animation frame; how soon that is depends on the engine.
    await expect
      .poll(() => overlayInk(page), { timeout: 1500, intervals: [30] })
      .toBeGreaterThan(0);
    // Taps keep working while the event plays.
    await card.getByRole("checkbox", { name: "Complete “Task 2”" }).click();
    await card.getByRole("checkbox", { name: "Complete “Task 3”" }).click();
    await expect(page.getByText("3 tasks completed")).toBeVisible();
    await expect.poll(() => overlayInk(page), { timeout: 8000 }).toBe(0);
  });

  test("Minimal and reduced motion keep a static sky and swap events for a soft glow", async ({
    page,
    browser,
    baseURL,
  }, info) => {
    await sql(
      `insert into sp_tasks (user_id, name, due_date) values (${OWNER}, 'Quiet task', sp__today(${OWNER}))`,
    );
    await sql(`update sp_settings set quality_tier = 'minimal'`);
    await page.goto("/");
    await expect(page.getByTestId("event-overlay")).toBeAttached({ timeout: 15_000 });
    await expect(page.locator("html")).toHaveAttribute("data-tier", "minimal");
    await expect(page.locator(".sp-universe canvas")).toHaveCount(0);
    await expect(page.locator("html")).toHaveAttribute("data-sky", "css");
    expect(
      await page.evaluate(
        () => getComputedStyle(document.querySelector(".sp-sky__nebula") as Element).animationName,
      ),
    ).toBe("none");
    await page
      .getByTestId("today-card")
      .getByRole("checkbox", { name: "Complete “Quiet task”" })
      .click();
    await expect
      .poll(() => overlayInk(page), { timeout: 1500, intervals: [20] })
      .toBeGreaterThan(0);
    // The glow lasts under half a second.
    await expect.poll(() => overlayInk(page), { timeout: 3000 }).toBe(0);

    // Auto with reduced motion resolves to Minimal.
    await sql(`update sp_settings set quality_tier = 'auto'`);
    const reduced = await browser.newContext({
      ...info.project.use,
      baseURL,
      reducedMotion: "reduce",
    });
    await signIn(reduced);
    const p2 = await reduced.newPage();
    await p2.goto("/");
    await expect(p2.getByTestId("event-overlay")).toBeAttached({ timeout: 15_000 });
    await expect(p2.locator("html")).toHaveAttribute("data-tier", "minimal");
    await expect(p2.locator(".sp-universe canvas")).toHaveCount(0);
    await reduced.close();
  });
});
