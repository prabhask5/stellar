// The universe: a galaxy drawn behind the app by one WebGL2 renderer (in a worker where the
// browser allows it), and momentary events for what the owner does. These tests read it
// through the hook the app exposes: `window.__stellarUniverse.events()` is the log of
// emitted events, `.probe()` asks the engine what it is doing and what is on its canvas.
import type { BrowserContext, Page } from "@playwright/test";
import {
  ensureConfigured,
  expect,
  isWebKit,
  realtimeChange,
  realtimeReady,
  signIn,
  sql,
  test,
  wipeData,
} from "./support/helpers";

const OWNER = "(select id from auth.users where email = 'owner@stellar.local')";
// The universe animates, so these tests run with motion allowed.
test.use({ reducedMotion: "no-preference" });

interface Probe {
  frames: number;
  state: "live" | "waking" | "still" | "hidden";
  framing: "home" | "focus" | "page";
  judged: boolean;
  pending: boolean;
  software: boolean;
  tier: "high" | "balanced" | "low";
  still: boolean;
  effects: number;
  lit: number;
  path: "worker" | "inline";
}

type Hook = {
  events: () => string[];
  emit: (event: Record<string, unknown>) => void;
  probe: () => Promise<Probe | null>;
  firstFrameMs?: number;
};
/** Inside the page there is only `window`: nothing from this file exists there. */
type W = { __stellarUniverse: Hook };

const events = (page: Page) =>
  page.evaluate(() => [...(window as unknown as W).__stellarUniverse.events()]);
const probe = async (page: Page): Promise<Probe> => {
  const result = await page.evaluate(() => (window as unknown as W).__stellarUniverse.probe());
  if (!result) throw new Error("The universe did not answer.");
  return result;
};
const state = (page: Page) => probe(page).then((p) => p.state);

/** An explicit tier: Auto keeps the sky still where WebGL is drawn in software, as on CI. */
async function setQuality(tier: "cinematic" | "balanced" | "minimal"): Promise<void> {
  await sql(`update sp_settings set quality_tier = '${tier}'`);
}

/**
 * The galaxy is on screen at the tier the test chose. The setting reaches a page a moment
 * after its first frame can (it is fetched, the renderer is not), and changing tier redraws.
 * `null` is for Auto, where the tier is the device's own.
 */
async function galaxyReady(
  page: Page,
  tier: "high" | "balanced" | "low" | null = "balanced",
): Promise<void> {
  await expect(page.locator('.sp-universe[data-ready="true"]')).toBeAttached({ timeout: 30_000 });
  await expect(page.locator(".sp-universe canvas")).toHaveCount(1);
  if (!tier) return;
  await expect(page.locator("html")).toHaveAttribute("data-tier", tier);
  await expect.poll(async () => (await probe(page)).tier).toBe(tier);
}

const nav = (page: Page, name: string) =>
  page
    .getByRole("navigation", { name: "Main" })
    .filter({ visible: true })
    .getByRole("link", { name })
    .click();

/** A still sky draws nothing: the frame count does not move while it is left alone. */
async function expectNoFrames(page: Page): Promise<void> {
  // At rest: still, and the last frame it asked for has been drawn.
  await expect
    .poll(
      async () => {
        const p = await probe(page);
        return p.state === "still" && !p.pending;
      },
      { timeout: 45_000 },
    )
    .toBe(true);
  const { frames } = await probe(page);
  // The idle window is what is being measured here.
  await page.waitForTimeout(1200);
  const after = await probe(page);
  expect(after.frames).toBe(frames);
  expect(after.pending).toBe(false);
}

/** The galaxy is moving: frames keep coming. Software rendering (CI) draws them slowly. */
async function expectLive(page: Page): Promise<void> {
  await expect.poll(() => state(page)).toBe("live");
  const { frames } = await probe(page);
  await expect
    .poll(async () => (await probe(page)).frames, { timeout: 45_000 })
    .toBeGreaterThan(frames + 3);
}

