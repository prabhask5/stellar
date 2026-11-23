// One-off for polish pass 1: turns the four static-review notes into docs/polish/data/audit.json.
// Usage: node scripts/polish/import-static.mjs <dir with audit-*.md>
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const dir = process.argv[2];
const SOURCES = [
  ["audit-client.md", "Web + PWA", "C"],
  ["audit-ui.md", "Web + PWA", "U"],
  ["audit-server.md", "Server / API", "S"],
  ["audit-ext-universe.md", null, "X"],
];
// Same defect reported by two reviewers: keep the first, note the second.
const DUPLICATES = {
  "U:A02": "C:20",
  "C:33": "U:A01",
  "U:A23": "C:8",
  "U:A37": "C:23",
  "C:31": "U:A36",
  "U:A28": null,
};

const entries = [];
for (const [file, surface, prefix] of SOURCES) {
  const text = readFileSync(path.join(dir, file), "utf8");
  let section = "";
  let n = 0;
  let inGap = false;
  for (const block of text.split(/\n(?=##+ )/)) {
    const head = block.split("\n", 1)[0];
    if (head.startsWith("## ")) {
      section = head
        .replace(/^## /, "")
        .replace(/^AREA \d+ — /, "")
        .replace(/^Part A — /, "");
      inGap = /gap table/i.test(head);
      continue;
    }
    if (!head.startsWith("### ")) continue;
    if (inGap) {
      const group = head.replace(/^### /, "");
      for (const row of block
        .split("\n")
        .filter((l) => l.startsWith("| ") && !/^\| (Bullet|---)/.test(l))) {
        const [, bullet, status, evidence] = row.split("|").map((c) => c.trim());
        entries.push({
          key: `G:${group.slice(0, 3)}:${entries.length}`,
          kind: "native-feel",
          severity: status === "Met" ? null : "P2",
          area: `Native feel §${group}`,
          surface: /extension|Block page/i.test(bullet) ? "Extension" : "iPhone PWA",
          title: bullet,
          gapStatus: status,
          what: evidence,
          confidence: "high",
        });
      }
      continue;
    }
    n += 1;
    const title = head.replace(/^### /, "");
    const local = /^([A-Z]\d+)[. ]/.exec(title)?.[1] ?? /^(\d+)\./.exec(title)?.[1] ?? String(n);
    const field = (name) => {
      const m = new RegExp(`^- ${name}:\\s*([\\s\\S]*?)(?=\\n- [A-Z][A-Za-z /]+:|$)`, "m").exec(
        block,
      );
      return m ? m[1].trim() : "";
    };
    const area = field("Area");
    entries.push({
      key: `${prefix}:${local}`,
      kind: "bug",
      severity: /P[0-3]/.exec(field("Severity"))?.[0] ?? "P2",
      severityNote: field("Severity").replace(/^P[0-3]\s*/, ""),
      area:
        prefix === "X"
          ? area === "universe"
            ? "Universe"
            : "Extension"
          : prefix === "S"
            ? "Server"
            : section,
      surface: surface ?? (area === "universe" ? "Web + PWA" : "Extension (Chrome + Firefox)"),
      title: title.replace(/^[A-Z]?\d+\.?\s+/, ""),
      confidence: field("Confidence"),
      where: field("Where"),
      what: field("What(?: / Repro)?"),
      expected: field("Expected vs actual"),
      cause: field("Cause"),
      fix: field("Fix idea"),
    });
  }
}
for (const [dup, of] of Object.entries(DUPLICATES)) {
  const e = entries.find((x) => x.key === dup);
  if (e && of) e.duplicateOf = of;
}
writeFileSync(
  path.resolve("docs/polish/data/static-findings.json"),
  `${JSON.stringify(entries, null, 1)}\n`,
);
const by = {};
for (const e of entries) by[e.severity ?? "met"] = (by[e.severity ?? "met"] ?? 0) + 1;
console.info(entries.length, by);
