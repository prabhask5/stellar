import { describe, expect, it } from "vitest";
import {
  bufferSize,
  chooseQuality,
  type DeviceSignals,
  FrameProbe,
  gpuTierFromRenderer,
  QualityPlan,
  stepDown,
  TIERS,
} from "@stellar/universe/renderer/quality";

const strong: DeviceSignals = {
  reducedMotion: false,
  saveData: false,
  deviceMemory: 8,
  hardwareConcurrency: 8,
  gpuTier: 3,
};

describe("quality tiers", () => {
  it("sets star count, pixel budget and bloom, and nothing else", () => {
    expect(TIERS.high).toMatchObject({ stars: 190_000, maxPixels: 2.4e6, bloom: true });
    expect(TIERS.balanced).toMatchObject({ stars: 110_000, maxPixels: 1.4e6, bloom: true });
    expect(TIERS.low).toMatchObject({ stars: 60_000, maxPixels: 0.9e6, bloom: false });
    // Fewer stars each carry more light, so the galaxy is as bright on every tier.
    const light = (t: keyof typeof TIERS) => TIERS[t].stars * TIERS[t].starLight;
    expect(light("low") / light("high")).toBeGreaterThan(0.55);
    expect(light("low") / light("high")).toBeLessThan(1.1);
  });

  it("respects an explicit setting, under its stored name", () => {
    expect(chooseQuality("cinematic", { ...strong, gpuTier: 1 }).tier).toBe("high");
    expect(chooseQuality("balanced", strong).tier).toBe("balanced");
    expect(chooseQuality("minimal", strong).tier).toBe("low");
    // Software rendering still honours an explicit choice, and it may move.
    expect(chooseQuality("cinematic", { ...strong, gpuTier: 0 })).toEqual({
      tier: "high",
      still: false,
    });
  });

  it("auto reads the device", () => {
    expect(chooseQuality("auto", strong).tier).toBe("high");
    expect(chooseQuality("auto", { ...strong, gpuTier: 2 }).tier).toBe("balanced");
    expect(chooseQuality("auto", { ...strong, deviceMemory: 2 }).tier).toBe("balanced");
    expect(chooseQuality("auto", { ...strong, hardwareConcurrency: 2 }).tier).toBe("balanced");
    expect(chooseQuality("auto", { ...strong, gpuTier: 1 }).tier).toBe("low");
    expect(
      chooseQuality("auto", { ...strong, deviceMemory: undefined, hardwareConcurrency: undefined })
        .tier,
    ).toBe("high");
  });

  it("auto steps down on a low battery and keeps a remembered step-down", () => {
    expect(
      chooseQuality("auto", { ...strong, battery: { level: 0.15, charging: false } }).tier,
    ).toBe("balanced");
    expect(
      chooseQuality("auto", { ...strong, battery: { level: 0.15, charging: true } }).tier,
    ).toBe("high");
    expect(chooseQuality("auto", { ...strong, cap: "balanced" }).tier).toBe("balanced");
    expect(chooseQuality("auto", { ...strong, gpuTier: 1, cap: "balanced" }).tier).toBe("low");
    // The cap is what Auto learned; an explicit choice is not capped.
    expect(chooseQuality("cinematic", { ...strong, cap: "low" }).tier).toBe("high");
  });

  it("keeps the sky still for reduced motion, data saver and software rendering", () => {
    expect(chooseQuality("auto", { ...strong, reducedMotion: true })).toEqual({
      tier: "high",
      still: true,
    });
    expect(chooseQuality("cinematic", { ...strong, reducedMotion: true }).still).toBe(true);
    expect(chooseQuality("auto", { ...strong, saveData: true })).toEqual({
      tier: "low",
      still: true,
    });
    expect(chooseQuality("auto", { ...strong, gpuTier: 0 })).toEqual({ tier: "low", still: true });
    // A GPU can hide that it is software. What Auto measured there is remembered.
    expect(chooseQuality("auto", { ...strong, capStill: true })).toEqual({
      tier: "low",
      still: true,
    });
    expect(chooseQuality("cinematic", { ...strong, capStill: true })).toEqual({
      tier: "high",
      still: false,
    });
  });

  it("classifies GPUs from the renderer string", () => {
    expect(gpuTierFromRenderer("Google SwiftShader")).toBe(0);
    expect(gpuTierFromRenderer("llvmpipe (LLVM 15.0.7, 256 bits)")).toBe(0);
    expect(gpuTierFromRenderer("ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified)")).toBe(
      3,
    );
    expect(gpuTierFromRenderer("Apple GPU")).toBe(3);
    expect(gpuTierFromRenderer("ANGLE (Intel, Intel(R) UHD Graphics 620)")).toBe(2);
    expect(gpuTierFromRenderer("Mali-G52")).toBe(2);
    expect(gpuTierFromRenderer("PowerVR Rogue GE8320", 4096)).toBe(1);
    // A masked renderer says nothing: go by what the context can do.
    expect(gpuTierFromRenderer(null, 16384)).toBe(2);
    expect(gpuTierFromRenderer("", 4096)).toBe(1);
  });

  it("steps down one tier at a time and stops at the lowest", () => {
    expect(stepDown("high")).toBe("balanced");
    expect(stepDown("balanced")).toBe("low");
    expect(stepDown("low")).toBe("low");
  });
});

