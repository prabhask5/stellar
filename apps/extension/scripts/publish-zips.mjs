// Copies the packaged extension zips into the web app's public folder, so the
// app (and its Docker image) can serve them from Settings → Extension.
import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(root, ".output");
const dest = resolve(root, "../web/public/extension");
mkdirSync(dest, { recursive: true });

const zips = readdirSync(out).filter((f) => f.endsWith(".zip") && !f.includes("sources"));
const pick = (browser) => zips.find((f) => f.includes(`-${browser}`));
for (const [browser, name] of [
  ["chrome", "stellar-planner-chrome.zip"],
  ["firefox", "stellar-planner-firefox.zip"],
]) {
  const file = pick(browser);
  if (!file) throw new Error(`No ${browser} zip found in ${out}. Run \`wxt zip\` first.`);
  copyFileSync(resolve(out, file), resolve(dest, name));
  console.info(`${file} → apps/web/public/extension/${name}`);
}
