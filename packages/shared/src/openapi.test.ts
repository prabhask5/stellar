import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildOpenApi, OPERATIONS } from "./openapi.ts";

const root = resolve(import.meta.dirname, "../../..");

function routeFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) routeFiles(full, out);
    else if (name === "route.ts") out.push(full);
  }
  return out;
}

describe("OpenAPI document", () => {
  it("matches docs/openapi.json (run `pnpm openapi` after changing schemas)", () => {
    const onDisk = JSON.parse(readFileSync(resolve(root, "docs/openapi.json"), "utf8"));
    expect(onDisk).toEqual(JSON.parse(JSON.stringify(buildOpenApi())));
  });

  it("describes every documented operation with a real route handler", () => {
    for (const op of OPERATIONS) {
      const file = resolve(
        root,
        "apps/web/app/api/v1",
        `.${op.path.replace(/\{(\w+)\}/g, "[$1]")}`,
        "route.ts",
      );
      expect(existsSync(file), `${op.method} ${op.path}`).toBe(true);
      expect(readFileSync(file, "utf8"), `${op.method} ${op.path}`).toMatch(
        new RegExp(`export const ${op.method.toUpperCase()}\\b`),
      );
    }
  });

  it("documents every endpoint the spec lists, and no route is left undocumented", () => {
    const documented = new Set(OPERATIONS.map((o) => o.path));
    // Web-app-only helpers that are not part of the public contract.
    const internal = new Set([
      "/auth/session",
      "/auth/unlock",
      "/auth/pin/change",
      "/auth/logout-everywhere",
      "/push/test",
      "/openapi.json",
    ]);
    const base = resolve(root, "apps/web/app/api/v1");
    for (const file of routeFiles(base)) {
      const path = file.slice(base.length, -"/route.ts".length).replace(/\[(\w+)\]/g, "{$1}");
      if (!internal.has(path)) expect(documented.has(path), path).toBe(true);
    }
  });

  it("resolves every $ref and gives each operation a unique id", () => {
    const doc = buildOpenApi() as {
      components: { schemas: Record<string, unknown> };
      paths: Record<string, Record<string, { operationId: string }>>;
    };
    const refs = [...JSON.stringify(doc.paths).matchAll(/#\/components\/schemas\/(\w+)/g)].map(
      (m) => m[1] as string,
    );
    for (const name of refs) expect(doc.components.schemas[name], name).toBeDefined();
    const ids = Object.values(doc.paths).flatMap((p) => Object.values(p).map((o) => o.operationId));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
