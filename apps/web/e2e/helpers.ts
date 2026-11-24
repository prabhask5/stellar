import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import {
  type APIRequestContext,
  type BrowserContext,
  expect,
  type Page,
  test as base,
} from "@playwright/test";
import pg from "pg";

/** Dev-only values for the local stack (dev/supabase/dev.env). */
function devEnv(): Record<string, string> {
  // E2E_STACK_ENV points the suite at another local stack (the official bundle, see dev/supabase-official).
  const file = process.env.E2E_STACK_ENV
    ? path.resolve(process.env.E2E_STACK_ENV)
    : path.resolve(import.meta.dirname, "../../../dev/supabase/dev.env");
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (m?.[1]) out[m[1]] = m[2] ?? "";
  }
  return out;
}

export const ENV = devEnv();
export const SUPABASE_URL = ENV.SUPABASE_URL ?? "http://127.0.0.1:54321";
export const ANON_KEY = ENV.SUPABASE_ANON_KEY ?? "";
export const SERVICE_KEY = ENV.SUPABASE_SERVICE_ROLE_KEY ?? "";
export const DATABASE_URL = ENV.DATABASE_URL ?? "";
export const PIN = "246810";
export const DATA_DIR = path.resolve(import.meta.dirname, process.env.E2E_DATA_DIR ?? ".tmp/data");
export const SHOTS_DIR = path.resolve(import.meta.dirname, ".tmp/shots");
export const DEVICE = { name: "Playwright", kind: "web" } as const;

export async function sql<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  client.on("error", () => {});
  await client.connect();
  try {
    return (await client.query<T>(text, params as never[])).rows;
  } finally {
    await client.end();
  }
}

/** Back to a brand-new, unconfigured instance: no config, no owner, no data. */
export async function resetInstance(): Promise<void> {
  for (const f of ["config.json", "lockout.json"]) rmSync(path.join(DATA_DIR, f), { force: true });
  await sql("delete from auth.users where email = 'owner@stellar.local'");
}

export function clearLockout(): void {
  rmSync(path.join(DATA_DIR, "lockout.json"), { force: true });
}

/** Removes the owner's content but keeps the account, settings and session. */
export async function wipeData(): Promise<void> {
  await sql(`
    do $$
    declare uid uuid := (select id from auth.users where email = 'owner@stellar.local');
    begin
      if uid is null then return; end if;
      delete from public.sp_tasks where user_id = uid;
      delete from public.sp_task_lists where user_id = uid;
      delete from public.sp_goals where user_id = uid;
      delete from public.sp_goal_lists where user_id = uid;
      delete from public.sp_routines where user_id = uid;
      delete from public.sp_block_lists where user_id = uid;
      delete from public.sp_focus_sessions where user_id = uid;
      delete from public.sp_universe_events where user_id = uid;
      delete from public.sp_quotes where user_id = uid;
      delete from public.sp_tombstones where user_id = uid;
      delete from public.sp_push_subscriptions where user_id = uid;
      update public.sp_focus_state set status = 'idle', phase = 'focus', round = 1, phase_started_at = null,
        phase_ends_at = null, paused_remaining_ms = null, phase_total_ms = null, session_id = null,
        last_completed_at = null, last_completed_phase = null, notified_phase_end_at = null, version = 0 where user_id = uid;
      update public.sp_focus_settings set focus_min = 25, short_break_min = 5, long_break_min = 15,
        rounds_before_long = 4, auto_start_breaks = false, auto_start_focus = false, active_block_list_ids = '{}'
        where user_id = uid;
      update public.sp_settings set timezone = 'UTC', week_start = 1, birthdate = null, lifespan_years = 85,
        quality_tier = 'minimal', show_completed = false, lock_after_minutes = null where user_id = uid;
    end $$;`);
}

export async function ownerId(): Promise<string> {
  const rows = await sql<{ id: string }>(
    "select id from auth.users where email = 'owner@stellar.local'",
  );
  if (!rows[0]) throw new Error("Owner does not exist yet");
  return rows[0].id;
}

/** Performs the whole setup through the HTTP API (the wizard itself is covered by its own spec). */
export async function ensureConfigured(request: APIRequestContext): Promise<void> {
  const health = await (await request.get("/api/health")).json();
  if (health.configured) return;
  const connect = await request.post("/api/setup/connect", {
    data: {
      url: SUPABASE_URL,
      anonKey: ANON_KEY,
      serviceRoleKey: SERVICE_KEY,
      databaseUrl: DATABASE_URL,
    },
  });
  expect((await connect.json()).saved, "connect").toBe(true);
  const migrate = await request.post("/api/setup/migrate");
  expect(await migrate.text(), "migrate").toContain('"type":"result","ok":true');
  const pin = await request.post("/api/setup/pin", {
    data: { pin: PIN, confirm: PIN, device: DEVICE },
  });
  expect(pin.ok(), `pin: ${await pin.text()}`).toBe(true);
}

