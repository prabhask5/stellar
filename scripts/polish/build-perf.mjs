// Builds docs/polish/PERF.md from docs/polish/data (perf-*, lighthouse-*, memory-*) and the bundle check.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const D = "docs/polish/data";
const read = (f) =>
  existsSync(`${D}/${f}`) ? JSON.parse(readFileSync(`${D}/${f}`, "utf8")) : null;
const cell = (v) => (v === null || v === undefined ? "—" : String(v));
const out = [
  "# Performance and smoothness — polish pass 1",
  "",
  "Measured on the production standalone build against the local stack with the seed data (`scripts/seed-polish.mts`). **Before** = `4edf013` (no product change). **After** is filled in as phases land.",
  "",
  "How to reproduce: `AUDIT=1 PERF_LABEL=before|after pnpm --filter @stellar/web exec playwright test e2e/audit/perf.spec.ts --project=iphone-15-pro --project=desktop`, `node scripts/polish/lighthouse.mjs before|after`, `pnpm budgets`, then `node scripts/polish/build-perf.mjs`.",
  "",
  "Caveats: these are Chromium numbers with the main thread throttled 4× as a phone proxy; headless Chromium renders WebGL in software (SwiftShader), so the Balanced tier figures overstate GPU cost and Cinematic was not measured. Real-device smoothness is on `IPHONE_CHECKLIST.md`.",
  "",
];

// ── bundle ───────────────────────────────────────────────────────────────────
let budgets;
try {
  budgets = execFileSync("node", ["scripts/check-budgets.mjs"], { encoding: "utf8" });
} catch (err) {
  budgets = String(err.stdout ?? err);
}
const now = {};
for (const m of budgets.matchAll(/(\/\S*)\s+([\d.]+) KB gzip \(limit (\d+)\)/g))
  now[m[1]] = { kb: Number(m[2]), limit: Number(m[3]) };
if (!existsSync(`${D}/bundle-before.json`))
  writeFileSync(`${D}/bundle-before.json`, `${JSON.stringify(now, null, 1)}\n`);
const b0 = existsSync(`${D}/bundle-before.json`)
  ? JSON.parse(readFileSync(`${D}/bundle-before.json`, "utf8"))
  : now;
out.push(
  "## Route JavaScript (gzip, initial scripts; three.js must stay in the lazy chunk)",
  "",
  "| Route | Before | After | Limit |",
  "|---|---|---|---|",
);
for (const r of Object.keys(now))
  out.push(
    `| \`${r}\` | ${cell(b0[r]?.kb)} KB | ${JSON.stringify(b0) === JSON.stringify(now) ? "—" : `${now[r].kb} KB`} | ${now[r].limit} KB |`,
  );
out.push(
  "",
  `three.js in initial scripts: ${/three\.js/.test(budgets) && /FAIL|found/i.test(budgets) ? "**yes (budget failure)**" : "no"}.`,
  "",
);

// ── Lighthouse ───────────────────────────────────────────────────────────────
const l0 = read("lighthouse-before.json");
const l1 = read("lighthouse-after.json");
if (l0) {
  out.push(
    "## Lighthouse (mobile emulation, 4× CPU, slow 4G, signed in)",
    "",
    "| Route | Perf | A11y | LCP | TBT | CLS |",
    "|---|---|---|---|---|---|",
  );
  const pair = (a, b, f = (x) => x) =>
    `${a === undefined ? "—" : f(a)} → ${b === undefined ? "—" : f(b)}`;
  for (const r of Object.keys(l0)) {
    const a = l0[r];
    const b = l1?.[r] ?? {};
    if (a.error) {
      out.push(
        `| \`${r}\` | not measurable before (nothing painted for Lighthouse) → ${b.performance ?? "—"} | ${cell(b.accessibility)} | ${cell(b.lcpMs)} | ${cell(b.tbtMs)} | ${cell(b.cls)} |`,
      );
      continue;
    }
    out.push(
      `| \`${r}\` | ${pair(a.performance, b.performance)} | ${pair(a.accessibility, b.accessibility)} | ${pair(a.lcpMs, b.lcpMs, (x) => `${(x / 1000).toFixed(1)} s`)} | ${pair(a.tbtMs, b.tbtMs, (x) => `${x} ms`)} | ${pair(a.cls, b.cls)} |`,
    );
  }
  out.push(
    "",
    "Installability is no longer a Lighthouse audit; the manifest, icons, service worker and offline start are asserted in `e2e/09-pwa.spec.ts`.",
    "",
  );
}

