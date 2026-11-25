import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { tokens } from "@stellar/ui-tokens";
import { fromRoot } from "../../support/paths.ts";
import { generateCss, generateTheme, kebab, parseColor } from "@stellar/ui-tokens/generate";

const read = (p: string) => readFileSync(fromRoot("packages/ui-tokens", p), "utf8");

describe("token generators", () => {
  it("keeps generated files in sync with tokens.json", () => {
    expect(read("css/tokens.css")).toBe(generateCss(tokens));
    expect(read("css/theme.css")).toBe(generateTheme(tokens));
  });

  it("is deterministic", () => {
    expect(generateCss(tokens)).toBe(generateCss(tokens));
  });

  it("names variables in kebab case", () => {
    expect(kebab("glass.fillStrong")).toBe("glass-fill-strong");
    expect(generateCss(tokens)).toContain("--sp-accent: #F6C76E;");
    expect(generateCss(tokens)).toContain("--sp-bg-void: #070615;");
  });

  it("parses hex and rgba colours", () => {
    expect(parseColor("#F6C76E")).toEqual({ r: 246, g: 199, b: 110, a: 1 });
    expect(parseColor("rgba(24,20,56,0.55)")).toEqual({ r: 24, g: 20, b: 56, a: 0.55 });
    expect(() => parseColor("gold")).toThrow();
  });

  it("carries the spec palette", () => {
    expect(tokens.color["text.primary"]).toBe("#F5F3FF");
  });
});