describe("drawing buffer", () => {
  it("uses device pixels up to 2×, within the tier's pixel budget", () => {
    expect(bufferSize(1000, 800, 1, 2.4e6)).toMatchObject({ width: 1000, height: 800, scale: 1 });
    expect(bufferSize(400, 800, 3, 2.4e6)).toMatchObject({ width: 800, height: 1600, scale: 2 });
    const capped = bufferSize(1440, 900, 2, 1.4e6);
    expect(capped.width * capped.height).toBeLessThanOrEqual(1.4e6 * 1.01);
    expect(capped.width / capped.height).toBeCloseTo(1.6, 2);
    expect(bufferSize(0, 0, 2, 1e6)).toMatchObject({ width: 2, height: 2 });
  });
});

describe("frame probe", () => {
  const feed = (probe: FrameProbe, ms: number, frames: number) => {
    let decided = 0;
    for (let i = 0; i < frames; i++) if (probe.frame(ms)) decided++;
    return decided;
  };

  it("judges the tier on 120 frames after a warm-up", () => {
    const probe = new FrameProbe(TIERS.high.frameBudgetMs);
    expect(feed(probe, 16.7, FrameProbe.WARMUP + FrameProbe.FRAMES - 1)).toBe(0);
    expect(probe.verdict).toBe("pending");
    expect(feed(probe, 16.7, 1)).toBe(1);
    expect(probe.verdict).toBe("ok");
    // Decided once; later frames change nothing.
    expect(feed(probe, 90, 500)).toBe(0);
    expect(probe.verdict).toBe("ok");
  });

  it("asks for a lower tier when the frames are too slow", () => {
    const probe = new FrameProbe(TIERS.high.frameBudgetMs);
    feed(probe, 40, FrameProbe.WARMUP + FrameProbe.FRAMES);
    expect(probe.verdict).toBe("down");
  });

  it("ignores the warm-up frames and impossible gaps", () => {
    const probe = new FrameProbe(TIERS.high.frameBudgetMs);
    feed(probe, 200, FrameProbe.WARMUP);
    feed(probe, 60_000, 30);
    feed(probe, 16.7, FrameProbe.FRAMES);
    expect(probe.verdict).toBe("ok");
  });

  it("stops the motion on a device that only manages a few frames a second", () => {
    // Under 12 frames a second on average: a slideshow, whatever the tier.
    const slow = new FrameProbe(TIERS.balanced.frameBudgetMs);
    feed(slow, 90, FrameProbe.WARMUP + FrameProbe.FRAMES);
    expect(slow.verdict).toBe("stop");
    // Far slower than that is decided early, not after two minutes of it.
    const crawling = new FrameProbe(TIERS.high.frameBudgetMs);
    expect(feed(crawling, 300, FrameProbe.WARMUP + FrameProbe.EARLY - 1)).toBe(0);
    expect(feed(crawling, 300, 1)).toBe(1);
    expect(crawling.verdict).toBe("stop");
    // Merely heavy is a step down, not a stop.
    const heavy = new FrameProbe(TIERS.high.frameBudgetMs);
    feed(heavy, 60, FrameProbe.WARMUP + FrameProbe.FRAMES);
    expect(heavy.verdict).toBe("down");
  });

  it("judges the lowest tier too: it cannot step down, but it can stop", () => {
    const fine = new FrameProbe(TIERS.low.frameBudgetMs);
    feed(fine, 40, FrameProbe.WARMUP + FrameProbe.FRAMES);
    expect(fine.verdict).toBe("ok");
    const slow = new FrameProbe(TIERS.low.frameBudgetMs);
    feed(slow, 200, FrameProbe.WARMUP + FrameProbe.FRAMES);
    expect(slow.verdict).toBe("stop");
  });

  it("does not judge an explicit setting", () => {
    const probe = new FrameProbe(TIERS.high.frameBudgetMs, false);
    expect(probe.verdict).toBe("ok");
    expect(feed(probe, 500, 400)).toBe(0);
  });
});

describe("quality plan", () => {
  it("never changes the tier mid-view: a request waits for a boundary", () => {
    const plan = new QualityPlan("high");
    plan.request("balanced");
    expect(plan.current).toBe("high");
    expect(plan.waiting).toBe("balanced");
    expect(plan.takeAtBoundary()).toBe("balanced");
    expect(plan.current).toBe("balanced");
    expect(plan.takeAtBoundary()).toBeNull();
  });

  it("drops a request for the tier it already has", () => {
    const plan = new QualityPlan("high");
    plan.request("balanced");
    plan.request("high");
    expect(plan.waiting).toBeNull();
    expect(plan.takeAtBoundary()).toBeNull();
    expect(plan.current).toBe("high");
  });
});
