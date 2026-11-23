// Builds docs/polish/AUDIT.md from the structured findings:
//   docs/polish/data/static-findings.json   code review (import-static.mjs)
//   docs/polish/data/dynamic-findings.json  sweep, adversarial and native-feel runs
//   docs/polish/data/audit-status.json      { "<key>": { status, commit?, note?, severity? } }
//   docs/polish/data/audit-ids.json         stable ids, assigned once
// Usage: node scripts/polish/build-audit.mjs
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const read = (f, fallback) => (existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : fallback);
const D = "docs/polish/data";
const all = [...read(`${D}/dynamic-findings.json`, []), ...read(`${D}/static-findings.json`, [])];
// A dynamic entry with `confirms` adds run evidence to a code-review finding instead of a new entry.
const findings = all.filter((f) => !f.confirms);
for (const c of all.filter((f) => f.confirms)) {
  const target = findings.find((f) => f.key === c.confirms);
  if (target) target.evidence = [target.evidence, c.evidence].filter(Boolean).join(" · ");
}
const status = read(`${D}/audit-status.json`, {});
const ids = read(`${D}/audit-ids.json`, {});
const intro = existsSync(`${D}/audit-intro.md`)
  ? readFileSync(`${D}/audit-intro.md`, "utf8").trim()
  : "";

const byKey = new Map(findings.map((f) => [f.key, f]));
const live = findings.filter((f) => f.severity && !f.duplicateOf);
for (const f of live) if (status[f.key]?.severity) f.severity = status[f.key].severity;
const order = { P0: 0, P1: 1, P2: 2, P3: 3 };
let next = Math.max(0, ...Object.values(ids).map((id) => Number(id.split("-")[1]))) + 1;
for (const f of [...live].sort((a, b) => order[a.severity] - order[b.severity])) {
  if (!ids[f.key]) ids[f.key] = `${f.severity}-${String(next++).padStart(3, "0")}`;
}
writeFileSync(`${D}/audit-ids.json`, `${JSON.stringify(ids, null, 1)}\n`);
// The number is stable; the severity prefix follows the current rating.
const idOf = (f) => `${f.severity}-${ids[f.key].split("-")[1]}`;

const one = (s) =>
  String(s ?? "")
    .replace(/\s*\n\s*/g, " ")
    .trim();
const statusLine = (f) => {
  const s = status[f.key];
  if (!s || s.status === "Open") return "**Status:** Open";
  return `**Status:** ${s.status}${s.commit ? ` (${s.commit})` : ""}${s.note ? `. ${s.note}` : ""}`;
};
const render = (f) => {
  const dups = findings.filter((x) => x.duplicateOf === f.key).map((x) => x.key);
  const lines = [`### ${idOf(f)} · ${f.area} · ${f.surface}`, `**${one(f.title)}**`, ""];
  if (f.kind === "native-feel") {
    lines.push(
      `**What:** POLISH_SPEC ${f.area.replace("Native feel ", "")} requirement is ${f.gapStatus.toLowerCase()}. ${one(f.what)}`,
    );
  } else {
    if (f.what) lines.push(`**What / Repro:** ${one(f.what)}`);
    if (f.expected) lines.push(`**Expected · Actual:** ${one(f.expected)}`);
    if (f.cause) lines.push(`**Cause:** ${one(f.cause)}`);
  }
  const ev = [];
  if (f.evidence) ev.push(one(f.evidence));
  if (f.where) ev.push(`code: ${one(f.where)}`);
  if (f.confidence && f.source !== "dynamic")
    ev.push(`code review, confidence ${one(f.confidence)}`);
  if (dups.length) ev.push(`also reported as ${dups.join(", ")}`);
  lines.push(`**Evidence:** ${ev.join(" · ") || "see What"}`);
  lines.push(statusLine(f), "");
  return lines.join("\n");
};

const counts = { P0: 0, P1: 0, P2: 0, P3: 0 };
const states = {};
for (const f of live) {
  counts[f.severity] += 1;
  const s = status[f.key]?.status ?? "Open";
  states[s] = (states[s] ?? 0) + 1;
}
const out = [
  "# Stellar Planner — polish pass 1 audit",
  "",
  intro,
  "",
  `**${live.length} findings:** ${Object.entries(counts)
    .map(([k, v]) => `${v} ${k}`)
    .join(" · ")}.`,
  `**Status:** ${Object.entries(states)
    .map(([k, v]) => `${v} ${k}`)
    .join(" · ")}.`,
  "",
  "Severity: **P0** crash, data loss/corruption, security problem, core flow blocked · **P1** a feature is broken or wrong · **P2** friction (slow, janky, confusing, un-native) · **P3** cosmetic.",
  "",
];
for (const sev of ["P0", "P1", "P2", "P3"]) {
  const group = live
    .filter((f) => f.severity === sev)
    .sort((a, b) => ids[a.key].split("-")[1] - ids[b.key].split("-")[1]);
  out.push(`## ${sev} (${group.length})`, "");
  for (const f of group) out.push(render(f));
}
const met = findings.filter((f) => f.kind === "native-feel" && !f.severity);
if (met.length) {
  out.push("## Native-feel requirements already met", "");
  for (const f of met)
    out.push(`- ${f.area.replace("Native feel ", "")}: ${one(f.title)}. ${one(f.what)}`);
  out.push("");
}
writeFileSync("docs/polish/AUDIT.md", `${out.join("\n")}\n`);
console.info(
  `AUDIT.md: ${live.length} findings`,
  counts,
  states,
  [...byKey.keys()].length - live.length,
  "merged/met",
);
