// Store screenshots for the Stellar Focus listing (Chrome Web Store, addons.mozilla.org).
// Drives the real built extension against the local test instance with sample data and
// writes 1280×800 images to docs/extension-store/. Opt-in, like the other audit specs:
//
//   pnpm --filter @stellar/extension build
//   AUDIT=1 npx playwright test e2e/audit/store-screenshots.spec.ts --project=desktop
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { type BrowserContext, chromium, type Page } from "@playwright/test";
import {
  clearLockout,
  ensureConfigured,
  expect,
  PIN,
  signIn,
  sql,
  test,
  uniqueIp,
  wipeData,
} from "../helpers";

const OWNER = "(select id from auth.users where email = 'owner@stellar.local')";
const EXTENSION = path.resolve(import.meta.dirname, "../../../extension/.output/chrome-mv3");
const OUT = path.resolve(import.meta.dirname, "../../../../docs/extension-store");
const SIZE = { width: 1280, height: 800 };

/** A store image: the popup as it hangs from the toolbar, over the page behind it. */
async function compose(
  context: BrowserContext,
  background: Buffer,
  popup: Buffer,
  file: string,
  caption: string,
): Promise<void> {
  const page = await context.newPage();
  await page.setViewportSize(SIZE);
  const uri = (b: Buffer) => `data:image/png;base64,${b.toString("base64")}`;
  await page.setContent(`
    <style>
      html, body { margin: 0; width: 1280px; height: 800px; overflow: hidden; background: #070615; }
      .bg { position: absolute; inset: 0; width: 1280px; height: 800px; filter: blur(7px) brightness(0.42) saturate(0.9);
        transform: scale(1.03); }
      /* A scrim under the caption, so the page behind never competes with it. */
      .scrim { position: absolute; inset: 0;
        background: linear-gradient(200deg, transparent 35%, rgba(7,6,21,0.82) 78%); }
      .popup { position: absolute; top: 36px; right: 72px; width: 360px; border-radius: 18px;
        box-shadow: 0 30px 90px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.10); }
      .caption { position: absolute; left: 72px; bottom: 96px; width: 620px; color: #f4f1ff;
        font: 600 44px/1.12 -apple-system, "Inter", "Segoe UI", sans-serif; letter-spacing: -0.02em; }
      .caption small { display: block; margin-top: 16px; font-weight: 400; font-size: 20px;
        line-height: 1.4; letter-spacing: 0; color: #b9b3dc; }
    </style>
    <img class="bg" src="${uri(background)}" />
    <div class="scrim"></div>
    <img class="popup" src="${uri(popup)}" />
    <div class="caption">${caption}</div>`);
  await page.screenshot({ path: path.join(OUT, file), scale: "css" });
  await page.close();
}

