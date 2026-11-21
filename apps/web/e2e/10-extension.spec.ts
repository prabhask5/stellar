import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { type BrowserContext, chromium, type Page } from "@playwright/test";
import {
  clearLockout,
  ensureConfigured,
  expect,
  PIN,
  SHOTS_DIR,
  sql,
  test,
  uniqueIp,
  wipeData,
} from "./helpers";

const OWNER = "(select id from auth.users where email = 'owner@stellar.local')";
const EXTENSION = path.resolve(import.meta.dirname, "../../extension/.output/chrome-mv3");
// *.localhost resolves to this machine, which gives us a "site" to block that is really reachable.
const SITE = "blocked.localhost";

async function launch(
  baseURL: string,
): Promise<{ context: BrowserContext; id: string; dir: string }> {
  const dir = mkdtempSync(path.join(tmpdir(), "stellar-ext-"));
  const context = await chromium.launchPersistentContext(dir, {
    channel: "chromium",
    headless: true,
    args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
    viewport: { width: 1280, height: 800 },
    extraHTTPHeaders: { "x-forwarded-for": uniqueIp() },
    baseURL,
  });
  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker", { timeout: 20_000 }));
  return { context, id: new URL(worker.url()).host, dir };
}

async function connect(popup: Page, appUrl: string): Promise<void> {
  await popup
    .getByLabel("Stellar Planner address")
    .fill(`  ${appUrl.replace("http://", "")}/focus  `);
  await popup.getByRole("button", { name: "Continue" }).click();
  await expect(
    popup.getByRole("status").filter({ hasText: "Found Stellar Planner" }),
  ).toBeVisible();
  for (const digit of PIN) await popup.getByRole("button", { name: digit, exact: true }).click();
  await popup.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(popup.getByTestId("clock")).toHaveText("25:00", { timeout: 20_000 });
}

// The pages evaluated below are extension pages, where the `chrome` API exists.
interface ExtensionApi {
  declarativeNetRequest: { getDynamicRules: () => Promise<unknown[]> };
  action: { getBadgeText: (details: object) => Promise<string> };
  storage: { local: { get: (keys: null) => Promise<Record<string, unknown>> } };
}
declare const chrome: ExtensionApi;

const state = async () =>
  (
    await sql<{ status: string; phase: string }>(
      `select status, phase from sp_focus_state where user_id = ${OWNER}`,
    )
  )[0]!;
const rules = (popup: Page) =>
  popup.evaluate(() => chrome.declarativeNetRequest.getDynamicRules().then((r) => r.length));
const badge = (popup: Page) => popup.evaluate(() => chrome.action.getBadgeText({}));

