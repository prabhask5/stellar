// Lighthouse (mobile) for the main routes of a running local instance, signed in with the PIN.
//   node scripts/polish/lighthouse.mjs <label> [appUrl] [pin]
// Writes docs/polish/data/lighthouse-<label>.json. Needs network access for `npx lighthouse`.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";

const label = process.argv[2] ?? "before";
const app = process.argv[3] ?? "http://127.0.0.1:3100";
const pin = process.argv[4] ?? "246810";
const res = await fetch(`${app}/api/v1/auth/pin`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-forwarded-for": "10.77.0.1" },
  body: JSON.stringify({ pin, device: { name: "Lighthouse", kind: "web" } }),
});
if (!res.ok) throw new Error(`sign in failed: ${res.status}`);
const cookie = res.headers
  .getSetCookie()
  .map((c) => c.split(";")[0])
  .join("; ");
const cache = path.join(homedir(), "Library/Caches/ms-playwright");
const chromeDir = readdirSync(cache).find((d) => /^chromium-\d+$/.test(d));
const chrome = path.join(
  cache,
  chromeDir,
  "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
);
const out = {};
const dir = mkdtempSync(path.join(tmpdir(), "lh-"));
for (const route of ["/", "/tasks", "/goals", "/routines", "/focus", "/settings", "/lock"]) {
  const file = path.join(dir, `${route.replace(/\W/g, "") || "home"}.json`);
  const headers = route === "/lock" ? "{}" : JSON.stringify({ Cookie: cookie });
  try {
    execFileSync(
      "npx",
      [
        "--yes",
        "lighthouse",
        `${app}${route}`,
        "--quiet",
        "--output=json",
        `--output-path=${file}`,
        "--form-factor=mobile",
        "--only-categories=performance,accessibility,best-practices",
        `--extra-headers=${headers}`,
        "--chrome-flags=--headless=new",
      ],
      { env: { ...process.env, CHROME_PATH: chrome }, stdio: "ignore" },
    );
  } catch {
    out[route] = { error: "Lighthouse could not measure this route (see AUDIT.md)" };
    console.info(route, "failed");
    continue;
  }
  const r = JSON.parse(readFileSync(file, "utf8"));
  const a = (id) => r.audits[id]?.numericValue;
  out[route] = {
    performance: Math.round(r.categories.performance.score * 100),
    accessibility: Math.round(r.categories.accessibility.score * 100),
    bestPractices: Math.round(r.categories["best-practices"].score * 100),
    lcpMs: Math.round(a("largest-contentful-paint")),
    fcpMs: Math.round(a("first-contentful-paint")),
    tbtMs: Math.round(a("total-blocking-time")),
    cls: Number(a("cumulative-layout-shift").toFixed(3)),
    failedA11y: Object.values(r.audits)
      .filter(
        (x) => r.categories.accessibility.auditRefs.some((ref) => ref.id === x.id) && x.score === 0,
      )
      .map((x) => x.id),
    installableManifest:
      r.audits["installable-manifest"]?.score ?? "n/a (audit removed from Lighthouse)",
  };
  console.info(route, JSON.stringify(out[route]));
}
writeFileSync(`docs/polish/data/lighthouse-${label}.json`, `${JSON.stringify(out, null, 1)}\n`);
