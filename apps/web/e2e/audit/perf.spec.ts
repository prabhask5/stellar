// POLISH_SPEC §2.1 / §4.6: measurements (Chromium only: longtask, event timing and
// the DevTools protocol are needed). Results go to docs/polish/data/perf-<label>-<project>.json;
// PERF_LABEL=before|after picks the column of the table in docs/polish/PERF.md.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { CDPSession, Page } from "@playwright/test";
import { seedPolish } from "../seed-polish";
import { ensureConfigured, expect, signIn, sql, test, wipeData } from "../helpers";

const OUT = path.resolve(import.meta.dirname, "../../../../docs/polish/data");
const LABEL = process.env.PERF_LABEL ?? "before";
const OWNER = "(select id from auth.users where email = 'owner@stellar.local')";

async function instrument(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as {
      __perf: {
        long: number[];
        events: { name: string; d: number }[];
        frames: number[];
        lastFrame: number;
        sampling: boolean;
      };
    };
    w.__perf = { long: [], events: [], frames: [], lastFrame: 0, sampling: false };
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) w.__perf.long.push(Math.round(e.duration));
      }).observe({ type: "longtask", buffered: true });
      new PerformanceObserver((l) => {
        for (const e of l.getEntries() as PerformanceEventTiming[])
          if (e.interactionId) w.__perf.events.push({ name: e.name, d: Math.round(e.duration) });
      }).observe({
        type: "event",
        durationThreshold: 16,
        buffered: true,
      } as PerformanceObserverInit);
    } catch {
      // not Chromium
    }
    const loop = (t: number) => {
      if (w.__perf.sampling && w.__perf.lastFrame) w.__perf.frames.push(t - w.__perf.lastFrame);
      w.__perf.lastFrame = t;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
}

interface Sample {
  longTasks: number;
  longest: number;
  inp: number;
  frames: number;
  p50: number;
  p95: number;
  worst: number;
  over33: number;
}

async function sample(page: Page, fn: () => Promise<void>): Promise<Sample> {
  await page.evaluate(() => {
    const p = (
      window as unknown as {
        __perf: { long: number[]; events: unknown[]; frames: number[]; sampling: boolean };
      }
    ).__perf;
    p.long = [];
    p.events = [];
    p.frames = [];
    p.sampling = true;
  });
  await fn();
  await page.waitForTimeout(300);
  return page.evaluate(() => {
    const p = (
      window as unknown as {
        __perf: { long: number[]; events: { d: number }[]; frames: number[]; sampling: boolean };
      }
    ).__perf;
    p.sampling = false;
    const f = p.frames.slice().sort((a, b) => a - b);
    const q = (x: number) =>
      Math.round((f[Math.min(f.length - 1, Math.floor(f.length * x))] ?? 0) * 10) / 10;
    return {
      longTasks: p.long.length,
      longest: Math.max(0, ...p.long),
      inp: Math.max(0, ...p.events.map((e) => e.d)),
      frames: f.length,
      p50: q(0.5),
      p95: q(0.95),
      worst: q(1),
      over33: f.filter((d) => d > 33.4).length,
    };
  });
}

async function heap(
  cdp: CDPSession,
): Promise<{ heapMB: number; nodes: number; listeners: number }> {
  await cdp.send("HeapProfiler.collectGarbage");
  const { metrics } = await cdp.send("Performance.getMetrics");
  const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
  return {
    heapMB: Math.round(((m.JSHeapUsedSize ?? 0) / 1048576) * 10) / 10,
    nodes: m.Nodes ?? 0,
    listeners: m.JSEventListeners ?? 0,
  };
}

