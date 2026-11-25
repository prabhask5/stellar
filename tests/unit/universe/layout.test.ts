import { describe, expect, it } from "vitest";
import { placeStar } from "@stellar/universe/layout";

describe("deterministic layout", () => {
  it("places the same id at the same point every time", () => {
    const id = "0b1e7c9e-1111-4222-8333-444455556666";
    expect(placeStar(id)).toEqual(placeStar(id));
    expect(placeStar(id).position).not.toEqual(placeStar("another-id").position);
  });

  it("keeps stars inside a thin disc around the core", () => {
    for (let i = 0; i < 500; i++) {
      const { position, size } = placeStar(`star-${i}`);
      const r = Math.hypot(position[0], position[2]);
      expect(r).toBeGreaterThan(0.1);
      expect(r).toBeLessThanOrEqual(1.0001);
      expect(Math.abs(position[1])).toBeLessThan(0.08);
      expect(size).toBeGreaterThanOrEqual(0.6);
      expect(size).toBeLessThanOrEqual(1.6);
    }
  });
});
