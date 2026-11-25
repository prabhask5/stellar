import type { Page } from "@playwright/test";
import {
  applyInsets,
  ensureConfigured,
  expect,
  isTouch,
  type Insets,
  signIn,
  sql,
  test,
  wipeData,
  waitForServiceWorker,
} from "./support/helpers";

const OWNER = "(select id from auth.users where email = 'owner@stellar.local')";

/**
 * Waits until the query cache saved on the device (IndexedDB) holds these collections.
 * The app writes it a moment after the data arrives; going offline before that would test
 * a device that has never held the data.
 */
async function waitForSavedCache(page: Page, collections: string[]): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(async (wanted) => {
          // Opening a database that does not exist yet would create it without its store.
          if (!(await indexedDB.databases()).some((d) => d.name === "stellar-cache")) return wanted;
          const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const open = indexedDB.open("stellar-cache");
            open.onsuccess = () => resolve(open.result);
            open.onerror = () => reject(open.error);
          });
          try {
            if (!db.objectStoreNames.contains("query")) return wanted;
            const saved = await new Promise<
              { clientState?: { queries?: { queryKey: unknown[] }[] } } | undefined
            >((resolve, reject) => {
              const get = db.transaction("query").objectStore("query").get("client");
              get.onsuccess = () => resolve(get.result);
              get.onerror = () => reject(get.error);
            });
            const have = new Set(
              (saved?.clientState?.queries ?? []).map((q) => String(q.queryKey[0])),
            );
            return wanted.filter((name) => !have.has(name));
          } finally {
            db.close();
          }
        }, collections),
      { message: "collections not yet saved on the device", timeout: 20_000 },
    )
    .toEqual([]);
}

/** Waits until the worker has cached every app route. */
async function waitForWarmShell(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const cache = await caches.open("stellar-pages-v1");
          const keys = (await cache.keys()).map((r) => new URL(r.url).pathname);
          return ["/", "/tasks", "/goals", "/routines", "/focus", "/settings"].every((p) =>
            keys.includes(p),
          );
        }),
      { timeout: 30_000 },
    )
    .toBe(true);
}

test.describe("PWA", () => {
  test.beforeAll(async ({ request }) => {
    await ensureConfigured(request);
  });
  test.beforeEach(async ({ context }) => {
    await wipeData();
    await signIn(context);
  });

  test("manifest, icons and iOS meta are in place", async ({ page, request }, info) => {
    const manifest = await (await request.get("/manifest.webmanifest")).json();
    expect(manifest).toMatchObject({
      name: "Stellar Planner",
      short_name: "Stellar Planner",
      display: "standalone",
      orientation: "any",
      background_color: "#070615",
      theme_color: "#070615",
    });
    expect(manifest.icons.some((i: { purpose: string }) => i.purpose === "maskable")).toBe(true);
    expect(manifest.shortcuts.map((s: { name: string }) => s.name)).toEqual([
      "New task",
      "Start focus",
    ]);
    for (const icon of manifest.icons)
      expect((await request.get(icon.src)).ok(), icon.src).toBe(true);

    await page.goto("/");
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
      "content",
      /viewport-fit=cover/,
    );
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#070615");
    await expect(
      page.locator('meta[name="apple-mobile-web-app-status-bar-style"]'),
    ).toHaveAttribute("content", "black-translucent");
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
      "href",
      /apple-touch-icon/,
    );
    const splash = page.locator('link[rel="apple-touch-startup-image"]');
    expect(await splash.count()).toBeGreaterThanOrEqual(12);
    const first = await splash.first().getAttribute("href");
    expect((await request.get(first!)).ok()).toBe(true);
    // The "Add to Home Screen" hint is for iOS Safari only, and stays gone once dismissed.
    const hint = page.getByTestId("install-hint");
    if (isTouch(info.project.name)) {
      await expect(hint).toContainText("Add to Home Screen");
      await hint.getByRole("button", { name: "Dismiss" }).click();
      await expect(hint).toHaveCount(0);
      await page.reload();
      await expect(page.getByTestId("today-card")).toBeVisible();
    }
    await expect(hint).toHaveCount(0);
  });

  test("opens offline from the service worker, queues changes, and replays them on reconnect", async ({
    page,
    context,
  }) => {
    await sql(
      `insert into sp_tasks (user_id, name, due_date) values (${OWNER}, 'Cached task', sp__today(${OWNER}))`,
    );
    await page.goto("/tasks");
    await expect(page.getByTestId("today-tab")).toContainText("Cached task");
    await waitForServiceWorker(page);
    await waitForWarmShell(page);
    // Everything the offline part shows must be in the cache saved on the device first.
    await waitForSavedCache(page, ["sp_tasks", "settings", "focus"]);

    await context.setOffline(true);
    await page.reload();
    // Shell and data both come from the device.
    await expect(page.getByRole("heading", { name: "Tasks", level: 1 })).toBeVisible();
    await expect(page.getByTestId("today-tab")).toContainText("Cached task");

    // Work offline: add, then complete.
    const name = page.getByLabel("Task name");
    await name.fill("Written offline");
    await name.press("Enter");
    await expect(page.getByTestId("today-tab")).toContainText("Written offline");
    await page.getByRole("checkbox", { name: "Complete “Cached task”" }).click();
    await expect(page.getByTestId("task-row").filter({ hasText: "Cached task" })).toBeHidden({
      timeout: 4000,
    });
    expect(
      (await sql(`select count(*)::int as n from sp_tasks where name = 'Written offline'`))[0]?.n,
    ).toBe(0);

    // A route never opened in this session still boots offline, and says so.
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: /Offline/ })
        .first(),
    ).toBeVisible();
    await page.goto("/focus");
    await expect(page.getByTestId("timer-clock")).toHaveText("25:00");
    // The timer works offline too.
    await page.getByRole("button", { name: "Start focus" }).click();
    await expect(page.getByTestId("focus")).toHaveAttribute("data-status", "running");
    await page.getByRole("button", { name: "Pause" }).click();
    await expect(page.getByTestId("focus")).toHaveAttribute("data-status", "paused");
    expect((await sql(`select status from sp_focus_state`))[0]?.status).toBe("idle");

    // Reconnect: the outbox replays in order.
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect
      .poll(
        async () =>
          (await sql(`select count(*)::int as n from sp_tasks where name = 'Written offline'`))[0]
            ?.n,
        { timeout: 15_000 },
      )
      .toBe(1);
    await expect
      .poll(
        async () =>
          (await sql(`select completed from sp_tasks where name = 'Cached task'`))[0]?.completed,
      )
      .toBe(true);
    await expect
      .poll(async () => (await sql(`select status from sp_focus_state`))[0]?.status)
      .toBe("paused");
    await expect(page.getByTestId("focus")).toHaveAttribute("data-status", "paused");
  });

  test("a new version shows a Reload toast", async ({ page }) => {
    await page.goto("/");
    await waitForServiceWorker(page);
    // Pretend a new worker has finished installing and is waiting.
    await page.evaluate(async () => {
      const reg = (await navigator.serviceWorker.getRegistration()) as ServiceWorkerRegistration;
      Object.defineProperty(reg, "waiting", {
        configurable: true,
        get: () => ({ postMessage: () => undefined }),
      });
      Object.defineProperty(reg, "installing", {
        configurable: true,
        get: () => ({ state: "installed", addEventListener: (_: string, cb: () => void) => cb() }),
      });
      reg.dispatchEvent(new Event("updatefound"));
    });
    await expect(page.getByText("New version available")).toBeVisible();
    await expect(page.getByRole("button", { name: "Reload" })).toBeVisible();
  });
});