test.describe("perf", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "Chromium-only measurements");
  test.beforeAll(async ({ request }) => {
    await ensureConfigured(request);
  });
  test.beforeEach(async ({ context }) => {
    await wipeData();
    await sql(`update sp_settings set birthdate = '1996-04-12'`);
    await seedPolish();
    await signIn(context);
  });

  for (const tier of ["minimal", "balanced"] as const) {
    test(`interaction and frame timings (${tier})`, async ({ page }, info) => {
      test.setTimeout(240_000);
      await sql(`update sp_settings set quality_tier = '${tier}'`);
      await instrument(page);
      // A desktop CPU says little about a phone: slow the main thread down (4× by default).
      const cpu = Number(process.env.PERF_CPU ?? 4);
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
      const out: Record<string, unknown> = { tier, cpuThrottle: cpu };
      await page.goto("/");
      await expect(page.getByTestId("today-card")).toBeVisible();
      await page.waitForTimeout(4000); // universe chunk + first frames
      out.renderer = await page.evaluate(() => {
        const gl = document.createElement("canvas").getContext("webgl");
        const ext = gl?.getExtension("WEBGL_debug_renderer_info");
        return ext && gl ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "none";
      });
      out.idleHome = await sample(page, () => page.waitForTimeout(3000));

      const nav = page.getByRole("navigation", { name: "Main" }).filter({ visible: true });
      out.tabSwitches = await sample(page, async () => {
        for (const name of ["Tasks", "Goals", "Routines", "Focus", "Universe", "Tasks"]) {
          await nav.getByRole("link", { name }).click();
          await page.waitForTimeout(450);
        }
      });
      await expect(page.getByTestId("today-tab")).toBeVisible();
      out.completeTen = await sample(page, async () => {
        for (let i = 0; i < 10; i++) {
          await page
            .getByTestId("today-tab")
            .getByRole("checkbox", { checked: false })
            .first()
            .click();
          await page.waitForTimeout(120);
        }
        await page.waitForTimeout(2500);
      });
      await page.getByRole("radio", { name: "All", exact: true }).click();
      await expect(page.getByTestId("all-tab")).toBeVisible();
      out.scrollAll = await sample(page, async () => {
        for (let i = 0; i < 25; i++) {
          await page.mouse.wheel(0, 320);
          await page.waitForTimeout(60);
        }
      });
      await page.evaluate(() => window.scrollTo(0, 0));
      out.openSheet = await sample(page, async () => {
        await page
          .getByRole("button", { name: /^Edit / })
          .first()
          .click();
        await page.waitForTimeout(700);
        await page.keyboard.press("Escape");
        await page.waitForTimeout(500);
      });
      out.typeQuickAdd = await sample(page, async () => {
        await page
          .getByLabel("Task name")
          .first()
          .pressSequentially("Measure typing latency here", { delay: 35 });
      });

      // 1000 tasks in All.
      await sql(`insert into sp_tasks (user_id, name, due_date)
        select ${OWNER}, 'Bulk task ' || g, sp__today(${OWNER}) + (g % 60) from generate_series(1, 1000) g`);
      await page.goto("/tasks?tab=all");
      const t0 = Date.now();
      await page.getByRole("radio", { name: "All", exact: true }).click();
      // Rows created elsewhere must show up after a reload; record it when they do not.
      const fresh = await page
        .getByTestId("all-tab")
        .getByText(/^Bulk task \d+$/)
        .first()
        .waitFor({ timeout: 30_000 })
        .then(() => true)
        .catch(() => false);
      out.thousandTasksMs = fresh
        ? Date.now() - t0
        : "never shown: the reload kept the cached list";
      if (!fresh) {
        await page.evaluate(() => indexedDB.deleteDatabase("stellar-cache"));
        await page.reload();
        await page.getByRole("radio", { name: "All", exact: true }).click();
        await expect(page.getByTestId("all-tab")).toContainText("Bulk task", { timeout: 30_000 });
      }
      out.thousandScroll = await sample(page, async () => {
        for (let i = 0; i < 25; i++) {
          await page.mouse.wheel(0, 600);
          await page.waitForTimeout(60);
        }
      });
      out.thousandDomNodes = await page.evaluate(() => document.querySelectorAll("*").length);

      mkdirSync(OUT, { recursive: true });
      writeFileSync(
        path.join(OUT, `perf-${LABEL}-${tier}-${info.project.name}.json`),
        `${JSON.stringify(out, null, 1)}\n`,
      );
    });
  }

  test("memory over a long scripted session", async ({ page }, info) => {
    const minutes = Number(process.env.AUDIT_MEMORY_MIN ?? 0);
    test.skip(!minutes, "set AUDIT_MEMORY_MIN (30 for the full run)");
    test.setTimeout((minutes + 5) * 60_000);
    await sql(`update sp_settings set quality_tier = 'balanced'`);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Performance.enable");
    await page.goto("/");
    await expect(page.getByTestId("today-card")).toBeVisible();
    await page.waitForTimeout(5000);
    const nav = page.getByRole("navigation", { name: "Main" }).filter({ visible: true });
    const gl = () =>
      page.evaluate(() => {
        const u = (window as unknown as { __stellarUniverse?: { info?: () => unknown } })
          .__stellarUniverse;
        return u?.info ? u.info() : null;
      });
    const samples: unknown[] = [{ minute: 0, ...(await heap(cdp)), gl: await gl() }];
    const end = Date.now() + minutes * 60_000;
    let round = 0;
    while (Date.now() < end) {
      round += 1;
      for (const name of ["Tasks", "Goals", "Routines", "Focus", "Universe"]) {
        await nav.getByRole("link", { name }).click();
        await page.waitForTimeout(500);
        if (name === "Tasks") {
          const q = page.getByLabel("Task name").first();
          await q.fill(`Memory round ${round}`);
          await q.press("Enter");
          const box = page
            .getByTestId("today-tab")
            .getByRole("checkbox", { checked: false })
            .first();
          if (await box.count()) await box.click();
          await page
            .getByRole("button", { name: /^Edit / })
            .first()
            .click();
          await page.waitForTimeout(400);
          await page.keyboard.press("Escape");
        }
        if (name === "Goals") {
          await page.getByRole("button", { name: "Open Health" }).click();
          await page.getByRole("button", { name: "Increase Workouts this quarter" }).click();
          await page.waitForTimeout(300);
          await page.getByRole("button", { name: "Decrease Workouts this quarter" }).click();
        }
        if (name === "Focus" && round % 2 === 0) {
          await page
            .getByRole("button", { name: /Start focus|Resume|Start/ })
            .first()
            .click();
          await page.waitForTimeout(2500);
          await page
            .getByRole("button", { name: "End session" })
            .click()
            .catch(() => {});
        }
        await page.waitForTimeout(700);
      }
      const minute = Math.round((minutes * 60_000 - (end - Date.now())) / 6000) / 10;
      if (round % 4 === 0) samples.push({ minute, round, ...(await heap(cdp)), gl: await gl() });
    }
    samples.push({ minute: minutes, round, ...(await heap(cdp)), gl: await gl() });
    mkdirSync(OUT, { recursive: true });
    writeFileSync(
      path.join(OUT, `memory-${LABEL}-${info.project.name}.json`),
      `${JSON.stringify(samples, null, 1)}\n`,
    );
  });
});
