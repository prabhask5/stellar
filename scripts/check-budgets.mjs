// Performance budget check, run after `pnpm build`:
//  - the JavaScript a first visit downloads is ≤ 200 KB gzip on the routes a
//    visit starts on: the Universe home (also the PWA start URL), the lock
//    screen and setup;
//  - the other pages, reached by client-side navigation that reuses the shell,
//    stay under a 230 KB ceiling when opened directly;
//  - none of it contains the universe: the renderer is lazy chunks plus a worker script;
//  - those universe files together are ≤ 45 KB gzip;
//  - three.js is not installed at all.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const BUDGET_KB = 200;
const DEEP_LINK_KB = 230;
const UNIVERSE_KB = 45;
const FIRST_ROUTES = new Set(["/", "/lock", "/setup"]);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const web = resolve(root, "apps/web");
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
// Strings that only exist in the universe's code: the layer and host (the canvas's class
// name), and the engine (a uniform of its composite shader).
const UNIVERSE_PARTS = { layer: "sp-universe__canvas", engine: "uFxBloom" };
const UNIVERSE_MARKERS = Object.values(UNIVERSE_PARTS);
const WORKER = resolve(web, "public/universe-worker.js");

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
      universe: UNIVERSE_MARKERS.some((m) => code.includes(m)),
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
  const withUniverse = [];
  for (const src of scripts) {
    const c = chunk(src);
    total += c.gzip;
    if (c.universe) withUniverse.push(src);
  }
  const kb = total / 1024;
  const limit = FIRST_ROUTES.has(route) ? BUDGET_KB : DEEP_LINK_KB;
  const ok = kb <= limit && withUniverse.length === 0;
  if (!ok) failed = true;
  rows.push(
    `${ok ? "ok  " : "FAIL"}  ${route.padEnd(10)} ${kb.toFixed(1).padStart(6)} KB gzip (limit ${limit})  ${String(scripts.length).padStart(2)} scripts${withUniverse.length ? `  universe code found in ${withUniverse.join(", ")}` : ""}`,
  );
}

console.info(
  `Initial JavaScript per route (first routes ≤ ${BUDGET_KB} KB gzip, deep links ≤ ${DEEP_LINK_KB} KB, no universe code):`,
);
for (const row of rows) console.info(`  ${row}`);

// ── the universe itself ─────────────────────────────────────────────────────
// Every chunk that carries universe code, wherever the bundler put it, plus the worker.
const chunkDir = resolve(web, ".next/static/chunks");
const universe = [];
const found = new Set();
for (const name of readdirSync(chunkDir, { recursive: true })) {
  if (!String(name).endsWith(".js")) continue;
  const code = readFileSync(resolve(chunkDir, String(name)));
  const parts = Object.entries(UNIVERSE_PARTS).filter(([, marker]) => code.includes(marker));
  if (parts.length === 0) continue;
  for (const [part] of parts) found.add(part);
  universe.push({ file: `chunks/${name}`, gzip: gzipSync(code, { level: 9 }).length });
}
if (existsSync(WORKER)) {
  found.add("worker");
  universe.push({
    file: "public/universe-worker.js",
    gzip: gzipSync(readFileSync(WORKER), { level: 9 }).length,
  });
}
const universeKb = universe.reduce((sum, f) => sum + f.gzip, 0) / 1024;
// A part that cannot be found means the markers above are stale, not that it weighs nothing.
const missing = ["layer", "engine", "worker"].filter((part) => !found.has(part));
const universeOk = universeKb <= UNIVERSE_KB && missing.length === 0;
if (!universeOk) failed = true;
console.info(`Universe (layer, engine and worker together ≤ ${UNIVERSE_KB} KB gzip):`);
for (const f of universe)
  console.info(`        ${f.file.padEnd(40)} ${(f.gzip / 1024).toFixed(1).padStart(6)} KB gzip`);
console.info(
  `  ${universeOk ? "ok  " : "FAIL"}  total ${universeKb.toFixed(1)} KB gzip (limit ${UNIVERSE_KB})${missing.length ? `  not found: ${missing.join(", ")}` : ""}`,
);

// three.js and its React bindings are gone for good.
const lock = readFileSync(resolve(root, "pnpm-lock.yaml"), "utf8");
const three = [...lock.matchAll(/^ {2}'?(three|@react-three\/[\w-]+|postprocessing)@/gm)].map(
  (m) => m[1],
);
if (three.length > 0) {
  failed = true;
  console.error(`FAIL  the 3D stack is installed again: ${[...new Set(three)].join(", ")}`);
} else console.info("  ok    three.js is not installed");
if (failed) {
  console.error("Performance budget exceeded.");
  process.exit(1);
}
