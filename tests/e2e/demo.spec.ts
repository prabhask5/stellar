// Demo mode (/demo): the real interface on sample data, for visitors to the owner's
// instance. The promise under test is absolute: no request for data ever leaves the
// browser, the owner's data never appears, and nothing done in the demo is kept.
import { expect as baseExpect, type Page, type Request } from "@playwright/test";
import {
  ensureConfigured,
  expect,
  signIn,
  sql,
  SUPABASE_URL,
  test,
  wipeData,
} from "./support/helpers";
import { expectInvariants } from "./support/invariants";

const OWNER = "(select id from auth.users where email = 'owner@stellar.local')";
const SECRET = "OWNER-ONLY do not show 7f3a";

/** Every request that could carry data: our own API and anything to Supabase. */
function watchData(page: Page): string[] {
  const seen: string[] = [];
  const supabase = new URL(SUPABASE_URL).host;
  const note = (r: Request) => {
    const url = new URL(r.url());
    if (url.pathname.startsWith("/api/") || url.host === supabase)
      seen.push(`${r.method()} ${url.host}${url.pathname}`);
  };
  page.on("request", note);
  page.on("websocket", (ws) => seen.push(`WS ${ws.url().slice(0, 80)}`));
  return seen;
}

async function tour(page: Page): Promise<void> {
  await expect(page.getByTestId("demo-banner")).toBeVisible();
  await expect(page.getByTestId("today-card")).toContainText("Plan the week");
  await page.goto("/tasks");
  await expect(page.getByTestId("today-tab")).toContainText("Call the dentist");
  // Changes work, on screen.
  await page.getByLabel("Task name").first().fill("Tried the demo");
  await page.getByLabel("Task name").first().press("Enter");
  await expect(page.getByTestId("today-tab")).toContainText("Tried the demo");
  await page
    .getByTestId("today-tab")
    .getByRole("checkbox", { name: /Tried the demo/ })
    .click();
  await expectInvariants(page, "demo tasks");
  await page.goto("/goals");
  await expect(page.getByRole("button", { name: /^Open Health/ })).toBeVisible();
  await page.goto("/routines");
  await expect(page.getByTestId("day-panel")).toContainText("Meditate");
  await page.goto("/focus");
  await page.getByRole("button", { name: "Start focus" }).click();
  await expect(page.getByTestId("focus")).toHaveAttribute("data-status", "running");
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "General" })).toBeVisible();
  // Nothing on the page asked the server for anything, so nothing failed to load.
  await page.waitForTimeout(500);
  await expect(page.getByTestId("data-status")).toHaveCount(0);
  for (const hidden of ["Security", "Connection", "Data", "Extension"])
    await expect(page.getByRole("heading", { name: hidden, exact: true })).toHaveCount(0);
  await expectInvariants(page, "demo settings");
}

test.describe("demo mode", () => {
  test.beforeAll(async ({ request }) => {
    await ensureConfigured(request);
  });
  test.beforeEach(async () => {
    await wipeData();
    await sql(
      `insert into sp_tasks (user_id, name, due_date) values (${OWNER}, '${SECRET}', sp__today(${OWNER}))`,
    );
  });

  test("a visitor can tour the app without a single request for data", async ({ page }) => {
    const data = watchData(page);
    await page.goto("/demo");
    await expect(page.getByRole("heading", { name: "Try the demo" })).toBeVisible();
    await page.getByRole("switch", { name: "Demo mode" }).click();
    await page.waitForURL((u) => u.pathname === "/");
    await tour(page);
    expect(data, "requests for data made in demo mode").toEqual([]);
    await expect(page.getByText(SECRET)).toHaveCount(0);

    // Nothing was kept: no sync queue, no cached copy, and a reload starts over.
    expect(
      await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name)),
    ).toEqual([]);
    await page.goto("/tasks");
    await expect(page.getByTestId("today-tab")).toContainText("Call the dentist");
    await expect(page.getByText("Tried the demo")).toHaveCount(0);
    expect((await sql(`select count(*)::int as n from sp_tasks`))[0]!.n).toBe(1);
  });

  test("the demo cookie opens pages, never data", async ({ page, request, baseURL }) => {
    const cookie = { Cookie: "sp-demo=1" };
    for (const path of [
      "/api/v1/tasks",
      "/api/v1/auth/session",
      "/api/v1/export",
      "/api/setup/connection",
    ]) {
      const res = await request.get(path, { headers: cookie });
      baseExpect(res.status(), path).toBe(401);
    }
    // The page a visitor receives has no data in it at all.
    const html = await (await request.get("/tasks", { headers: cookie })).text();
    expect(html).not.toContain(SECRET);
    // Signing in is not part of the demo.
    await page.context().addCookies([{ name: "sp-demo", value: "1", url: baseURL! }]);
    await page.goto("/lock");
    await expect(page).toHaveURL(/\/demo$/);
    // Leaving the demo leads to the PIN screen like any signed-out visitor.
    await page.getByRole("switch", { name: "Demo mode" }).click();
    await expect(page).toHaveURL(/\/lock/);
    await page.goto("/tasks");
    await expect(page).toHaveURL(/\/lock/);
  });

  test("on the owner's own signed-in browser, the demo shows and touches none of their data", async ({
    page,
    context,
  }) => {
    await signIn(context);
    // First the real app, so this browser holds the owner's cached data and session.
    await page.goto("/tasks");
    await expect(page.getByTestId("today-tab")).toContainText(SECRET);

    // In through the button in the owner's own Settings.
    await page.goto("/settings");
    await page.getByRole("button", { name: /Demo mode/ }).click();
    await expect(page.getByTestId("demo-banner")).toBeVisible();
    const data = watchData(page);
    await page.goto("/");
    await tour(page);
    expect(data, "requests for data made in demo mode").toEqual([]);
    for (const path of ["/", "/tasks", "/goals", "/routines", "/focus", "/settings"]) {
      await page.goto(path);
      await expect(page.getByTestId("demo-banner")).toBeVisible();
      await expect(page.getByText(SECRET)).toHaveCount(0);
    }
    // Out of the demo: the owner's data is as it was, and nothing from the demo followed.
    await page.getByRole("button", { name: "Exit" }).click();
    await page.waitForURL((u) => u.pathname === "/");
    await page.goto("/tasks");
    await expect(page.getByTestId("today-tab")).toContainText(SECRET);
    await expect(page.getByText("Tried the demo")).toHaveCount(0);
    await page.waitForTimeout(1500);
    expect(await sql(`select name from sp_tasks order by name`)).toEqual([{ name: SECRET }]);
    expect((await sql(`select status from sp_focus_state`))[0]?.status ?? "idle").toBe("idle");
  });
});
