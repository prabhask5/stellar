// Playwright config for `pnpm screenshots` (tests/support/screenshots.ts): the e2e setup
// (standalone server, local stack, data directory) with one file and one browser.
import { defineConfig } from "@playwright/test";
import e2e from "../playwright.config";

export default defineConfig({
  ...e2e,
  testDir: import.meta.dirname,
  testMatch: "screenshots.ts",
  projects: e2e.projects?.filter((p) => p.name === "desktop"),
});
