// Diagnostic companion to check-budgets.mjs: lists a route's initial chunks with
// a guess at what is inside. Usage: node scripts/chunk-report.mjs index tasks
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const web = resolve(dirname(fileURLToPath(import.meta.url)), "../apps/web");
const MARKS = {
  "react-dom": "react-dom",
  supabase: "PostgrestError",
  realtime: "phx_join",
  zod: "ZodError",
  motion: "layoutId",
  "motion-core": "LazyMotion",
  dnd: "DndContext",
  tanstack: "QueryClient",
  "radix-dialog": "DialogContent",
  "radix-popover": "PopoverContent",
  emoji: "frimousse",
  idb: "indexedDB",
  universe: "__stellarUniverse",
  zustand: "getInitialState",
  three: "WebGLRenderer",
  "date-picker": "TimeWheel",
  recurrence: "interval_days",
  tasks: "due_time",
  goals: "total_amount",
  focus: "rounds_before_long",
  settings: "Sign out everywhere",
  command: "Search or jump",
};
for (const route of process.argv.slice(2)) {
  const html = readFileSync(resolve(web, `.next/server/app/${route}.html`), "utf8");
  const tags = [...html.matchAll(/<script\b[^>]*>/g)]
    .map((m) => m[0])
    .filter((t) => !/\bnomodule\b/i.test(t));
  const srcs = [
    ...new Set(tags.map((t) => /\bsrc="(\/_next\/[^"]+\.js[^"]*)"/.exec(t)?.[1]).filter(Boolean)),
  ];
  console.info(`== /${route === "index" ? "" : route}`);
  for (const src of srcs) {
    const code = readFileSync(resolve(web, ".next", src.replace("/_next/", "").split("?")[0]));
    const text = code.toString();
    const found = Object.entries(MARKS)
      .filter(([, m]) => text.includes(m))
      .map(([k]) => k);
    console.info(
      `${(gzipSync(code).length / 1024).toFixed(1).padStart(7)} KB  ${src.split("/").pop().padEnd(24)} ${found.join(", ")}`,
    );
  }
}
