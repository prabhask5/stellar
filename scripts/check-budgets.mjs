// Performance budget check, run after `pnpm build`:
//  - the JavaScript a first visit downloads is ≤ 200 KB gzip on the routes a
//    visit starts on: the Universe home (also the PWA start URL), the lock
//    screen and setup;
//  - the other pages, reached by client-side navigation that reuses the shell,
//    stay under a 230 KB ceiling when opened directly;
//  - three.js / R3F is in none of it (the universe is a lazy chunk).
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const BUDGET_KB = 200;
const DEEP_LINK_KB = 230;
const FIRST_ROUTES = new Set(["/", "/lock", "/setup"]);
const web = resolve(dirname(fileURLToPath(import.meta.url)), "../apps/web");
const app = resolve(web, ".next/server/app");
const ROUTES = {
  "/": "index",
  "/tasks": "tasks",
  "/goals": "goals",
  "/routines": "routines",
  "/focus": "focus",
  "/settings": "settings",
  "/lock": "lock",
  "/setup": "setup",
};
// Strings that only exist in the 3D stack.
const THREE_MARKERS = ["WebGLRenderer", "THREE.WebGLRenderer", "EffectComposer"];

if (!existsSync(resolve(app, "index.html"))) {
  console.error("No production build found. Run `pnpm build` first.");
  process.exit(1);
}

const sizes = new Map();
function chunk(src) {
  if (!sizes.has(src)) {
    const file = resolve(
      web,
      ".next",
      decodeURIComponent(src.replace(/^\/_next\//, "").split("?")[0]),
    );
    const code = readFileSync(file);
    sizes.set(src, {
      gzip: gzipSync(code, { level: 9 }).length,
      three: THREE_MARKERS.some((m) => code.includes(m)),
    });
  }
  return sizes.get(src);
}

let failed = false;
const rows = [];
for (const [route, name] of Object.entries(ROUTES)) {
  const html = readFileSync(resolve(app, `${name}.html`), "utf8");
  // Every script the document itself requests is the initial JavaScript. The
  // `nomodule` polyfill bundle is skipped: no browser the app supports downloads it.
  const tags = [...html.matchAll(/<script\b[^>]*>/g)]
    .map((m) => m[0])
    .filter((tag) => !/\bnomodule\b/i.test(tag));
  const scripts = [
    ...new Set(
      tags.map((tag) => /\bsrc="(\/_next\/[^"]+\.js[^"]*)"/.exec(tag)?.[1]).filter(Boolean),
    ),
  ];
  if (scripts.length === 0)
    throw new Error(`No scripts found in ${name}.html; the check needs updating.`);
  let total = 0;
  const withThree = [];
  for (const src of scripts) {
    const c = chunk(src);
    total += c.gzip;
    if (c.three) withThree.push(src);
  }
  const kb = total / 1024;
  const limit = FIRST_ROUTES.has(route) ? BUDGET_KB : DEEP_LINK_KB;
  const ok = kb <= limit && withThree.length === 0;
  if (!ok) failed = true;
  rows.push(
    `${ok ? "ok  " : "FAIL"}  ${route.padEnd(10)} ${kb.toFixed(1).padStart(6)} KB gzip (limit ${limit})  ${String(scripts.length).padStart(2)} scripts${withThree.length ? `  three.js found in ${withThree.join(", ")}` : ""}`,
  );
}

console.info(
  `Initial JavaScript per route (first routes ≤ ${BUDGET_KB} KB gzip, deep links ≤ ${DEEP_LINK_KB} KB, three.js lazy):`,
);
for (const row of rows) console.info(`  ${row}`);
if (failed) {
  console.error("Performance budget exceeded.");
  process.exit(1);
}
