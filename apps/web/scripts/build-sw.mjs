// Bundles sw/sw.ts and injects the precache manifest (every hashed file under
// .next/static plus the public icons). Runs after `next build`.
import { rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { injectManifest } from "@serwist/build";
import { build } from "esbuild";

const web = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tmp = resolve(web, ".next/sw.bundle.js");

await build({
  entryPoints: [resolve(web, "sw/sw.ts")],
  outfile: tmp,
  bundle: true,
  minify: true,
  format: "iife",
  target: ["es2022"],
  define: { "process.env.NODE_ENV": '"production"' },
  legalComments: "none",
});

const { count, size, warnings } = await injectManifest({
  swSrc: tmp,
  swDest: resolve(web, "public/sw.js"),
  globDirectory: web,
  globPatterns: [
    ".next/static/**/*.{js,css,woff2}",
    "public/icons/*.png",
    "public/universe-worker.js",
    "public/emoji/en/*.json",
  ],
  globIgnores: ["**/*.map"],
  modifyURLPrefix: { ".next/static/": "/_next/static/", "public/": "/" },
  maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
  injectionPoint: "self.__SW_MANIFEST",
});
rmSync(tmp, { force: true });
for (const w of warnings) console.warn(`[sw] ${w}`);
console.info(`[sw] public/sw.js precaches ${count} files (${(size / 1024 / 1024).toFixed(2)} MB)`);