test.describe("store screenshots", () => {
  test.skip(!process.env.AUDIT, "opt-in: AUDIT=1");
  test.skip(!existsSync(path.join(EXTENSION, "manifest.json")), "build the extension first");

  test("popup, block page, connect screen and block lists", async ({ baseURL, request }, info) => {
    test.skip(info.project.name !== "desktop", "taken once, in desktop Chromium");
    test.setTimeout(120_000);
    mkdirSync(OUT, { recursive: true });
    await ensureConfigured(request);
    await wipeData();
    clearLockout();
    await sql(`delete from sp_devices where kind = 'extension'`);
    // Invented block lists on reserved example domains: nothing real appears in the images.
    await sql(`
      with l as (
        insert into sp_block_lists (user_id, name, emoji, sort_order) values
          (${OWNER}, 'Social', '💬', 1), (${OWNER}, 'News', '📰', 2), (${OWNER}, 'Video', '🎬', 3)
        returning id, name)
      insert into sp_block_list_sites (user_id, block_list_id, pattern)
      select ${OWNER}, l.id, s from l, lateral unnest(case l.name
        when 'Social' then array['example.com', 'social.example.com']
        when 'News' then array['example.org', 'news.example.org']
        else array['example.net'] end) s`);
    await sql(
      `update sp_focus_settings set active_block_list_ids = array(select id from sp_block_lists where name in ('Social', 'News')) where user_id = ${OWNER}`,
    );
    await sql(`update sp_settings set quality_tier = 'balanced' where user_id = ${OWNER}`);

    const dir = mkdtempSync(path.join(tmpdir(), "stellar-shots-"));
    const context = await chromium.launchPersistentContext(dir, {
      channel: "chromium",
      headless: true,
      args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
      viewport: SIZE,
      deviceScaleFactor: 2,
      extraHTTPHeaders: { "x-forwarded-for": uniqueIp() },
      baseURL,
    });
    try {
      const worker =
        context.serviceWorkers()[0] ??
        (await context.waitForEvent("serviceworker", { timeout: 20_000 }));
      const id = new URL(worker.url()).host;
      // The instance is reached by a name, so no bare IP address shows in the images.
      const port = new URL(baseURL!).port;
      const address = `localhost:${port}`;

      // The app's Focus page, signed in: the background, and the image of the lists themselves.
      await signIn(context);
      const app = await context.newPage();
      await app.goto("/focus");
      await expect(app.getByTestId("blocking-card")).toBeVisible();
      await app.waitForTimeout(1500);
      const idleApp = await app.screenshot({ scale: "css" });

      const popup: Page = await context.newPage();
      await popup.setViewportSize({ width: 360, height: 560 });
      await popup.goto(`chrome-extension://${id}/popup.html`);
      await expect(popup.getByRole("heading", { name: "Connect your planner" })).toBeVisible();
      await popup.getByLabel("Stellar Planner address").fill(address);
      const connectShot = await popup.screenshot();
      await compose(
        context,
        idleApp,
        connectShot,
        "3-connect.png",
        "Connect in two steps<small>Enter the address of your own Stellar Planner, then your PIN. Nothing goes anywhere else.</small>",
      );

      await popup.getByRole("button", { name: "Continue" }).click();
      await expect(
        popup.getByRole("status").filter({ hasText: "Found Stellar Planner" }),
      ).toBeVisible();
      for (const digit of PIN)
        await popup.getByRole("button", { name: digit, exact: true }).click();
      await popup.getByRole("button", { name: "Connect", exact: true }).click();
      await expect(popup.getByTestId("clock")).toHaveText("25:00", { timeout: 20_000 });
      await popup.getByRole("button", { name: "Start focus" }).click();
      await expect(popup.getByText("Blocking now")).toBeVisible();
      // A few minutes in reads better than 24:59.
      await sql(
        `update sp_focus_state set phase_started_at = phase_started_at - interval '6 minutes 18 seconds', phase_ends_at = phase_ends_at - interval '6 minutes 18 seconds', version = version + 1 where user_id = ${OWNER}`,
      );
      await expect(popup.getByTestId("clock")).toHaveText(/^18:\d\d$/, { timeout: 15_000 });

      await app.reload();
      await expect(app.getByTestId("blocking-card")).toContainText("Blocking now");
      await app.waitForTimeout(1500);
      const runningApp = await app.screenshot({ scale: "css" });
      await compose(
        context,
        runningApp,
        await popup.screenshot(),
        "1-timer.png",
        "Your focus timer, in the toolbar<small>Start, pause, skip or end. Every device follows within a second.</small>",
      );

      // The block page, as it is.
      const blocked = await context.newPage();
      await blocked.goto("https://example.com/feed").catch(() => undefined);
      await expect(blocked.getByRole("heading", { name: "This orbit is closed." })).toBeVisible();
      await blocked.waitForTimeout(800);
      await blocked.screenshot({ path: path.join(OUT, "2-blocked.png"), scale: "css" });

      // Where the lists come from: the app's Focus page, with the list editor open.
      await app.getByRole("button", { name: "Edit lists" }).click();
      await expect(app.getByRole("dialog", { name: "Block lists" })).toBeVisible();
      await app
        .getByTestId("block-list")
        .filter({ hasText: "Social" })
        .getByRole("button")
        .first()
        .click();
      await app.waitForTimeout(600);
      await app.screenshot({ path: path.join(OUT, "4-block-lists.png"), scale: "css" });
    } finally {
      await context.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
