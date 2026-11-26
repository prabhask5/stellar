import { describe, expect, it } from "vitest";
import {
  armAngle,
  GALAXY_SEED,
  generateGalaxy,
  PATTERN_SPEED,
  pointAt,
  TARGET_STRIDE,
} from "@stellar/universe/renderer/galaxy";
import { TIERS } from "@stellar/universe/renderer/quality";

const low = generateGalaxy(TIERS.low);
const balanced = generateGalaxy(TIERS.balanced);

describe("galaxy generation", () => {
  it("gives identical buffers for the same seed", () => {
    const again = generateGalaxy(TIERS.low, GALAXY_SEED);
    for (const layer of ["stars", "haze", "knots", "dust", "sky"] as const) {
      expect(again[layer].orbit, layer).toEqual(low[layer].orbit);
      expect(again[layer].props, layer).toEqual(low[layer].props);
    }
    expect(again.targets).toEqual(low.targets);
  });

  it("gives a different galaxy for a different seed", () => {
    const other = generateGalaxy(TIERS.low, GALAXY_SEED + 1);
    expect(other.stars.orbit).not.toEqual(low.stars.orbit);
  });

  it("makes each layer as large as the tier asks", () => {
    for (const [name, tier] of Object.entries(TIERS)) {
      const g = name === "low" ? low : name === "balanced" ? balanced : null;
      if (!g) continue;
      expect(g.stars.count).toBe(tier.stars);
      expect(g.haze.count).toBe(tier.haze);
      expect(g.knots.count).toBe(tier.knots);
      expect(g.dust.count).toBe(tier.dust);
      expect(g.stars.orbit).toHaveLength(tier.stars * 4);
    }
  });

  it("keeps the same stars on every tier, so a lower tier is the same galaxy thinned out", () => {
    const n = TIERS.low.stars * 4;
    expect(balanced.stars.orbit.subarray(0, n)).toEqual(low.stars.orbit);
    expect(balanced.stars.props.subarray(0, n)).toEqual(low.stars.props);
    // Events land on the same stars whatever the tier.
    expect(balanced.targets).toEqual(low.targets);
    expect(balanced.targetCount).toBe(low.targetCount);
  });

  it("has a bulge with a bar, two major and two minor arms, and field stars between them", () => {
    const { census } = balanced;
    const n = balanced.stars.count;
    expect(census.bulge + census.bar + census.arm + census.field).toBe(n);
    expect((census.bulge + census.bar) / n).toBeGreaterThan(0.11);
    expect((census.bulge + census.bar) / n).toBeLessThan(0.15);
    expect(census.bar / (census.bulge + census.bar)).toBeGreaterThan(0.4);
    expect(census.bar / (census.bulge + census.bar)).toBeLessThan(0.5);
    expect(census.arm / n).toBeGreaterThan(0.58);
    expect(census.arm / n).toBeLessThan(0.64);
    // Four in five arm stars are on the two major arms.
    expect(census.majorArm / census.arm).toBeGreaterThan(0.77);
    expect(census.majorArm / census.arm).toBeLessThan(0.83);
    expect(census.field / n).toBeGreaterThan(0.23);
  });

  it("follows an exponential disk that ends at the edge", () => {
    const { orbit } = balanced.stars;
    let inner = 0;
    let middle = 0;
    let outer = 0;
    let max = 0;
    for (let i = 0; i < balanced.stars.count; i++) {
      const a = orbit[i * 4]!;
      const ratio = orbit[i * 4 + 1]!;
      max = Math.max(max, a);
      // Disk stars only: the bulge and bar sit on ellipses.
      if (ratio < 1) continue;
      if (a < 0.4) inner++;
      else if (a < 0.8) middle++;
      else outer++;
    }
    expect(max).toBeLessThanOrEqual(1.151);
    expect(inner).toBeGreaterThan(middle);
    expect(middle).toBeGreaterThan(outer);
    expect(outer).toBeGreaterThan(0);
  });

  it("puts young blue stars on the ridges of the major arms", () => {
    const { orbit, props } = balanced.stars;
    let young = 0;
    let offRidge = 0;
    for (let i = 0; i < balanced.stars.count; i++) {
      if (props[i * 4 + 2]! >= 0.25) continue;
      young++;
      const a = orbit[i * 4]!;
      const off = orbit[i * 4 + 3]! - armAngle(a);
      // Distance to the nearer major arm (0 or π), wrapped.
      const d = Math.abs((((off % Math.PI) + Math.PI + Math.PI / 2) % Math.PI) - Math.PI / 2);
      if (d > 0.121 || a <= 0.18) offRidge++;
    }
    expect(young).toBeGreaterThan(1000);
    expect(offRidge).toBe(0);
  });

  it("turns arms, knots and dust rigidly so the spiral never winds up", () => {
    for (const layer of [balanced.knots, balanced.dust]) {
      for (let i = 0; i < layer.count; i++)
        expect(layer.props[i * 4]).toBeCloseTo(PATTERN_SPEED, 6);
    }
    const { orbit, props } = balanced.stars;
    let faster = 0;
    for (let i = 0; i < balanced.stars.count; i++) {
      const omega = props[i * 4]!;
      expect(omega).toBeGreaterThanOrEqual(PATTERN_SPEED - 1e-6);
      // Only populations with no azimuthal structure turn faster than the pattern.
      if (omega > PATTERN_SPEED + 1e-6) faster++;
      if (orbit[i * 4 + 1]! < 0.5) expect(omega).toBeCloseTo(PATTERN_SPEED, 6);
    }
    expect(faster).toBeGreaterThan(0);
    // An arm star keeps its radius and its place relative to its arm for ever.
    const a = [0, 0, 0];
    const b = [0, 0, 0];
    let index = 0;
    while (orbit[index * 4 + 1]! < 1 || props[index * 4]! > PATTERN_SPEED + 1e-6) index++;
    pointAt(balanced.stars, index, 0, a);
    pointAt(balanced.stars, index, 1000, b);
    expect(Math.hypot(b[0]!, b[2]!)).toBeCloseTo(Math.hypot(a[0]!, a[2]!), 4);
    const turned = Math.atan2(b[2]!, b[0]!) - Math.atan2(a[2]!, a[0]!);
    const expected = (PATTERN_SPEED * 1000) % (Math.PI * 2);
    expect(Math.cos(turned - expected)).toBeCloseTo(1, 3);
  });

  it("offers real stars on the major arms as event targets", () => {
    expect(low.targetCount).toBeGreaterThan(500);
    expect(low.targetCount).toBeLessThanOrEqual(2048);
    for (let t = 0; t < low.targetCount; t++) {
      const a = low.targets[t * TARGET_STRIDE]!;
      expect(a).toBeGreaterThan(0.22);
      expect(a).toBeLessThan(0.95);
    }
  });
});
