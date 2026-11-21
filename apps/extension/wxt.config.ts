import { defineConfig } from "wxt";

// One codebase, two targets: Chrome/Chromium (MV3 service worker) and Firefox (MV3 event page).
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  imports: false,
  manifest: ({ browser }) => ({
    name: "Stellar Planner",
    short_name: "Stellar",
    description:
      "Your Stellar Planner focus timer in the toolbar, with distracting sites blocked while a focus phase runs.",
    // storage: connection + last known timer state. alarms: resync and timed unblock.
    // declarativeNetRequest: redirect rules. tabs: redirect tabs already open on a blocked site.
    permissions: ["storage", "alarms", "declarativeNetRequest", "tabs"],
    // Redirect rules only apply to sites the extension has host access to, and the
    // background needs to reach your instance and your Supabase. Firefox treats
    // these as optional, so the popup also requests them when you connect.
    host_permissions: ["<all_urls>"],
    web_accessible_resources: [{ resources: ["blocked.html"], matches: ["<all_urls>"] }],
    action: { default_title: "Stellar Planner" },
    icons: { 16: "icon/16.png", 32: "icon/32.png", 48: "icon/48.png", 128: "icon/128.png" },
    ...(browser === "firefox"
      ? {
          browser_specific_settings: {
            gecko: {
              id: "stellar-planner@stellar.local",
              strict_min_version: "128.0",
              // The extension talks only to your own instance; nothing is collected.
              data_collection_permissions: { required: ["none"] },
            },
          },
        }
      : { minimum_chrome_version: "121" }),
  }),
});
