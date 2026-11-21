// Writes docs/openapi.json from the zod schemas. Run with `pnpm openapi`.
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildOpenApi } from "../packages/shared/src/openapi.ts";

const file = resolve(import.meta.dirname, "../docs/openapi.json");
writeFileSync(file, `${JSON.stringify(buildOpenApi(), null, 2)}\n`);
console.info(`Wrote ${file}`);
