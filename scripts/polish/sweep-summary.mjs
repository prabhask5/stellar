// Aggregates an AUDIT_LOG (JSON lines from the e2e sweep listeners) into a readable summary.
//   node scripts/polish/sweep-summary.mjs <log.jsonl> <out.txt>
import { readFileSync, writeFileSync } from "node:fs";

const [, , input, output] = process.argv;
const rows = readFileSync(input, "utf8")
  .trim()
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l));
const groups = new Map();
const scrub = (s) =>
  String(s ?? "")
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, "<id>")
    .replace(/apikey=[\w.-]+/g, "apikey=…")
    .replace(/https?:\/\/[^/\s]+/g, "")
    .replace(/_next\/static\/\S+/g, "_next/static/…")
    .replace(/\?_rsc=\w+/g, "?_rsc=…")
    .replace(/\d{4,}/g, "N");
for (const r of rows) {
  const key = [
    r.kind,
    scrub(r.text).slice(0, 170),
    scrub(r.request).replace(/\?.*/, ""),
    r.status ?? "",
  ].join(" | ");
  const g = groups.get(key) ?? { n: 0, projects: new Set(), tests: new Set(), max: 0 };
  g.n += 1;
  g.projects.add(r.project);
  g.tests.add(r.test.split(" › ").pop());
  if (r.value) g.max = Math.max(g.max, r.value);
  groups.set(key, g);
}
const lines = [`${rows.length} entries, ${groups.size} distinct`, ""];
for (const [k, g] of [...groups].sort((a, b) => b[1].n - a[1].n))
  lines.push(
    `${String(g.n).padStart(4)} × ${k}${g.max ? ` max ${g.max}` : ""}\n         projects: ${[...g.projects].join(", ")} · e.g. ${[...g.tests].slice(0, 2).join(" ; ")}`,
  );
writeFileSync(output, `${lines.join("\n")}\n`);
console.info(lines[0]);