/** Signs a browser context in with the PIN, so pages open already unlocked. */
export async function signIn(context: BrowserContext): Promise<void> {
  clearLockout();
  const res = await context.request.post("/api/v1/auth/pin", {
    data: { pin: PIN, device: DEVICE },
  });
  expect(res.ok(), `sign in: ${await res.text()}`).toBe(true);
  await context.addInitScript(() => {
    try {
      localStorage.setItem("sp-pin-length", "6");
    } catch {
      // ignored
    }
  });
}

export type Insets = "island" | "notch" | "landscape" | "none";

export function insetsFor(projectName: string): Insets {
  if (projectName.includes("landscape")) return "landscape";
  return projectName.includes("iphone-15-pro") ? "island" : "none";
}

/** Simulates device safe areas with the test-only class (SPEC §9.1). */
export async function applyInsets(page: Page, insets: Insets): Promise<void> {
  if (insets === "none") return;
  await page.addInitScript((cls) => {
    // React owns <html>'s attributes during hydration, so keep the class in place.
    const add = () => {
      const el = document.documentElement;
      if (el && !el.classList.contains(cls)) el.classList.add(cls);
    };
    const watch = () => {
      add();
      new MutationObserver(add).observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class"],
      });
    };
    if (document.documentElement) watch();
    else document.addEventListener("readystatechange", watch, { once: true });
  }, `sp-insets-${insets}`);
}

let ipCounter = 0;
/** A distinct client address, so per-IP rate limits never couple unrelated tests. */
export function uniqueIp(): string {
  ipCounter += 1;
  const n = (process.pid * 131 + ipCounter) % 65_000;
  return `10.${Math.floor(Math.random() * 250) + 1}.${Math.floor(n / 250) + 1}.${(n % 250) + 1}`;
}

/**
 * Sweep mode (POLISH_SPEC §2.1): with AUDIT_LOG=<file>, every page records console
 * errors and warnings, uncaught exceptions, failed or 4xx/5xx requests and layout
 * shift as JSON lines, tagged with the project and test that produced them.
 */
const AUDIT_LOG = process.env.AUDIT_LOG;

export function attachAudit(
  page: Page,
  where: { project: string; test: string },
): () => Promise<void> {
  if (!AUDIT_LOG) return async () => {};
  const log = (kind: string, detail: Record<string, unknown>) =>
    appendFileSync(
      AUDIT_LOG,
      `${JSON.stringify({ kind, ...where, url: safeUrl(page), ...detail })}\n`,
    );
  page.on("console", (msg) => {
    const type = msg.type();
    if (type === "error" || type === "warning")
      log(`console.${type}`, { text: msg.text().slice(0, 600), at: msg.location().url });
  });
  page.on("pageerror", (err) =>
    log("pageerror", { text: `${err.name}: ${err.message}`.slice(0, 600) }),
  );
  page.on("requestfailed", (req) =>
    log("requestfailed", {
      request: `${req.method()} ${req.url()}`,
      text: req.failure()?.errorText,
    }),
  );
  page.on("response", (res) => {
    if (res.status() >= 400)
      log("http", { request: `${res.request().method()} ${res.url()}`, status: res.status() });
  });
  void page.addInitScript(() => {
    const w = window as unknown as { __spCls?: number; __spRejections?: string[] };
    w.__spCls = 0;
    w.__spRejections = [];
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as unknown as {
          value: number;
          hadRecentInput: boolean;
        }[])
          if (!e.hadRecentInput) w.__spCls = (w.__spCls ?? 0) + e.value;
      }).observe({ type: "layout-shift", buffered: true });
    } catch {
      // layout-shift entries are Chromium-only
    }
    window.addEventListener("unhandledrejection", (e) => {
      w.__spRejections?.push(
        String((e.reason as Error | undefined)?.message ?? e.reason).slice(0, 300),
      );
    });
  });
  return async () => {
    if (page.isClosed()) return;
    const r = await page
      .evaluate(() => {
        const w = window as unknown as { __spCls?: number; __spRejections?: string[] };
        return { cls: w.__spCls ?? 0, rejections: w.__spRejections ?? [] };
      })
      .catch(() => null);
    if (!r) return;
    if (r.cls > 0.02) log("cls", { value: Number(r.cls.toFixed(4)) });
    for (const text of r.rejections) log("unhandledrejection", { text });
  };
}

function safeUrl(page: Page): string {
  try {
    return page.isClosed() ? "(closed)" : page.url().replace(/^https?:\/\/[^/]+/, "");
  } catch {
    return "(unknown)";
  }
}

