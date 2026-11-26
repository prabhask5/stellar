import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import {
  COSMIC_EVENT_TYPES,
  cosmicLog,
  emitCosmic,
  onCosmic,
  resetCosmicBus,
} from "@stellar/universe/bus";
import { fromRoot } from "../../support/paths.ts";

describe("event bus", () => {
  beforeEach(() => resetCosmicBus());

  it("replays recent events to a late listener and then delivers live", () => {
    const seen: string[] = [];
    emitCosmic({ type: "focus_completed" });
    const off = onCosmic((e) => seen.push(e.type));
    expect(seen).toEqual(["focus_completed"]);
    emitCosmic({ type: "focus_started" });
    expect(seen).toEqual(["focus_completed", "focus_started"]);
    off();
    emitCosmic({ type: "focus_break" });
    expect(seen).toHaveLength(2);
  });

  it("keeps only a short backlog", () => {
    for (let i = 0; i < 60; i++) emitCosmic({ type: "task_created", id: String(i) });
    const seen: string[] = [];
    onCosmic((e) => "id" in e && seen.push(e.id));
    expect(seen).toHaveLength(24);
    expect(seen.at(-1)).toBe("59");
  });

  it("logs every emitted type in order, for the end-to-end tests", () => {
    emitCosmic({ type: "task_completed", id: "a" });
    emitCosmic({ type: "task_uncompleted", id: "a" });
    expect(cosmicLog()).toEqual(["task_completed", "task_uncompleted"]);
  });

  it("knows the twelve events of the catalog", () => {
    expect(COSMIC_EVENT_TYPES).toHaveLength(12);
    expect(new Set(COSMIC_EVENT_TYPES).size).toBe(12);
  });

  it("imports nothing at run time, so emitting never pulls in the renderer", () => {
    for (const file of ["bus.ts", "state.ts"]) {
      const source = readFileSync(fromRoot("packages/universe/src", file), "utf8");
      const runtimeImports = [...source.matchAll(/^import\s+(?!type\b).*$/gm)].map((m) => m[0]);
      expect(runtimeImports, file).toEqual([]);
    }
  });
});
