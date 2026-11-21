// Embeds the SQL migrations into a TypeScript module so the app can run them
// without reading files at runtime (Next standalone output, Docker image).
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderBundle } from "../src/bundle-render.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dir = resolve(root, "migrations");
const files = readdirSync(dir)
  .filter((f) => /^\d{4}_.+\.sql$/.test(f))
  .sort();
const out = renderBundle(
  files.map((f) => ({ file: f, sql: readFileSync(resolve(dir, f), "utf8") })),
);
writeFileSync(resolve(root, "src/bundle.generated.ts"), out);
console.info(`bundled ${files.length} migrations`);
