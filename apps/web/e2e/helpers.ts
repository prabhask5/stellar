import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
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
  const file = path.resolve(import.meta.dirname, "../../../dev/supabase/dev.env");
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
export const DATA_DIR = path.resolve(import.meta.dirname, ".tmp/data");
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
        last_completed_at = null, last_completed_phase = null, notified_phase_end_at = null where user_id = uid;
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
  return projectName === "iphone-15-pro" ? "island" : "none";
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

export const test = base.extend<{ shot: (name: string) => Promise<void> }>({
  extraHTTPHeaders: async ({}, use) => {
    await use({ "x-forwarded-for": uniqueIp() });
  },
  page: async ({ page }, use, testInfo) => {
    await applyInsets(page, insetsFor(testInfo.project.name));
    await use(page);
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

export const isPhone = (projectName: string) => projectName.startsWith("iphone");

/** Enters a PIN the way the device would: keypad taps on touch, typing with a keyboard. */
export async function enterPin(page: Page, pin: string, projectName: string): Promise<void> {
  if (isPhone(projectName)) {
    for (const digit of pin) await page.getByRole("button", { name: digit, exact: true }).tap();
  } else {
    await page.keyboard.type(pin, { delay: 15 });
  }
}