test.describe("browser extension", () => {
  test.beforeEach(({ browserName }, info) => {
    test.skip(
      browserName !== "chromium" || info.project.name !== "desktop",
      "the extension is exercised once, in desktop Chromium",
    );
  });
  test.skip(
    !existsSync(path.join(EXTENSION, "manifest.json")),
    "build the extension first: pnpm --filter @stellar/extension build",
  );

  test.beforeAll(async ({ request }) => {
    await ensureConfigured(request);
  });
  test.beforeEach(async () => {
    await wipeData();
    clearLockout();
    await sql(`
      with l as (insert into sp_block_lists (user_id, name, sort_order) values (${OWNER}, 'Social', 1), (${OWNER}, 'News', 2) returning id, name)
      insert into sp_block_list_sites (user_id, block_list_id, pattern)
      select ${OWNER}, l.id, s from l, lateral unnest(case l.name when 'Social' then array['${SITE}', 'youtube.com'] else array['example.org'] end) s`);
    await sql(
      `update sp_focus_settings set active_block_list_ids = array(select id from sp_block_lists) where user_id = ${OWNER}`,
    );
  });

  test("connects with URL and PIN, mirrors the timer, and hard-blocks sites during focus", async ({
    baseURL,
  }) => {
    const { context, id, dir } = await launch(baseURL!);
    try {
      const popup = await context.newPage();
      await popup.setViewportSize({ width: 360, height: 600 });
      await popup.goto(`chrome-extension://${id}/popup.html`);
      await expect(popup.getByRole("heading", { name: "Connect your planner" })).toBeVisible();

      // A wrong PIN is refused with the server's generic message.
      await popup.getByLabel("Stellar Planner address").fill(baseURL!);
      await popup.getByRole("button", { name: "Continue" }).click();
      for (const digit of "000000")
        await popup.getByRole("button", { name: digit, exact: true }).click();
      await popup.getByRole("button", { name: "Connect", exact: true }).click();
      await expect(
        popup.getByRole("alert").filter({ hasText: "That PIN didn't work" }),
      ).toBeVisible();
      await popup.getByRole("button", { name: "Use a different address" }).click();

      await connect(popup, baseURL!);
      await expect(popup.getByRole("status").filter({ hasText: "Synced" })).toBeVisible();
      await expect(popup.getByText("Blocks during focus")).toBeVisible();
      expect(
        (await sql(`select kind from sp_devices where kind = 'extension' and revoked_at is null`))
          .length,
      ).toBe(1);
      expect(await rules(popup)).toBe(0);
      expect(await badge(popup)).toBe("");

      // A tab already open on a site that is about to be blocked.
      const open = await context.newPage();
      await open.goto(`http://${SITE}:3100/api/health`);
      await expect(open.locator("body")).toContainText('"status":"ok"');

      // Start from the popup: every device follows, and blocking begins.
      await popup.getByRole("button", { name: "Start focus" }).click();
      await expect(popup.getByTestId("clock")).toHaveText(/^24:5\d$/);
      await expect(popup.getByText("Blocking now")).toBeVisible();
      await expect.poll(async () => (await state()).status).toBe("running");
      await expect.poll(() => rules(popup)).toBe(3);
      expect(await badge(popup)).toBe("25");
      await popup.screenshot({ path: `${SHOTS_DIR}/desktop/extension-popup.png` });

      // The already-open tab was redirected to the block page, which counts down live.
      await expect(open).toHaveURL(
        new RegExp(
          `^chrome-extension://${id}/blocked\\.html\\?site=${SITE.replace(".", "\\.")}#http://${SITE.replace(".", "\\.")}:3100/api/health$`,
        ),
      );
      await expect(open.getByRole("heading", { name: "This orbit is closed." })).toBeVisible();
      await expect(open.getByText(`${SITE} is blocked until your focus phase ends.`)).toBeVisible();
      await expect(open.getByText("Focus · Round 1 of 4")).toBeVisible();
      const first = await open.getByTestId("countdown").innerText();
      await expect(open.getByTestId("countdown")).not.toHaveText(first, { timeout: 3000 });
      await expect(
        open.getByText(/Synced with 127\.0\.0\.1:3100 · Blocking Social, News/),
      ).toBeVisible();
      await open.screenshot({ path: `${SHOTS_DIR}/desktop/extension-blocked.png` });
      // No bypass is offered.
      await expect(open.getByRole("link")).toHaveCount(0);
      await expect(open.getByRole("button")).toHaveCount(0);

      // New navigations are redirected before they reach the network, subdomains included.
      const fresh = await context.newPage();
      await fresh.goto("https://www.youtube.com/watch?v=abc&t=10").catch(() => undefined);
      await expect(fresh).toHaveURL(
        /blocked\.html\?site=youtube\.com#https:\/\/www\.youtube\.com\/watch\?v=abc&t=10$/,
      );
      await expect(
        fresh.getByText("youtube.com is blocked until your focus phase ends."),
      ).toBeVisible();
      // A site that is not listed loads normally.
      await fresh.goto(`${baseURL}/api/health`);
      await expect(fresh.locator("body")).toContainText('"status":"ok"');

      // Pausing (here from "another device": the database) keeps the block on.
      await sql(
        `select sp__timer_apply(${OWNER}, 'pause', (select version from sp_focus_state where user_id = ${OWNER}), now())`,
      );
      await expect(open.getByText("paused", { exact: true })).toBeVisible({ timeout: 8000 });
      await expect(popup.getByRole("button", { name: "Resume" })).toBeVisible();
      expect(await rules(popup)).toBe(3);
      await fresh.goto(`http://${SITE}:3100/api/health`).catch(() => undefined);
      await expect(fresh).toHaveURL(/blocked\.html/);

      // Removing a list's site on another device updates the rules live.
      await sql(`delete from sp_block_list_sites where pattern = 'example.org'`);
      await expect.poll(() => rules(popup), { timeout: 8000 }).toBe(2);

      // Leaving the focus phase lifts the block everywhere and offers the original address.
      await popup.getByRole("button", { name: "Skip phase" }).click();
      await expect.poll(async () => (await state()).phase).toBe("short_break");
      await expect.poll(() => rules(popup)).toBe(0);
      await expect(open.getByRole("heading", { name: "Focus complete" })).toBeVisible();
      const link = open.getByRole("link", { name: `Continue to ${SITE}` });
      await expect(link).toHaveAttribute("href", `http://${SITE}:3100/api/health`);
      await link.click();
      await expect(open.locator("body")).toContainText('"status":"ok"');
      expect(await badge(popup)).toBe("");

      // Breaks show "B" on the badge and never block.
      await popup.getByRole("button", { name: "Start short break" }).click();
      await expect.poll(() => badge(popup)).toBe("B");
      expect(await rules(popup)).toBe(0);

      // Disconnect clears the session and any rules.
      await popup.getByRole("button", { name: "End session" }).click();
      await popup.getByRole("button", { name: "Settings" }).click();
      await expect(popup.getByText(baseURL!)).toBeVisible();
      await popup.getByRole("button", { name: "Disconnect" }).click();
      await expect(popup.getByRole("heading", { name: "Connect your planner" })).toBeVisible();
      expect(
        await popup.evaluate(() =>
          chrome.storage.local.get(null).then((all) => Object.keys(all).length),
        ),
      ).toBe(0);
    } finally {
      await context.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("keeps blocking offline until the cached phase end, then lifts by itself", async ({
    baseURL,
  }) => {
    const { context, id, dir } = await launch(baseURL!);
    try {
      const popup = await context.newPage();
      await popup.goto(`chrome-extension://${id}/popup.html`);
      await connect(popup, baseURL!);
      // A focus phase with five seconds left.
      await sql(
        `select sp__timer_apply(${OWNER}, 'start', (select version from sp_focus_state where user_id = ${OWNER}), now() - interval '24 minutes 55 seconds')`,
      );
      await expect.poll(() => rules(popup), { timeout: 8000 }).toBe(3);

      await context.setOffline(true);
      const tab = await context.newPage();
      await tab.goto("https://www.youtube.com/").catch(() => undefined);
      await expect(tab).toHaveURL(/blocked\.html\?site=youtube\.com/);
      // With no network at all, the alarm set for phase_ends_at removes the rules.
      await expect.poll(() => rules(popup), { timeout: 15_000 }).toBe(0);
      await expect(tab.getByRole("heading", { name: "Focus complete" })).toBeVisible();
      await context.setOffline(false);
    } finally {
      await context.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
