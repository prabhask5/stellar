import { defineConfig } from "wxt";

// One codebase, two targets: Chrome/Chromium (MV3 service worker) and Firefox (MV3 event page).
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  imports: false,
  zip: {
    name: "stellar-focus",
    // Mozilla's reviewers rebuild the add-on from the sources archive, so it has to hold
    // everything the build reads: this app, the workspace packages it imports, and the
    // lockfile. See SOURCE_CODE_REVIEW.md, which is the first file they are pointed to.
    sourcesRoot: "../..",
    includeSources: [
      "SOURCE_CODE_REVIEW.md",
      "package.json",
      "pnpm-lock.yaml",
      "pnpm-workspace.yaml",
      "tsconfig.base.json",
      "apps/extension/**",
      "packages/shared/**",
      "packages/db/**",
      "packages/ui-tokens/**",
      // Only so the lockfile matches the workspace; not part of the extension.
      "apps/web/package.json",
      "packages/universe/package.json",
    ],
    excludeSources: ["**/*.test.ts", "**/test/**", "apps/extension/scripts/firefox-smoke.mjs"],
  },
  manifest: ({ browser }) => ({
    name: "Stellar Focus",
    short_name: "Stellar",
    // 132 characters at most (Chrome Web Store).
    description:
      "A focus timer in your toolbar that blocks distracting sites while you focus. The companion to a self-hosted Stellar Planner.",
    // storage: connection + last known timer state. alarms: resync and timed unblock.
    // declarativeNetRequest: redirect rules. tabs: redirect tabs already open on a blocked site.
    permissions: ["storage", "alarms", "declarativeNetRequest", "tabs"],
    // Redirect rules only apply to sites the extension has host access to, and the
    // background needs to reach your instance and your Supabase. Firefox treats
    // these as optional, so the popup also requests them when you connect.
    host_permissions: ["<all_urls>"],
    web_accessible_resources: [{ resources: ["blocked.html"], matches: ["<all_urls>"] }],
    action: { default_title: "Stellar Focus" },
    icons: { 16: "icon/16.png", 32: "icon/32.png", 48: "icon/48.png", 128: "icon/128.png" },
    ...(browser === "firefox"
      ? {
          browser_specific_settings: {
            gecko: {
              // Permanent once the add-on is on addons.mozilla.org.
              id: "stellar-focus@stellar.local",
              // 140 is the first Firefox with built-in data consent, which new add-ons must use.
              strict_min_version: "140.0",
              // The PIN you type, and the session it earns, go to the Stellar Planner
              // instance you name: that is "authentication information" in Mozilla's terms.
              // Nothing else leaves the browser, and nothing goes to the developer.
              data_collection_permissions: { required: ["authenticationInfo"] },
            },
          },
        }
      : { minimum_chrome_version: "121" }),
  }),
});
