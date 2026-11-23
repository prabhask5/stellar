// Summarises docs/polish/data/scan-*.json into docs/polish/data/scan-summary.md.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const D = "docs/polish/data";
const label = process.argv[2] ?? "baseline";
const out = [`# Screen scan (${label})`, ""];
for (const file of readdirSync(D)
  .filter((f) => /^scan-.*\.json$/.test(f))
  .sort()) {
  const project = file.replace(/^scan-|\.json$/g, "");
  const rows = JSON.parse(readFileSync(`${D}/${file}`, "utf8"));
  const axe = new Map();
  const small = new Map();
  const overflow = [];
  const errors = [];
  let interactive = 0;
  let selectable = 0;
  let callout = 0;
  let blur = 0;
  const hints = new Set();
  const smallInputs = new Set();
  for (const r of rows) {
    if (r.kind.startsWith("axe:")) {
      const k = `${r.kind.slice(4)} · ${r.detail.id}`;
      const e = axe.get(k) ?? { screens: new Set(), help: r.detail.help, node: r.detail.nodes[0] };
      e.screens.add(r.screen);
      axe.set(k, e);
    } else if (r.kind === "touch-target") {
      for (const t of r.detail) small.set(t.replace(/“[^”]*”/g, "“…”"), r.screen);
    } else if (r.kind === "overflow")
      overflow.push(
        `${r.screen}: by ${r.detail.by}px · ${r.detail.elements.slice(0, 2).join(" ; ")}`,
      );
    else if (r.kind === "scan-error")
      errors.push(
        `${r.screen}: ${String(r.detail)
          .replace(/\u001b\[\d+m/g, "")
          .slice(0, 160)}`,
      );
    else if (r.kind === "facts") {
      interactive += r.detail.interactive;
      selectable += r.detail.selectableChrome;
      callout += r.detail.calloutNotNone;
      blur = Math.max(blur, r.detail.blurLayers);
      for (const h of r.detail.missingHints) hints.add(h.replace(/“[^”]*”/g, "“…”"));
      for (const h of r.detail.smallInputs) smallInputs.add(h);
    }
  }
  const order = { critical: 0, serious: 1, moderate: 2, minor: 3 };
  out.push(`## ${project}`, "");
  out.push(
    `- Screens and sheets scanned: ${rows.filter((r) => r.kind === "facts").length}${errors.length ? ` (${errors.length} could not be opened)` : ""}`,
  );
  out.push(
    `- Interactive elements: ${interactive}; text-selectable chrome: ${selectable}; without \`-webkit-touch-callout: none\`: ${callout}; most backdrop-filter layers on one screen: ${blur}`,
  );
  out.push(`- Distinct controls under 44×44: ${small.size}`);
  out.push(`- Inputs under 16px: ${smallInputs.size ? [...smallInputs].join(", ") : "none"}`);
  out.push(`- Horizontal overflow: ${overflow.length ? "" : "none"}`);
  for (const o of overflow) out.push(`  - ${o}`);
  out.push("- axe violations:");
  for (const [k, v] of [...axe].sort(
    (a, b) => order[a[0].split(" ")[0]] - order[b[0].split(" ")[0]],
  ))
    out.push(
      `  - **${k}** (${v.help}) on ${v.screens.size} screens, e.g. \`${String(v.node).slice(0, 90)}\``,
    );
  if (!axe.size) out.push("  - none");
  out.push(
    "",
    "<details><summary>Controls under 44×44</summary>",
    "",
    ...[...small.keys()].sort().map((s) => `- ${s}`),
    "",
    "</details>",
    "",
  );
  out.push(
    "<details><summary>Inputs missing enterkeyhint / autocomplete</summary>",
    "",
    ...[...hints].sort().map((s) => `- ${s}`),
    "",
    "</details>",
    "",
  );
  if (errors.length) out.push("Could not open:", ...errors.map((e) => `- ${e}`), "");
}
writeFileSync(
  `${D}/scan-summary${label === "baseline" ? "" : `-${label}`}.md`,
  `${out.join("\n")}\n`,
);
console.info(
  out.filter((l) => /^## |^- (Screens|Distinct|Horizontal|Interactive)|^  - /.test(l)).join("\n"),
);
