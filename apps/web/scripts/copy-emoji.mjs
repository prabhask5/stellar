// Copies the emoji dataset into public/ so the picker never calls a third-party CDN
// and keeps working offline. Run after upgrading emojibase-data: `node scripts/copy-emoji.mjs`.
import { copyFileSync, mkdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const web = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(web, "public/emoji/en");
mkdirSync(out, { recursive: true });
for (const file of ["data.json", "messages.json"]) {
  const from = require.resolve(`emojibase-data/en/${file}`);
  copyFileSync(from, resolve(out, file));
  console.info(`${file}: ${(statSync(from).size / 1024).toFixed(0)} KB`);
}