/** Can a worker in this browser draw WebGL2? Asked independently of the app. */
const workerCanDraw = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<boolean>((resolve) => {
        if (typeof OffscreenCanvas === "undefined") return resolve(false);
        if (!("transferControlToOffscreen" in HTMLCanvasElement.prototype)) return resolve(false);
        const source = `postMessage((() => { try { return new OffscreenCanvas(1, 1).getContext("webgl2") !== null; } catch { return false; } })())`;
        const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
        const worker = new Worker(url);
        worker.onmessage = (e) => resolve(e.data === true);
        worker.onerror = () => resolve(false);
      }),
  );

test.describe("universe", () => {
  test.beforeAll(async ({ request }) => {
    await ensureConfigured(request);
  });
  test.beforeEach(async ({ context, page }) => {
    await wipeData();
    await signIn(context);
    // When the galaxy cannot start, the app says why; a failing run should show it.
    page.on("console", (message) => {
      if (message.text().startsWith("[universe]")) console.warn(message.text());
    });
  });

  test("the galaxy appears after first paint, off the main thread, and outside the initial JavaScript", async ({
    page,
    context,
    shot,
  }, info) => {
    await setQuality("balanced");
    await page.goto("/");
    // The interface is usable on the CSS sky straight away.
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      /Good (morning|afternoon|evening|night)/,
    );
    await expect(page.locator(".sp-sky")).toBeAttached();
    await galaxyReady(page);

    // The first frame is a galaxy: the area around its centre is not black.
    const first = await probe(page);
    expect(first.lit).toBeGreaterThan(500);
    expect(first.tier).toBe("balanced");
    expect(first.frames).toBeGreaterThan(0);
    await expect(page.locator("html")).toHaveAttribute("data-tier", "balanced");
    // Once the canvas has faded in, the CSS sky behind it steps back.
    await expect(page.locator("html")).toHaveAttribute("data-sky", "3d");
    await expect(page.locator(".sp-sky")).toBeHidden();

    // From the idle moment the app starts loading the universe to the first galaxy frame:
    // under 600 ms on a desktop. Software rendering (CI) is not a desktop's GPU, so the
    // budget is held wherever the browser has a real one.
    const firstFrame = (p: Page) =>
      p.evaluate(() => (window as unknown as W).__stellarUniverse.firstFrameMs ?? 0);
    const times = [await firstFrame(page)];
    expect(times[0]).toBeGreaterThan(0);
    if (!first.software && info.project.name.includes("desktop")) {
      // One load is one sample on a machine doing other things: the median of three.
      for (let i = 0; i < 2; i++) {
        const again = await context.newPage();
        await again.goto("/");
        await galaxyReady(again);
        times.push(await firstFrame(again));
        await again.close();
      }
      times.sort((a, b) => a - b);
      expect(times[1], `first frame after ${times.map(Math.round).join(", ")} ms`).toBeLessThan(
        600,
      );
    }
    info.annotations.push({
      type: "first galaxy frame",
      description: `${times.map(Math.round).join(", ")} ms`,
    });

    // The engine runs in a worker wherever a worker can draw WebGL2.
    expect(first.path).toBe((await workerCanDraw(page)) ? "worker" : "inline");
    await expect(page.locator(".sp-universe")).toHaveAttribute("data-path", first.path);

    // None of the universe is in the scripts the page's HTML starts with.
    const html = await (await page.request.get("/")).text();
    const initial = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1] as string);
    expect(initial.length).toBeGreaterThan(0);
    for (const src of initial) {
      const code = await (await page.request.get(src)).text();
      expect(/sp-universe__canvas|uFxBloom|WebGLRenderer/.test(code), src).toBe(false);
    }
    await shot("universe-home");
  });

  test("one canvas, live on every page", async ({ page }) => {
    await setQuality("balanced");
    await page.goto("/");
    await galaxyReady(page);
    await expect(page.locator(".sp-universe")).toHaveAttribute("data-mode", "interactive");
    await page.evaluate(() => {
      (
        document.querySelector(".sp-universe canvas") as HTMLCanvasElement & { __mark?: string }
      ).__mark = "same-canvas";
    });
    await expectLive(page);

    // Behind content the galaxy keeps turning, wide and dimmer.
    await nav(page, "Tasks");
    await expect(page.getByRole("heading", { name: "Tasks", level: 1 })).toBeVisible();
    await expect(page.locator(".sp-universe")).toHaveAttribute("data-mode", "live");
    await expectLive(page);
    expect((await probe(page)).lit).toBeGreaterThan(200);

    await nav(page, "Focus");
    await expect(page.getByRole("heading", { name: "Focus", level: 1 })).toBeVisible();
    await expect(page.locator(".sp-universe")).toHaveAttribute("data-mode", "live");
    await expectLive(page);

    await nav(page, "Universe");
    await expect(page.locator(".sp-universe")).toHaveAttribute("data-mode", "interactive");
    expect(
      await page.evaluate(
        () =>
          (document.querySelector(".sp-universe canvas") as HTMLCanvasElement & { __mark?: string })
            .__mark,
      ),
    ).toBe("same-canvas");

    // The canvas never takes pointer input; on Home the page's own stage does.
    expect(
      await page.evaluate(
        () => getComputedStyle(document.querySelector(".sp-universe") as Element).pointerEvents,
      ),
    ).toBe("none");
    const stage = page.locator("[data-universe-stage]");
    await expect(stage).toHaveAttribute("aria-label", /galaxy/i);
    // Dragging it does not select, scroll or navigate anything.
    const box = (await stage.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.6, box.y + 60);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.6 + 80, box.y + 90, { steps: 4 });
    await page.mouse.up();
    await expect(page).toHaveURL(/\/$/);
    expect(await state(page)).toBe("live");
  });

  test("tasks: every action emits its event once, and nothing on the echo or from elsewhere", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await sql(
      `insert into sp_tasks (user_id, name, due_date) values
        (${OWNER}, 'Overdue one', sp__today(${OWNER}) - 2), (${OWNER}, 'Overdue two', sp__today(${OWNER}) - 1),
        (${OWNER}, 'Finish me', sp__today(${OWNER})), (${OWNER}, 'Remove me', sp__today(${OWNER})),
        (${OWNER}, 'From elsewhere', sp__today(${OWNER}))`,
    );
    const subscribed = realtimeReady(page);
    await page.goto("/tasks");
    await subscribed;
    const today = page.getByTestId("today-tab");
    await expect(today).toContainText("Finish me");
    expect(await events(page)).toEqual([]);
    const log: string[] = [];
    /** Does one thing, waits for its echo from the database, and expects exactly `emitted`. */
    const act = async (emitted: string[], action: () => Promise<void>) => {
      const echo = realtimeChange(page, "sp_tasks");
      await action();
      log.push(...emitted);
      expect(await events(page)).toEqual(log);
      await echo;
      // The echo has been applied by the time the page has painted again.
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
      expect(await events(page)).toEqual(log);
    };

    await act(["task_created"], async () => {
      await page.getByLabel("Task name").fill("Brand new");
      await page.getByRole("button", { name: "Add", exact: true }).click();
      await expect(today).toContainText("Brand new");
    });
    await act(["task_completed"], () =>
      today.getByRole("checkbox", { name: "Complete “Finish me”" }).click(),
    );
    // Undo is the inverse action, and emits the inverse event.
    await act(["task_uncompleted"], () => page.getByRole("button", { name: "Undo" }).click());
    await act(["task_deleted"], async () => {
      await page.getByRole("button", { name: "Edit Remove me" }).click();
      await page.getByTestId("task-sheet").getByRole("button", { name: "Delete" }).click();
    });
    await act(["task_created"], () => page.getByRole("button", { name: "Undo" }).click());
    await act(["overdue_postponed"], () =>
      page.getByRole("button", { name: "Move all to today" }).click(),
    );

    // Edits, and changes that arrive from another device, emit nothing.
    await act([], async () => {
      await page.getByRole("button", { name: "Edit Brand new" }).click();
      const sheet = page.getByTestId("task-sheet");
      await sheet.getByLabel("Name").fill("Renamed");
      await sheet.getByRole("button", { name: /^(Save|Done)$/ }).click();
      await expect(today).toContainText("Renamed");
    });
    await act([], async () => {
      await sql(`update sp_tasks set completed = true where name = 'From elsewhere'`);
      await expect(today).not.toContainText("From elsewhere");
    });
  });

  test("goals and routines: progress, completion, a routine checked and the day completed", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await sql(
      `with l as (insert into sp_goal_lists (user_id, name, emoji) values (${OWNER}, 'Reading', '📚') returning id)
       insert into sp_goals (user_id, list_id, name, type, total_amount, unit, current_amount, sort_order)
       select ${OWNER}, l.id, v.name, v.type, v.total, v.unit, v.current, v.rank from l,
         (values ('Read books', 'progress', 3, 'books', 1, 1), ('Join a book club', 'todo', null, null, 0, 2))
           as v(name, type, total, unit, current, rank)`,
    );
    await sql(
      `insert into sp_routines (user_id, name, emoji, start_date, sort_order) values
        (${OWNER}, 'Meditate', '🧘', sp__today(${OWNER}), 1), (${OWNER}, 'Journal', '📓', sp__today(${OWNER}), 2)`,
    );
    const subscribed = realtimeReady(page);
    await page.goto("/goals");
    await subscribed;
    await page.getByRole("button", { name: "Open Reading" }).click();
    const detail = page.getByTestId("goal-list-detail");
    await expect(detail).toBeVisible();
    const log: string[] = [];
    const act = async (table: string, emitted: string[], action: () => Promise<void>) => {
      const echo = realtimeChange(page, table);
      await action();
      log.push(...emitted);
      expect(await events(page)).toEqual(log);
      await echo;
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
      expect(await events(page)).toEqual(log);
    };

    // 1 → 2 of 3 is progress; 2 → 3 completes the goal, which is a completion and not both.
    await act("sp_goals", ["goal_progress"], () =>
      detail.getByRole("button", { name: "Increase Read books" }).click(),
    );
    await act("sp_goals", ["goal_completed"], () =>
      detail.getByRole("button", { name: "Increase Read books" }).click(),
    );
    await act("sp_goals", ["goal_completed"], () =>
      detail.getByRole("checkbox", { name: "Complete “Join a book club”" }).click(),
    );

    await nav(page, "Routines");
    const panel = page.getByTestId("day-panel").first();
    await act("sp_routine_logs", ["routine_checked"], () =>
      panel.getByRole("checkbox", { name: "Complete “Meditate”" }).click(),
    );
    // The last one of the day: the routine, and then the day.
    await act("sp_routine_logs", ["routine_checked", "routine_day_complete"], () =>
      panel.getByRole("checkbox", { name: "Complete “Journal”" }).click(),
    );
    // Unchecking is not in the catalog.
    await act("sp_routine_logs", [], () =>
      panel.getByRole("checkbox", { name: /Journal/ }).click(),
    );
  });

  test("focus: the timer's events play on every open device", async ({
    page,
    browser,
    baseURL,
  }, info) => {
    test.setTimeout(240_000);
    const second: BrowserContext = await browser.newContext({ ...info.project.use, baseURL });
    let opened: Page | undefined;
    try {
      await signIn(second);
      const other = await second.newPage();
      opened = other;
      const ready = [realtimeReady(page), realtimeReady(other)];
      await page.goto("/focus");
      // The other device is on another page.
      await other.goto("/tasks");
      await Promise.all(ready);
      // The second device is only asked what it emitted. Its window is behind the first
      // one, and a browser may give a window nobody can see no frames to draw with.
      const focus = page.getByTestId("focus");
      await expect(focus).toHaveAttribute("data-status", "idle");

      // Starting here starts it there.
      await page.getByRole("button", { name: "Start focus" }).click();
      await expect(focus).toHaveAttribute("data-status", "running");
      expect(await events(page)).toEqual(["focus_started"]);
      await expect.poll(() => events(other)).toEqual(["focus_started"]);

      // Pausing and resuming are not events.
      await page.getByRole("button", { name: "Pause" }).click();
      await expect(focus).toHaveAttribute("data-status", "paused");
      await page.getByRole("button", { name: "Resume" }).click();
      await expect(focus).toHaveAttribute("data-status", "running");
      expect(await events(page)).toEqual(["focus_started"]);

      // Skipped, not completed: with auto-start off the break waits, then begins.
      await page.getByRole("button", { name: "Skip phase" }).click();
      await expect(focus).toHaveAttribute("data-status", "awaiting");
      await page.getByRole("button", { name: "Start short break" }).click();
      await expect(focus).toHaveAttribute("data-status", "running");
      expect(await events(page)).toEqual(["focus_started", "focus_break"]);
      await expect.poll(() => events(other)).toEqual(["focus_started", "focus_break"]);

      // A focus phase that runs to its end is completed, on both devices, exactly once.
      await page.getByRole("button", { name: "End session" }).click();
      await expect(focus).toHaveAttribute("data-status", "idle");
      await sql(`update sp_focus_settings set auto_start_breaks = true where user_id = ${OWNER}`);
      await sql(
        `select sp__timer_apply(${OWNER}, 'start', (select version from sp_focus_state where user_id = ${OWNER}), now() - interval '24 minutes 57 seconds')`,
      );
      const full = [
        "focus_started",
        "focus_break",
        "focus_started",
        "focus_completed",
        "focus_break",
      ];
      await expect.poll(() => events(page), { timeout: 30_000 }).toEqual(full);
      await expect.poll(() => events(other), { timeout: 30_000 }).toEqual(full);
      // Once the break's echo has gone round as well, nothing more was emitted.
      const echo = realtimeChange(other, "sp_focus_state");
      await sql(`update sp_focus_state set updated_at = now() where user_id = ${OWNER}`);
      await echo;
      expect(await events(other)).toEqual(full);
      expect(await events(page)).toEqual(full);
    } finally {
      // Leave the app before the window goes, as a person closing a tab does: the galaxy
      // gives its GL context back on the way out.
      await opened?.goto("about:blank").catch(() => undefined);
      await second.close();
    }
  });

  test("an event plays in the galaxy behind a list, and leaves nothing behind", async ({
    page,
  }) => {
    await setQuality("balanced");
    await sql(
      `insert into sp_tasks (user_id, name, due_date) values (${OWNER}, 'Light the sky', sp__today(${OWNER}))`,
    );
    await page.goto("/tasks");
    await galaxyReady(page);
    expect((await probe(page)).effects).toBe(0);
    await page
      .getByTestId("today-tab")
      .getByRole("checkbox", { name: "Complete “Light the sky”" })
      .click();
    await expect.poll(async () => (await probe(page)).effects, { intervals: [30] }).toBe(1);
    expect(await state(page)).toBe("live");
    // A shooting star lasts 2.6 s; then its slot is free again.
    await expect.poll(async () => (await probe(page)).effects, { timeout: 45_000 }).toBe(0);
    await expectLive(page);
  });

  test("a burst of completions never queues up: six play, then one meteor shower", async ({
    page,
  }) => {
    await setQuality("balanced");
    await page.goto("/tasks");
    await galaxyReady(page);
    const peak = await page.evaluate(async () => {
      for (let i = 0; i < 12; i++) {
        (window as unknown as W).__stellarUniverse.emit({
          type: "task_completed",
          id: `burst-${i}`,
          origin: { x: 80, y: 300 + i * 20 },
        });
        await new Promise((r) => setTimeout(r, 30));
      }
      return (await (window as unknown as W).__stellarUniverse.probe())?.effects;
    });
    // Six shooting stars and the shower that stands in for the rest.
    expect(peak).toBe(7);
    await expect.poll(async () => (await probe(page)).effects, { timeout: 45_000 }).toBe(0);
  });

  test("reduced motion: the sky is still on every page and events are a brief glow", async ({
    browser,
    baseURL,
  }, info) => {
    await setQuality("cinematic");
    const reduced = await browser.newContext({
      ...info.project.use,
      baseURL,
      reducedMotion: "reduce",
    });
    try {
      await signIn(reduced);
      const page = await reduced.newPage();
      await page.goto("/");
      await galaxyReady(page, "high");
      const home = await probe(page);
      expect(home.still).toBe(true);
      expect(home.lit).toBeGreaterThan(500);
      // Home does not orbit by itself, and no other page moves either.
      await expectNoFrames(page);
      for (const [name, framing] of [
        ["Tasks", "page"],
        ["Focus", "focus"],
      ] as const) {
        await nav(page, name);
        await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
        // The new page fades in over the old one; then nothing moves again.
        await expect.poll(async () => (await probe(page)).framing).toBe(framing);
        await expectNoFrames(page);
        expect((await probe(page)).lit).toBeGreaterThan(200);
      }

      // An event is a glow of at most 400 ms where it started, and nothing else moves.
      const during = await page.evaluate(async () => {
        (window as unknown as W).__stellarUniverse.emit({
          type: "task_completed",
          id: "quiet",
          origin: { x: 120, y: 240 },
        });
        await new Promise((r) => setTimeout(r, 120));
        return (window as unknown as W).__stellarUniverse.probe();
      });
      expect(during?.effects).toBe(1);
      expect(during?.state).toBe("waking");
      await expect.poll(async () => (await probe(page)).effects, { timeout: 3000 }).toBe(0);
      // Even the events that move the galaxy do not move it here.
      const focus = await page.evaluate(async () => {
        (window as unknown as W).__stellarUniverse.emit({ type: "focus_started" });
        await new Promise((r) => setTimeout(r, 120));
        return (window as unknown as W).__stellarUniverse.probe();
      });
      expect(focus?.state).toBe("waking");
      await expectNoFrames(page);
    } finally {
      await reduced.close();
    }
  });

  test("the quality setting changes the tier, and Low drops the interface's blur", async ({
    page,
  }) => {
    await setQuality("balanced");
    await page.goto("/settings");
    await galaxyReady(page);
    await expect(page.locator("html")).toHaveAttribute("data-tier", "balanced");
    const quality = page.getByRole("radiogroup", { name: "Universe quality" });
    await expect(quality.getByRole("radio")).toHaveText([/^Auto/, /^High/, /^Balanced/, /^Low/]);
    await quality.getByRole("radio", { name: /^Low/ }).click();
    await expect(page.locator("html")).toHaveAttribute("data-tier", "low");
    await expect.poll(async () => (await probe(page)).tier).toBe("low");
    expect((await probe(page)).lit).toBeGreaterThan(200);
    await quality.getByRole("radio", { name: /^High/ }).click();
    await expect(page.locator("html")).toHaveAttribute("data-tier", "high");
    await expect.poll(async () => (await probe(page)).tier).toBe("high");
    // Stored under its old name, once the write has gone out.
    await expect
      .poll(
        async () =>
          (await sql<{ quality_tier: string }>(`select quality_tier from sp_settings`))[0]
            ?.quality_tier,
      )
      .toBe("cinematic");
  });

  test("there is no progression anywhere: no eras, no star counts, nothing to tap in the sky", async ({
    page,
  }) => {
    await sql(
      `insert into sp_tasks (user_id, name, completed, due_date) select ${OWNER}, 'Done ' || g, true, sp__today(${OWNER}) from generate_series(1, 30) g`,
    );
    await page.goto("/");
    await expect(page.getByTestId("today-card")).toBeVisible();
    for (const name of ["Universe", "Tasks", "Goals", "Routines", "Focus", "Settings"]) {
      // Phones reach Settings from the gear on Home, not from the tab bar.
      if (name === "Settings") await page.goto("/settings");
      else if (name !== "Universe") await nav(page, name);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const text = await page.locator("body").innerText();
      expect(text, name).not.toMatch(/\b(era|eras|stardust|ignited|constellations?|levels?)\b/i);
      expect(text, name).not.toMatch(/stars? (to|until) /i);
    }
    await expect(page.getByTestId("universe-label")).toHaveCount(0);
    // And nothing fetches a snapshot: the endpoint is gone.
    expect((await page.request.get("/api/v1/universe/snapshot")).status()).toBe(404);
  });

  test("an event burst while a long list scrolls never holds the main thread for 50 ms", async ({
    page,
  }, info) => {
    test.skip(
      !["desktop", "webkit-iphone-15-pro"].includes(info.project.name),
      "the performance run: desktop and the WebKit iPhone",
    );
    // Auto quality, so the galaxy is what this machine would really be given: live on a
    // GPU, and still where WebGL is drawn on the CPU (CI), where a live galaxy would be
    // measuring the software rasteriser taking every core, not the app.
    test.setTimeout(180_000);
    await sql(
      `insert into sp_tasks (user_id, name, due_date) select ${OWNER}, 'Task ' || lpad(g::text, 3, '0'), sp__today(${OWNER}) + (g % 9) from generate_series(1, 120) g`,
    );
    await page.goto("/tasks?tab=all");
    await page.getByRole("radio", { name: "All", exact: true }).click();
    await expect(page.getByTestId("all-tab")).toContainText("Task 120");
    await galaxyReady(page, null);
    // Auto first checks its choice against real frames. A browser can hide that its GPU is
    // software (WebKit does); there Auto finds a few frames a second and stops the motion.
    await expect.poll(async () => (await probe(page)).judged, { timeout: 90_000 }).toBe(true);
    const before = await probe(page);
    expect(before.state).toBe(before.still ? "still" : "live");

    const longest = await page.evaluate(async () => {
      // A task that takes the main thread shows up as a late heartbeat. Long Task timing is
      // not in WebKit; a message loop measures the same thing in every engine.
      let worst = 0;
      let last = performance.now();
      let running = true;
      const channel = new MessageChannel();
      channel.port1.onmessage = () => {
        const now = performance.now();
        worst = Math.max(worst, now - last);
        last = now;
        if (running) channel.port2.postMessage(0);
      };
      channel.port2.postMessage(0);
      const height = document.documentElement.scrollHeight - innerHeight;
      // Once down and up the list first: a browser lays out and paints rows the first time
      // they scroll into view, which is the list's cost and happens with no galaxy at all.
      await new Promise<void>((done) => {
        const from = performance.now();
        const warm = () => {
          const t = performance.now() - from;
          window.scrollTo(0, (height * (1 - Math.cos(t / 320))) / 2);
          if (t < 2100) requestAnimationFrame(warm);
          else done();
        };
        requestAnimationFrame(warm);
      });
      // Let the measuring settle before anything is measured.
      await new Promise((r) => setTimeout(r, 300));
      worst = 0;
      const started = performance.now();
      let emitted = 0;
      await new Promise<void>((done) => {
        const step = () => {
          const t = performance.now() - started;
          // Up and down the list for two seconds, ten completions on the way.
          window.scrollTo(0, (height * (1 - Math.cos(t / 320))) / 2);
          while (emitted < 10 && t >= emitted * 200) {
            (window as unknown as W).__stellarUniverse.emit({
              type: "task_completed",
              id: `perf-${emitted}`,
              origin: { x: 60, y: 200 + emitted * 30 },
            });
            emitted++;
          }
          if (t < 2400) requestAnimationFrame(step);
          else done();
        };
        requestAnimationFrame(step);
      });
      running = false;
      return worst;
    });
    expect((await events(page)).filter((e) => e === "task_completed")).toHaveLength(10);
    expect(
      longest,
      `${isWebKit(info.project.name) ? "WebKit" : "Chromium"} main thread`,
    ).toBeLessThan(50);
  });
});
