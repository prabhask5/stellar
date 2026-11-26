// Bundles the universe's worker (packages/universe/src/worker.ts) into one plain script,
// public/universe-worker.js. Runs before `next build` and `next dev`.
//
// It is built here rather than by Next because Turbopack hands a worker its chunk list in
// the URL fragment, and WebKit gives a worker its URL without the fragment: every Safari
// would fall back to drawing on the main thread.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const web = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outfile = resolve(web, "public/universe-worker.js");

const result = await build({
  entryPoints: [resolve(web, "../../packages/universe/src/worker.ts")],
  outfile,
  bundle: true,
  minify: true,
  format: "iife",
  target: ["es2022"],
  legalComments: "none",
  metafile: true,
});
const bytes = Object.values(result.metafile.outputs)[0]?.bytes ?? 0;
console.info(`[universe] public/universe-worker.js ${(bytes / 1024).toFixed(1)} KB`);