interface Device {
  name: string;
  width: number;
  height: number;
  insets: Insets;
  top: number;
  bottom: number;
  side: number;
}

// The device matrix: every screen size the app is designed for. Insets are simulated with the test-only class.
const MATRIX: Device[] = [
  { name: "iphone-se", width: 375, height: 667, insets: "none", top: 0, bottom: 0, side: 0 },
  {
    name: "iphone-14-notch",
    width: 390,
    height: 844,
    insets: "notch",
    top: 47,
    bottom: 34,
    side: 0,
  },
  {
    name: "iphone-15-pro-island",
    width: 393,
    height: 852,
    insets: "island",
    top: 59,
    bottom: 34,
    side: 0,
  },
  {
    name: "iphone-pro-max",
    width: 430,
    height: 932,
    insets: "island",
    top: 59,
    bottom: 34,
    side: 0,
  },
  {
    name: "phone-landscape",
    width: 852,
    height: 393,
    insets: "landscape",
    top: 0,
    bottom: 21,
    side: 59,
  },
  { name: "ipad", width: 820, height: 1180, insets: "none", top: 0, bottom: 0, side: 0 },
  { name: "desktop-1280", width: 1280, height: 800, insets: "none", top: 0, bottom: 0, side: 0 },
  { name: "desktop-1920", width: 1920, height: 1080, insets: "none", top: 0, bottom: 0, side: 0 },
];
const PAGES = [
  ["/", "home"],
  ["/tasks", "tasks"],
  ["/goals", "goals"],
  ["/routines", "routines"],
  ["/focus", "focus"],
  ["/settings", "settings"],
] as const;

