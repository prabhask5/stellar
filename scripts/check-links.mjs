// Checks that every relative link and image in the tracked Markdown files points at a file
// that exists. Runs in CI (`static` job): `node scripts/check-links.mjs`.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const files = execFileSync("git", ["ls-files", "-co", "--exclude-standard", "*.md"], {
  cwd: root,
  encoding: "utf8",
})
  .split("\n")
  .filter((f) => f && existsSync(resolve(root, f)));

const broken = [];
let checked = 0;
for (const file of files) {
  // Fenced code is not prose: a path inside it is an example, not a link.
  const text = readFileSync(resolve(root, file), "utf8").replace(/```[\s\S]*?```/g, "");
  const targets = [
    ...[...text.matchAll(/!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)].map((m) => m[1]),
    ...[...text.matchAll(/<(?:img|a)\b[^>]*?\b(?:src|href)="([^"]+)"/g)].map((m) => m[1]),
  ];
  for (const target of targets) {
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    checked += 1;
    const path = decodeURIComponent(target.split("#")[0]);
    if (!existsSync(resolve(root, dirname(file), path))) broken.push(`${file}: ${target}`);
  }
}

if (broken.length) {
  console.error(`Broken relative links:\n${broken.map((b) => `  ${b}`).join("\n")}`);
  process.exit(1);
}
console.info(`${checked} relative links in ${files.length} Markdown files resolve.`);
