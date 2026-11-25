import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const here = import.meta.dirname;
const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://127.0.0.1:${PORT}`;
/** Where the app under test keeps its config. Relative values are resolved against tests/e2e. */
const DATA_DIR = path.resolve(here, "e2e", process.env.E2E_DATA_DIR ?? ".tmp/data");

/**
 * WebKit on Linux paints in software. At the iPhones' 3× pixel density it manages about one
 * frame a second on these pages (38 at 1×, measured in Playwright's image), which stalls
 * clicks and, in landscape, the whole page. What the specs check is laid out in CSS pixels,
 * so on Linux the WebKit projects render at 1×. On macOS they keep the real density.
 */
const webkitOnLinux = process.platform === "linux" ? { deviceScaleFactor: 1 } : {};

/**
 * Every spec in tests/e2e runs in every project below, against the production standalone
 * build and the local stack (`pnpm stack:up`). WebKit with the iPhone descriptors is the
 * closest automated proxy for iOS Safari and the primary mobile target; the Chromium phone
 * projects add real touch input. More viewports are exercised inside pwa.spec.ts.
 *
 * CI reads the project names from this file, so adding or removing one changes the CI matrix.
 */
export default defineConfig({
  testDir: path.join(here, "e2e"),
  outputDir: path.join(here, "test-results"),
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never", outputFolder: path.join(here, "playwright-report") }]]
    : [["list"]],
  globalSetup: path.join(here, "e2e/support/global-setup.ts"),
  use: {
    baseURL,
    trace: "retain-on-failure",
    // Animations ON, as on real devices. With reduced motion every animated path is skipped,
    // which once let a navigation that froze the page through.
    reducedMotion: "no-preference",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    {
      name: "iphone-15-pro",
      use: { ...devices["iPhone 15 Pro"], browserName: "chromium", defaultBrowserType: "chromium" },
    },
    {
      name: "iphone-se",
      use: {
        ...devices["iPhone SE"],
        viewport: { width: 375, height: 667 },
        browserName: "chromium",
        defaultBrowserType: "chromium",
      },
    },
    {
      name: "webkit-iphone-15-pro",
      use: {
        ...devices["iPhone 15 Pro"],
        browserName: "webkit",
        defaultBrowserType: "webkit",
        ...webkitOnLinux,
      },
    },
    {
      name: "webkit-iphone-se",
      use: {
        ...devices["iPhone SE"],
        viewport: { width: 375, height: 667 },
        browserName: "webkit",
        defaultBrowserType: "webkit",
        ...webkitOnLinux,
      },
    },
    {
      // The installed app in landscape: full 852×393 screen, insets left and right.
      name: "webkit-iphone-15-pro-landscape",
      use: {
        ...devices["iPhone 15 Pro landscape"],
        viewport: { width: 852, height: 393 },
        browserName: "webkit",
        defaultBrowserType: "webkit",
        ...webkitOnLinux,
      },
    },
    {
      name: "firefox-desktop",
      use: {
        ...devices["Desktop Firefox"],
        viewport: { width: 1280, height: 800 },
        // Headless Firefox on Linux has no WebGL at all, so the universe could never be
        // drawn there. With a display it gets software WebGL: run this project under a
        // virtual one (`xvfb-run -a pnpm test:e2e --project=firefox-desktop`), as CI does.
        ...(process.platform === "linux" ? { headless: false } : {}),
      },
    },
  ],
  webServer: {
    // E2E_DEV=1 runs against `next dev` instead of the standalone build.
    command: process.env.E2E_DEV
      ? `pnpm --filter @stellar/web exec next dev -p ${PORT}`
      : `node ${path.join(here, "e2e/support/serve-standalone.mjs")} ${PORT}`,
    cwd: path.resolve(here, ".."),
    url: `${baseURL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      STELLAR_DATA_DIR: DATA_DIR,
      PORT: String(PORT),
      HOSTNAME: "127.0.0.1",
    },
  },
});
