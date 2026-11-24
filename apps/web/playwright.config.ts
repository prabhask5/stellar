import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://127.0.0.1:${PORT}`;

/**
 * Projects: the three original Chromium targets, plus WebKit with iPhone descriptors
 * (the closest automated proxy for iOS Safari, and the primary mobile target) and
 * Firefox on desktop. Extra viewports from the SPEC §9.1 device matrix are exercised
 * inside e2e/09-pwa.spec.ts via setViewportSize.
 */
export default defineConfig({
  testDir: "./e2e",
  // The audit specs (POLISH_SPEC §2) measure and probe; they run only when asked for.
  testIgnore: process.env.AUDIT ? [] : ["**/audit/**"],
  outputDir: "./test-results",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL,
    trace: "retain-on-failure",
    // Animations ON, as on the owner's devices. The suite used to run with reduced motion,
    // which skipped every animated path and let a navigation that froze the page through.
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
      use: { ...devices["iPhone 15 Pro"], browserName: "webkit", defaultBrowserType: "webkit" },
    },
    {
      name: "webkit-iphone-se",
      use: {
        ...devices["iPhone SE"],
        viewport: { width: 375, height: 667 },
        browserName: "webkit",
        defaultBrowserType: "webkit",
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
      },
    },
    {
      name: "firefox-desktop",
      use: { ...devices["Desktop Firefox"], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: {
    command: process.env.E2E_DEV
      ? `pnpm exec next dev -p ${PORT}`
      : `node e2e/serve-standalone.mjs ${PORT}`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      STELLAR_DATA_DIR: new URL(`./e2e/${process.env.E2E_DATA_DIR ?? ".tmp/data"}`, import.meta.url)
        .pathname,
      PORT: String(PORT),
      HOSTNAME: "127.0.0.1",
    },
  },
});
