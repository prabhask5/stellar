import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildOpenApi, OPERATIONS } from "@stellar/shared/openapi";
import { fromRoot } from "../../support/paths.ts";

const API = fromRoot("apps/web/app/api/v1");
const METHODS = ["get", "post", "put", "patch", "delete"] as const;

function routeFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) routeFiles(full, out);
    else if (name === "route.ts") out.push(full);
  }
  return out;
}

describe("OpenAPI document", () => {
  it("is a valid OpenAPI 3.1 document", () => {
    const doc = buildOpenApi("9.9.9") as {
      openapi: string;
      info: { title: string; version: string };
      paths: Record<string, Record<string, { operationId?: string; responses?: object }>>;
    };
    // What the app serves is this object as JSON, so it must survive serialisation unchanged.
    expect(JSON.parse(JSON.stringify(doc))).toEqual(doc);
    expect(doc.openapi).toMatch(/^3\.1\.\d+$/);
    expect(doc.info.title).toBeTruthy();
    expect(doc.info.version).toBe("9.9.9");
    expect(Object.keys(doc.paths).length).toBeGreaterThan(0);
    for (const [path, item] of Object.entries(doc.paths)) {
      expect(path, path).toMatch(/^\//);
      for (const [method, op] of Object.entries(item)) {
        const where = `${method} ${path}`;
        expect(METHODS as readonly string[], where).toContain(method);
        expect(op.operationId, where).toBeTruthy();
        expect(Object.keys(op.responses ?? {}).length, where).toBeGreaterThan(0);
        // Every path parameter in the address is declared.
        const declared = ((op as { parameters?: { name: string; in: string }[] }).parameters ?? [])
          .filter((p) => p.in === "path")
          .map((p) => p.name);
        for (const [, name] of path.matchAll(/\{(\w+)\}/g)) expect(declared, where).toContain(name);
      }
    }
  });

  it("describes every documented operation with a real route handler", () => {
    for (const op of OPERATIONS) {
      const file = resolve(API, `.${op.path.replace(/\{(\w+)\}/g, "[$1]")}`, "route.ts");
      expect(existsSync(file), `${op.method} ${op.path}`).toBe(true);
      expect(readFileSync(file, "utf8"), `${op.method} ${op.path}`).toMatch(
        new RegExp(`export const ${op.method.toUpperCase()}\\b`),
      );
    }
  });

  it("covers every route under apps/web/app/api/v1", () => {
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
    // Single methods the web app uses itself on an otherwise documented path.
    const internalMethods = new Set(["get /push/subscriptions"]);
    // Routes are discovered from the filesystem, so a new one is checked without editing this test.
    const files = routeFiles(API);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const path = file.slice(API.length, -"/route.ts".length).replace(/\[(\w+)\]/g, "{$1}");
      if (internal.has(path)) continue;
      expect(documented.has(path), path).toBe(true);
      // Every method the handler exports is described, not just the path.
      const source = readFileSync(file, "utf8");
      for (const method of METHODS)
        if (
          !internalMethods.has(`${method} ${path}`) &&
          new RegExp(`export (const|function|async function) ${method.toUpperCase()}\\b`).test(
            source,
          )
        )
          expect(
            OPERATIONS.some((o) => o.path === path && o.method === method),
            `${method} ${path}`,
          ).toBe(true);
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