test.describe("safe areas across the device matrix", () => {
  test.beforeAll(async ({ request }) => {
    await ensureConfigured(request);
    await wipeData();
    await sql(
      `insert into sp_tasks (user_id, name, due_date) select ${OWNER}, 'Task ' || g, sp__today(${OWNER}) - (g % 3) from generate_series(1, 6) g`,
    );
    await sql(
      `with l as (insert into sp_goal_lists (user_id, name, emoji) values (${OWNER}, 'Health', '💪'), (${OWNER}, 'Career', '💼') returning id) insert into sp_goals (user_id, list_id, name) select ${OWNER}, l.id, 'Goal' from l`,
    );
    await sql(
      `insert into sp_routines (user_id, name, start_date) values (${OWNER}, 'Meditate', sp__today(${OWNER}) - 5)`,
    );
  });

  for (const device of MATRIX) {
    test(`${device.name} ${device.width}×${device.height}`, async ({ browser, baseURL }, info) => {
      test.skip(
        info.project.name !== "desktop",
        "the matrix sets its own viewports; one project is enough",
      );
      const touch = device.width < 1024;
      const context = await browser.newContext({
        baseURL,
        viewport: { width: device.width, height: device.height },
        hasTouch: touch,
        isMobile: touch && device.width < 800,
        reducedMotion: "reduce",
      });
      await signIn(context);
      const page = await context.newPage();
      await applyInsets(page, device.insets);
      const { mkdirSync } = await import("node:fs");
      const { SHOTS_DIR } = await import("./support/helpers");
      mkdirSync(`${SHOTS_DIR}/matrix`, { recursive: true });

      for (const [path, label] of PAGES) {
        await page.goto(path);
        const title = page.getByRole("heading", { level: 1 });
        await expect(title).toBeVisible();
        await page.waitForTimeout(250);

        const m = await page.evaluate(() => {
          const cs = getComputedStyle(document.documentElement);
          const inset = (n: string) => parseFloat(cs.getPropertyValue(n)) || 0;
          const h1 = document.querySelector("h1")!.getBoundingClientRect();
          const nav = [...document.querySelectorAll('nav[aria-label="Main"]')]
            .map((n) => n.getBoundingClientRect())
            .find((r) => r.width > 0 && r.height > 0);
          const main = document.querySelector("main")!;
          // Controls inside a deliberate horizontal scroller (chip rows) may extend past the edge.
          const inScroller = (el: Element) => {
            for (let p = el.parentElement; p && p !== main; p = p.parentElement) {
              if (/(auto|scroll)/.test(getComputedStyle(p).overflowX)) return true;
            }
            return false;
          };
          const clipped = [...main.querySelectorAll("button, a, input, h1, h2")].filter((el) => {
            const r = el.getBoundingClientRect();
            return (
              r.width > 0 && (r.left < -0.5 || r.right > window.innerWidth + 0.5) && !inScroller(el)
            );
          }).length;
          return {
            top: inset("--sat"),
            bottom: inset("--sab"),
            left: inset("--sal"),
            right: inset("--sar"),
            h1Top: h1.top,
            h1Left: h1.left,
            nav: nav
              ? {
                  top: nav.top,
                  bottom: nav.bottom,
                  left: nav.left,
                  right: nav.right,
                  width: nav.width,
                }
              : null,
            overflowX: document.documentElement.scrollWidth - window.innerWidth,
            mainPaddingBottom: parseFloat(getComputedStyle(main).paddingBottom),
            clipped,
            sky: (document.querySelector(".sp-sky") as HTMLElement)
              .getBoundingClientRect()
              .toJSON(),
          };
        });
        const where = `${device.name} ${path}`;
        expect(m.top, where).toBe(device.top);
        expect(m.bottom, where).toBe(device.bottom);
        expect(m.left, where).toBe(device.side);
        // No horizontal scrolling and nothing cut off at the sides.
        expect(m.overflowX, `${where} overflows horizontally`).toBeLessThanOrEqual(0);
        expect(m.clipped, `${where} has clipped controls`).toBe(0);
        // Headers start below the notch / Dynamic Island, with breathing room.
        expect(m.h1Top, where).toBeGreaterThanOrEqual(Math.max(16, device.top) + 8);
        // The background runs full-bleed under every inset.
        expect(m.sky, where).toMatchObject({
          x: 0,
          y: 0,
          width: device.width,
          height: device.height,
        });

        expect(m.nav, where).not.toBeNull();
        if (device.width < 768) {
          // Floating tab bar: above the home indicator, inside the side insets, and content can scroll clear of it.
          expect(Math.round(device.height - m.nav!.bottom), where).toBe(
            Math.max(12, device.bottom),
          );
          expect(m.nav!.left, where).toBeGreaterThanOrEqual(Math.max(16, device.side) - 0.5);
          expect(m.nav!.right, where).toBeLessThanOrEqual(
            device.width - Math.max(16, device.side) + 0.5,
          );
          expect(m.mainPaddingBottom, where).toBeGreaterThanOrEqual(
            64 + Math.max(12, device.bottom),
          );
        } else {
          // Rail (768–1023) or sidebar (≥1024): content starts to its right.
          expect(Math.round(m.nav!.width), where).toBe(
            (device.width >= 1024 ? 220 : 72) + device.side,
          );
          expect(m.h1Left, where).toBeGreaterThanOrEqual(m.nav!.right + 16);
        }
        await page.screenshot({ path: `${SHOTS_DIR}/matrix/${device.name}-${label}.png` });
      }
      await context.close();
    });
  }
});