export const test = base.extend<{ shot: (name: string) => Promise<void> }>({
  extraHTTPHeaders: async ({}, use) => {
    await use({ "x-forwarded-for": uniqueIp() });
  },
  page: async ({ page }, use, testInfo) => {
    await applyInsets(page, insetsFor(testInfo.project.name));
    const finish = attachAudit(page, {
      project: testInfo.project.name,
      test: testInfo.titlePath.slice(1).join(" › "),
    });
    await use(page);
    await finish();
  },
  shot: async ({ page }, use, testInfo) => {
    await use(async (name: string) => {
      const dir = path.join(SHOTS_DIR, testInfo.project.name);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      await page.screenshot({ path: path.join(dir, `${name}.png`), animations: "disabled" });
    });
  },
});

export { expect };

/** An iPhone project of either engine (touch input, iOS user agent). */
export const isTouch = (projectName: string) => projectName.includes("iphone");
/** A project that gets the phone layout (tab bar, sheets). Landscape is 852px wide: the rail layout. */
export const isPhone = (projectName: string) =>
  isTouch(projectName) && !projectName.includes("landscape");
export const isWebKit = (projectName: string) => projectName.startsWith("webkit");

/** Enters a PIN the way the device would: keypad taps on touch, typing with a keyboard. */
export async function enterPin(page: Page, pin: string, projectName: string): Promise<void> {
  // The pad listens for keys once it has hydrated; typing earlier would go nowhere.
  await page.locator('[data-testid="pin-pad"][data-ready]').last().waitFor();
  if (isTouch(projectName)) {
    for (const digit of pin) await page.getByRole("button", { name: digit, exact: true }).tap();
  } else {
    await page.keyboard.type(pin, { delay: 15 });
  }
}

/**
 * A touch swipe. Chromium gets genuine touch input through the DevTools protocol
 * (touchstart → touchmove… → touchend). WebKit and Firefox have no touch-drag
 * automation, so they get the pointer-event sequence a finger produces, dispatched
 * on the element under the start point.
 */
export async function swipe(
  page: Page,
  from: { x: number; y: number },
  dx: number,
  dy = 0,
  steps = 10,
  opts: { hold?: number; stepDelay?: number } = {},
): Promise<void> {
  const stepDelay = opts.stepDelay ?? 16;
  if (page.context().browser()?.browserType().name() === "chromium") {
    const cdp = await page.context().newCDPSession(page);
    const point = (x: number, y: number) => [{ x: Math.round(x), y: Math.round(y), id: 1 }];
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: point(from.x, from.y),
    });
    if (opts.hold) await page.waitForTimeout(opts.hold);
    for (let i = 1; i <= steps; i++) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: point(from.x + (dx * i) / steps, from.y + (dy * i) / steps),
      });
      await page.waitForTimeout(stepDelay);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await cdp.detach();
    return;
  }
  const fire = (type: string, x: number, y: number) =>
    page.evaluate(
      ([t, px, py, sx, sy]) => {
        const w = window as unknown as { __spSwipeTarget?: Element | null };
        if (t === "pointerdown") w.__spSwipeTarget = document.elementFromPoint(sx, sy);
        const target = w.__spSwipeTarget ?? document.body;
        const init = {
          bubbles: true,
          cancelable: true,
          composed: true,
          pointerId: 7,
          pointerType: "touch",
          isPrimary: true,
          clientX: px,
          clientY: py,
          screenX: px,
          screenY: py,
          button: t === "pointermove" ? -1 : 0,
          buttons: t === "pointerup" ? 0 : 1,
          width: 24,
          height: 24,
          pressure: t === "pointerup" ? 0 : 0.5,
        };
        const touchInit = () => {
          const touch = new Touch({ identifier: 7, target, clientX: px, clientY: py });
          const list = t === "pointerup" ? [] : [touch];
          return {
            bubbles: true,
            cancelable: true,
            composed: true,
            touches: list,
            targetTouches: list,
            changedTouches: [touch],
          };
        };
        const touchType = {
          pointerdown: "touchstart",
          pointermove: "touchmove",
          pointerup: "touchend",
        }[t] as string;
        target.dispatchEvent(new PointerEvent(t, init));
        try {
          if (typeof Touch === "function")
            target.dispatchEvent(new TouchEvent(touchType, touchInit()));
        } catch {
          // Desktop WebKit builds expose Touch but cannot construct it; pointer events carry the gesture.
        }
        if (t === "pointerup") w.__spSwipeTarget = null;
      },
      [type, x, y, from.x, from.y] as const,
    );
  await fire("pointerdown", from.x, from.y);
  if (opts.hold) await page.waitForTimeout(opts.hold);
  for (let i = 1; i <= steps; i++) {
    await fire("pointermove", from.x + (dx * i) / steps, from.y + (dy * i) / steps);
    await page.waitForTimeout(stepDelay);
  }
  await fire("pointerup", from.x + dx, from.y + dy);
}