// ── interaction timings ──────────────────────────────────────────────────────
const SCENARIOS = [
  ["idleHome", "Home idle, 3 s"],
  ["tabSwitches", "Six tab switches"],
  ["completeTen", "Complete 10 tasks rapidly (events playing)"],
  ["scrollAll", "Scroll All"],
  ["openSheet", "Open and close task sheet"],
  ["typeQuickAdd", "Type in quick add"],
  ["thousandScroll", "Scroll All with 1,000 extra tasks"],
];
for (const project of ["iphone-15-pro", "desktop"]) {
  for (const tier of ["minimal", "balanced"]) {
    const a = read(`perf-before-${tier}-${project}.json`);
    const b = read(`perf-after-${tier}-${project}.json`);
    if (!a) continue;
    out.push(
      `## Interaction timings · ${project} · ${tier} tier (CPU ${a.cpuThrottle}×)`,
      "",
      "Each cell is before → after.",
      "",
      "| Scenario | Long tasks (>50 ms) | Longest task | Slowest interaction (INP-style) | Frame p95 | Worst frame | Frames >33 ms |",
      "|---|---|---|---|---|---|---|",
    );
    for (const [k, name] of SCENARIOS) {
      const x = a[k];
      const y = b?.[k];
      if (!x) continue;
      const p = (f, unit = "") => `${x[f]}${unit} → ${y ? `${y[f]}${unit}` : "—"}`;
      out.push(
        `| ${name} | ${p("longTasks")} | ${p("longest", " ms")} | ${p("inp", " ms")} | ${p("p95", " ms")} | ${p("worst", " ms")} | ${x.over33}/${x.frames} → ${y ? `${y.over33}/${y.frames}` : "—"} |`,
      );
    }
    out.push(
      "",
      `1,000 extra tasks: time to show All ${cell(a.thousandTasksMs)}${typeof a.thousandTasksMs === "number" ? " ms" : ""} → ${b ? `${cell(b.thousandTasksMs)}${typeof b.thousandTasksMs === "number" ? " ms" : ""}` : "—"}; DOM nodes ${a.thousandDomNodes} → ${b ? b.thousandDomNodes : "—"}.`,
      "",
    );
  }
}

// ── memory ───────────────────────────────────────────────────────────────────
for (const label of ["before", "after"]) {
  const m = read(`memory-${label}-desktop.json`);
  if (!m) continue;
  const at = (min) =>
    m.reduce(
      (best, s) => (Math.abs(s.minute - min) < Math.abs(best.minute - min) ? s : best),
      m[0],
    );
  out.push(
    `## Memory, 30-minute scripted session (${label})`,
    "",
    "All tabs visited in a loop; each round adds and completes a task, opens a sheet, steps a goal and every other round starts and ends a focus phase. Heap after forced GC.",
    "",
    "| Minute | Rounds | JS heap | DOM nodes | Event listeners |",
    "|---|---|---|---|---|",
  );
  for (const min of [0, 1, 5, 10, 15, 20, 25, 30]) {
    const s = at(min);
    out.push(`| ${s.minute} | ${cell(s.round)} | ${s.heapMB} MB | ${s.nodes} | ${s.listeners} |`);
  }
  const last = m[m.length - 1];
  const mid = at(20);
  out.push(
    "",
    `Trend over the last 10 minutes: ${(last.heapMB - mid.heapMB).toFixed(1)} MB (${last.round - (mid.round ?? 0)} rounds, each of which adds a task to the cache). Detached-node proxy: DOM node count ${m[1].nodes} → ${last.nodes}; listeners ${m[1].listeners} → ${last.listeners}.`,
    "",
  );
}
const notes = existsSync(`${D}/perf-notes.md`)
  ? readFileSync(`${D}/perf-notes.md`, "utf8").trim()
  : "";
if (notes) out.push(notes, "");
writeFileSync("docs/polish/PERF.md", `${out.join("\n")}\n`);
console.info("PERF.md written");
