import { mkdirSync } from "node:fs";
import path from "node:path";
import { LATEST_SCHEMA_VERSION } from "@stellar/db";
import {
  ANON_KEY,
  clearLockout,
  DATABASE_URL,
  enterPin,
  expect,
  isTouch,
  PIN,
  resetInstance,
  SERVICE_KEY,
  SHOTS_DIR,
  sql,
  SUPABASE_URL,
  test,
  uniqueIp,
} from "./helpers";

test.describe("setup wizard", () => {
  test.beforeEach(async () => {
    await resetInstance();
    clearLockout();
  });

  test("an unconfigured instance sends every route to /setup", async ({ page, request }) => {
    for (const path of ["/", "/tasks", "/focus", "/lock", "/settings"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/setup$/);
    }
    const instance = await (await request.get("/api/v1/instance")).json();
    expect(instance).toMatchObject({
      name: "Stellar Planner",
      apiVersion: 1,
      configured: false,
      supabaseUrl: null,
      supabaseAnonKey: null,
    });
    const pin = await request.post("/api/v1/auth/pin", {
      data: { pin: PIN, device: { name: "x", kind: "web" } },
    });
    expect(pin.status()).toBe(503);
    expect((await pin.json()).error.code).toBe("not_configured");
  });

  test("full flow: connect, migrate, PIN, profile, done", async ({ page, shot }, info) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Stellar Planner" })).toBeVisible();
    await expect(page.getByText("/data/secret")).toBeVisible();
    await shot("setup-1-welcome");
    await page.getByRole("button", { name: "Get started" }).click();

    // Connect: a sloppy URL is normalised, and the checks say so.
    await expect(page.getByRole("heading", { name: "Connect Supabase" })).toBeVisible();
    await page
      .getByLabel("Supabase URL")
      .fill(`  ${SUPABASE_URL.replace("http://", "")}/rest/v1/  `);
    await page.getByLabel("Anon key").fill("not-a-real-key");
    await page.getByLabel("Service role key").fill(SERVICE_KEY);
    await page.getByRole("button", { name: "Test and continue" }).click();
    const checks = page.getByTestId("checks");
    await expect(checks.locator('[data-ok="false"]').first()).toBeVisible();
    await expect(checks).toContainText(`Found Supabase at ${SUPABASE_URL}`);
    await expect(checks).toContainText("rejected the anon key");
    await shot("setup-2-connect-error");

    await page.getByLabel("Anon key").fill(ANON_KEY);
    await page.getByLabel(/Postgres connection string/).fill(DATABASE_URL);
    await page.getByRole("button", { name: "Test and continue" }).click();

    // Database: migrations run automatically with a progress list.
    await expect(page.getByRole("heading", { name: "Prepare the database" })).toBeVisible();
    await expect(page.getByTestId("db-ready")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("migrations").locator("li")).toHaveCount(LATEST_SCHEMA_VERSION);
    await expect(page.getByTestId("migrations").locator('[data-status="failed"]')).toHaveCount(0);
    await shot("setup-3-database");
    await page.getByRole("button", { name: "Continue" }).click();

    // PIN: entered twice; a mismatch starts over.
    await expect(page.getByRole("heading", { name: "Create your PIN" })).toBeVisible();
    if (isTouch(info.project.name)) await expect(page.getByLabel("Keypad")).toBeVisible();
    else await expect(page.getByText("Type your PIN, then press Enter.")).toBeVisible();
    await shot("setup-4-pin");
    await enterPin(page, PIN, info.project.name);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: "Enter it again" })).toBeVisible();
    await enterPin(page, "111111", info.project.name);
    await page.getByRole("button", { name: "Set PIN" }).click();
    await expect(page.getByText("Those didn't match. Start again.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Create your PIN" })).toBeVisible();
    await enterPin(page, PIN, info.project.name);
    await page.getByRole("button", { name: "Continue" }).click();
    await enterPin(page, PIN, info.project.name);
    await page.getByRole("button", { name: "Set PIN" }).click();

    // About you
    await expect(page.getByRole("heading", { name: "About you" })).toBeVisible({ timeout: 20_000 });
    await expect(page).toHaveURL(/step=profile/);
    await page.getByLabel("Time zone").selectOption("Europe/Berlin");
    await page.getByRole("radio", { name: "Sunday" }).click();
    await page.getByLabel("Birthdate").fill("1990-05-17");
    await page.getByLabel("Lifespan").fill("90");
    await shot("setup-5-profile");
    await page.getByRole("button", { name: "Continue" }).click();

    // Done
    await expect(page.getByRole("heading", { name: "You’re all set" })).toBeVisible();
    await expect(page.getByText("GOTRUE_DISABLE_SIGNUP=true")).toBeVisible();
    await shot("setup-6-done");
    await page.getByRole("button", { name: "Enter your universe" }).click();
    await expect(page).toHaveURL(/\/$/);

    // What the server did behind the scenes.
    const [owner] = await sql<{ id: string; confirmed: boolean }>(
      "select id, email_confirmed_at is not null as confirmed from auth.users where email = 'owner@stellar.local'",
    );
    expect(owner?.confirmed).toBe(true);
    const [settings] = await sql(
      "select timezone, week_start, to_char(birthdate, 'YYYY-MM-DD') as birthdate, lifespan_years from sp_settings where user_id = $1",
      [owner!.id],
    );
    expect(settings).toEqual({
      timezone: "Europe/Berlin",
      week_start: 0,
      birthdate: "1990-05-17",
      lifespan_years: 90,
    });
    const devices = await sql(
      "select name, kind, auth_session_id is not null as linked from sp_devices where user_id = $1",
      [owner!.id],
    );
    expect(devices).toHaveLength(1);
    expect(devices[0]).toMatchObject({ kind: "web", linked: true });
    const events = await sql("select kind from sp_auth_events where user_id = $1", [owner!.id]);
    expect(events.map((e) => e.kind)).toContain("pin_success");

    // The session cookie is httpOnly and the instance is now discoverable.
    const cookies = await page.context().cookies();
    const auth = cookies.filter((c) => c.name.startsWith("sp-auth"));
    expect(auth.length).toBeGreaterThan(0);
    expect(auth.every((c) => c.httpOnly)).toBe(true);
    const instance = await (await page.request.get("/api/v1/instance")).json();
    expect(instance).toMatchObject({
      configured: true,
      supabaseUrl: SUPABASE_URL,
      supabaseAnonKey: ANON_KEY,
    });
    expect(instance.vapidPublicKey).toBeTruthy();

    // Setup is closed for good.
    await page.goto("/setup");
    await expect(page).toHaveURL(/\/$/);
    const again = await page.request.post("/api/setup/pin", {
      data: { pin: "999999", confirm: "999999", device: { name: "x", kind: "web" } },
    });
    expect(again.status()).toBe(403);
  });

  test("manual path: copy the SQL, run it, verify", async ({ browser, baseURL }, info) => {
    // The migrate call is stubbed. WebKit does not offer requests to page.route once a
    // service worker controls the page, so this test runs without one.
    const context = await browser.newContext({
      ...info.project.use,
      baseURL,
      serviceWorkers: "block",
      extraHTTPHeaders: { "x-forwarded-for": uniqueIp() },
    });
    const page = await context.newPage();
    const shot = async (name: string) => {
      const dir = path.join(SHOTS_DIR, info.project.name);
      mkdirSync(dir, { recursive: true });
      await page.screenshot({ path: path.join(dir, `${name}.png`), animations: "disabled" });
    };
    // No connection string and no pg-meta route: the wizard falls back to paste-and-verify.
    await page.route("**/api/setup/migrate", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/x-ndjson",
        body: `${JSON.stringify({ type: "plan", migrations: [] })}\n${JSON.stringify({ type: "result", ok: false, method: "manual", error: "No automatic route to the database is available." })}\n`,
      });
    });
    await page.goto("/setup");
    await page.getByRole("button", { name: "Get started" }).click();
    await page.getByLabel("Supabase URL").fill(SUPABASE_URL);
    await page.getByLabel("Anon key").fill(ANON_KEY);
    await page.getByLabel("Service role key").fill(SERVICE_KEY);
    await page.getByRole("button", { name: "Test and continue" }).click();

    await expect(
      page.getByText("Open your Supabase Studio SQL editor, paste, and run it."),
    ).toBeVisible();
    const script = await page.getByLabel("Setup SQL").inputValue();
    expect(script).toContain("create table if not exists public.sp_schema_version");
    expect(script).toContain("sp_timer_action");
    await shot("setup-3-database-manual");

    // Before the SQL has been run, Verify explains what is missing.
    await sql("drop table if exists public.sp_schema_version cascade");
    await sql("notify pgrst, 'reload schema'");
    await page.getByRole("button", { name: "Verify" }).click();
    await expect(page.getByText(/were not found yet|Run the SQL/)).toBeVisible({ timeout: 15_000 });

    // The owner pastes the script into Studio (here: straight into Postgres) and verifies again.
    await sql(script);
    await page.getByRole("button", { name: "Verify" }).click();
    await expect(page.getByTestId("db-ready")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: "Create your PIN" })).toBeVisible();
    await context.close();
  });
});
