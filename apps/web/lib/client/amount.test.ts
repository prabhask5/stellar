import { describe, expect, it } from "vitest";
import { parseAmount } from "./amount";

describe("parseAmount", () => {
  it("reads thousands separators as thousands, not as a decimal mark (P2: 1,000 was 1)", () => {
    expect(parseAmount("1,000")).toBe(1000);
    expect(parseAmount("12,345,678")).toBe(12345678);
    expect(parseAmount("1 000")).toBe(1000);
    expect(parseAmount("1.000,5")).toBe(1000.5);
    expect(parseAmount("1,000.5")).toBe(1000.5);
  });
  it("still reads decimal commas and points", () => {
    expect(parseAmount("2,5")).toBe(2.5);
    expect(parseAmount("2.5")).toBe(2.5);
    expect(parseAmount(" 30 ")).toBe(30);
    expect(parseAmount("0")).toBe(0);
  });
  it("rejects what is not a plain number", () => {
    for (const bad of ["", "abc", "1e9", "Infinity", "NaN", "1.2.3", "--1", "5 books"])
      expect(parseAmount(bad)).toBeNaN();
  });
});
