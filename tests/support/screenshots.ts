// `pnpm screenshots`: regenerates the images the READMEs show, and the store listing images.
// Not a test. It is opt-in, runs in desktop Chromium only, and needs what the e2e suite
// needs (`pnpm stack:up`, `pnpm build`).
//
//  1. README images come from demo mode (/demo): the real interface on the built-in sample
//     data, so no real data is involved. They go to .github/assets/screenshots/ and are
//     committed.
//  2. Store images for the Stellar Focus listing drive the real built extension against
//     the local instance. They go to tests/.tmp/store/ (git-ignored); the two the
//     extension README shows are also written to .github/assets/screenshots/.
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { type Browser, type BrowserContext, chromium, devices, type Page } from "@playwright/test";
import {
  applyInsets,
  clearLockout,
  ensureConfigured,
  expect,
  type Insets,
  PIN,
  signIn,
  sql,
  test,
  uniqueIp,
  wipeData,
} from "../e2e/support/helpers";
import { fromRoot } from "./paths";

const OWNER = "(select id from auth.users where email = 'owner@stellar.local')";
const EXTENSION = fromRoot("apps/extension/.output/chrome-mv3");
const README = fromRoot(".github/assets/screenshots");
const STORE = fromRoot("tests/.tmp/store");
const SIZE = { width: 1280, height: 800 };
/** README images stay small enough to load quickly on the repository page. */
const MAX_BYTES = 300 * 1024;

/** Saves a README image as JPEG and fails if it is too heavy to belong in the repository. */
async function saveReadme(page: Page, name: string): Promise<void> {
  const file = path.join(README, `${name}.jpg`);
  await page.screenshot({ path: file, type: "jpeg", quality: 82 });
  expect(statSync(file).size, `${name}.jpg size in bytes`).toBeLessThan(MAX_BYTES);
}

const SCREENS: [name: string, ready: (page: Page) => Promise<void>][] = [
  ["universe", async (page) => expect(page.getByTestId("today-card")).toBeVisible()],
  ["tasks", async (page) => expect(page.getByTestId("today-tab")).toBeVisible()],
  [
    "goals",
    async (page) => expect(page.getByRole("button", { name: /^Open Health/ })).toBeVisible(),
  ],
  ["routines", async (page) => expect(page.getByTestId("day-panel")).toBeVisible()],
  [
    "focus",
    async (page) => {
      await page.getByRole("button", { name: "Start focus" }).click();
      await expect(page.getByTestId("focus")).toHaveAttribute("data-status", "running");
    },
  ],
];

// Headless Chromium draws WebGL in software, for which the app's Auto quality picks the
// still starfield. Asking for the real GPU gives the pictures the 3D universe.
const GPU_ARGS =
  process.platform === "darwin"
    ? ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"]
    : ["--enable-gpu", "--ignore-gpu-blocklist"];

/** The five main screens in demo mode, in one browser context of the given shape. */
async function demoTour(
  browser: Browser,
  baseURL: string,
  suffix: string,
  options: NonNullable<Parameters<Browser["newContext"]>[0]>,
  insets: Insets,
): Promise<void> {
  const context = await browser.newContext({ ...options, baseURL, reducedMotion: "no-preference" });
  try {
    await context.addCookies([{ name: "sp-demo", value: "1", url: baseURL }]);
    const page = await context.newPage();
    await applyInsets(page, insets);
    // The banner is true but not part of the app: these are pictures of the screens.
    await page.addInitScript(() => {
      const style = document.createElement("style");
      style.textContent = '[data-testid="demo-banner"] { display: none !important; }';
      document.addEventListener("DOMContentLoaded", () => document.head.append(style));
    });
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Main" }).filter({ visible: true });
    for (const [name, ready] of SCREENS) {
      // Client-side navigation, so the scene behind the pages is drawn once and stays.
      await nav.getByRole("link", { name: new RegExp(`^${name}$`, "i") }).click();
      await ready(page);
      // The scene loads when the browser is idle and fades in once it has drawn a frame.
      await page
        .locator('.sp-universe[data-ready="true"]')
        .waitFor({ timeout: 20_000 })
        .catch(() => undefined);
      await page.waitForTimeout(2500);
      await saveReadme(page, `${name}-${suffix}`);
    }
  } finally {
    await context.close();
  }
}

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
  await page.screenshot({ path: path.join(STORE, file), scale: "css" });
  await page.close();
}

test.describe("screenshots", () => {
  test.beforeAll(async ({ request }) => {
    mkdirSync(README, { recursive: true });
    mkdirSync(STORE, { recursive: true });
    await ensureConfigured(request);
  });

  test("README: the app in demo mode, desktop and iPhone", async ({ baseURL }) => {
    test.setTimeout(240_000);
    const browser = await chromium.launch({ args: GPU_ARGS });
    try {
      await demoTour(browser, baseURL!, "desktop", { viewport: SIZE }, "none");
      // The installed app on an iPhone 15 Pro: the full screen, with the Dynamic Island inset.
      const { defaultBrowserType: _, ...iphone } = devices["iPhone 15 Pro"];
      await demoTour(
        browser,
        baseURL!,
        "iphone",
        { ...iphone, viewport: { width: 393, height: 852 }, deviceScaleFactor: 2 },
        "island",
      );
    } finally {
      await browser.close();
    }
  });

  test("store listing: the extension popup, block page, connect screen and block lists", async ({
    baseURL,
  }) => {
    test.skip(!existsSync(path.join(EXTENSION, "manifest.json")), "build the extension first");
    test.setTimeout(120_000);
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
      const timerShot = await popup.screenshot();
      await popup.screenshot({
        path: path.join(README, "extension-popup.jpg"),
        type: "jpeg",
        quality: 90,
      });
      await compose(
        context,
        runningApp,
        timerShot,
        "1-timer.png",
        "Your focus timer, in the toolbar<small>Start, pause, skip or end. Every device follows within a second.</small>",
      );

      // The block page, as it is.
      const blocked = await context.newPage();
      await blocked.goto("https://example.com/feed").catch(() => undefined);
      await expect(blocked.getByRole("heading", { name: "This orbit is closed." })).toBeVisible();
      await blocked.waitForTimeout(800);
      await blocked.screenshot({ path: path.join(STORE, "2-blocked.png"), scale: "css" });
      await saveReadme(blocked, "extension-blocked");

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
      await app.screenshot({ path: path.join(STORE, "4-block-lists.png"), scale: "css" });
    } finally {
      await context.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
