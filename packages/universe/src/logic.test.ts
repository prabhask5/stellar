import { describe, expect, it } from "vitest";
import { emitCosmic, onCosmic, resetCosmicBus } from "./bus.ts";
import { DURATIONS, EventDirector, GLOW_MS } from "./director.ts";
import {
  constellationBrightness,
  CONSTELLATION_MAX_STARS,
  litStars,
  placeClusters,
  placeConstellation,
  placeNeighbours,
  placePlanet,
  placeSystem,
  placeWeb,
  planetRadius,
  SKY_RADIUS,
  starSeeds,
} from "./layout.ts";
import {
  type DeviceSignals,
  FrameGovernor,
  gpuTierFromRenderer,
  selectTier,
  stepDown,
  TIERS,
} from "./quality.ts";

const strong: DeviceSignals = {
  reducedMotion: false,
  saveData: false,
  deviceMemory: 8,
  hardwareConcurrency: 8,
  gpuTier: 3,
  webgl: true,
};

describe("quality tiers", () => {
  it("respects an explicit setting", () => {
    expect(selectTier("cinematic", { ...strong, gpuTier: 1 })).toBe("cinematic");
    expect(selectTier("balanced", strong)).toBe("balanced");
    expect(selectTier("minimal", strong)).toBe("minimal");
    // Software rendering still honours an explicit choice; no WebGL at all cannot.
    expect(selectTier("cinematic", { ...strong, gpuTier: 0 })).toBe("cinematic");
    expect(selectTier("cinematic", { ...strong, gpuTier: 0, webgl: false })).toBe("minimal");
  });

  it("auto reads the device", () => {
    expect(selectTier("auto", strong)).toBe("cinematic");
    expect(selectTier("auto", { ...strong, gpuTier: 1 })).toBe("balanced");
    expect(selectTier("auto", { ...strong, deviceMemory: 2 })).toBe("balanced");
    expect(selectTier("auto", { ...strong, hardwareConcurrency: 2 })).toBe("balanced");
    expect(selectTier("auto", { ...strong, gpuTier: 1, deviceMemory: 1 })).toBe("minimal");
    expect(selectTier("auto", { ...strong, gpuTier: 0 })).toBe("minimal");
    expect(
      selectTier("auto", { ...strong, deviceMemory: undefined, hardwareConcurrency: undefined }),
    ).toBe("cinematic");
  });

  it("auto honours reduced motion, data saver and a low battery", () => {
    expect(selectTier("auto", { ...strong, reducedMotion: true })).toBe("minimal");
    expect(selectTier("auto", { ...strong, saveData: true })).toBe("minimal");
    expect(selectTier("auto", { ...strong, battery: { level: 0.2, charging: false } })).toBe(
      "balanced",
    );
    expect(selectTier("auto", { ...strong, battery: { level: 0.15, charging: true } })).toBe(
      "cinematic",
    );
    expect(
      selectTier("auto", { ...strong, gpuTier: 1, battery: { level: 0.1, charging: false } }),
    ).toBe("minimal");
    expect(selectTier("auto", { ...strong, battery: { level: 0.21, charging: false } })).toBe(
      "cinematic",
    );
  });

  it("classifies GPUs from the renderer string", () => {
    expect(gpuTierFromRenderer(null)).toBe(0);
    expect(
      gpuTierFromRenderer(
        "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0)), SwiftShader driver)",
      ),
    ).toBe(0);
    expect(gpuTierFromRenderer("Apple GPU")).toBe(3);
    expect(
      gpuTierFromRenderer("ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)"),
    ).toBe(3);
    expect(
      gpuTierFromRenderer("ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0)"),
    ).toBe(3);
    expect(gpuTierFromRenderer("ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11)")).toBe(2);
    expect(gpuTierFromRenderer("Adreno (TM) 506", 4096)).toBe(1);
    expect(gpuTierFromRenderer("Mali-T720", 4096)).toBe(1);
  });

  it("describes each tier per the spec", () => {
    expect(TIERS.cinematic).toMatchObject({ bloom: true, maxDpr: 2, idleFps: 60 });
    expect(TIERS.balanced).toMatchObject({ bloom: false, maxDpr: 1.25, idleFps: 30 });
    expect(TIERS.minimal.webgl).toBe(false);
    expect(TIERS.balanced.maxStars).toBeLessThan(TIERS.cinematic.maxStars);
    expect(stepDown("cinematic")).toBe("balanced");
    expect(stepDown("balanced")).toBe("minimal");
  });
});

describe("frame governor", () => {
  it("steps down only after three seconds over budget", () => {
    const g = new FrameGovernor(1000 / 45);
    let now = 0;
    let stepped = false;
    for (let i = 0; i < 80 && !stepped; i++) {
      now += 40;
      stepped = g.frame(40, now);
    }
    expect(stepped).toBe(true);
    expect(now).toBeGreaterThanOrEqual(3000);
    expect(now).toBeLessThan(3300);
  });

  it("stays put when frames are within budget or briefly slow", () => {
    const g = new FrameGovernor(1000 / 45);
    let now = 0;
    for (let i = 0; i < 600; i++) {
      now += 16;
      expect(g.frame(16, now)).toBe(false);
    }
    // One second of jank is forgiven.
    for (let i = 0; i < 25; i++) {
      now += 40;
      expect(g.frame(40, now)).toBe(false);
    }
    for (let i = 0; i < 300; i++) {
      now += 16;
      expect(g.frame(16, now)).toBe(false);
    }
  });

  it("ignores gaps from a hidden tab and waits after a step-down", () => {
    const g = new FrameGovernor(20);
    expect(g.frame(5000, 5000)).toBe(false);
    let now = 5000;
    let first = -1;
    for (let i = 0; i < 400; i++) {
      now += 40;
      if (g.frame(40, now)) {
        first = now;
        break;
      }
    }
    expect(first).toBeGreaterThan(0);
    // Immediately afterwards it is quiet for the cool-down, even though frames are still slow.
    for (let i = 0; i < 100; i++) {
      now += 40;
      expect(g.frame(40, now)).toBe(false);
    }
  });
});

describe("event director", () => {
  it("coalesces five completions within three seconds into one bigger burst", () => {
    const d = new EventDirector();
    const first = d.push({ type: "task_completed", origin: { x: 10, y: 20 } }, 0);
    expect(first.action).toBe("start");
    for (const t of [400, 900, 1700, 2900]) {
      expect(d.push({ type: "task_completed", origin: { x: 10, y: 20 + t } }, t).action).toBe(
        "merge",
      );
    }
    expect(d.effects()).toHaveLength(1);
    const burst = d.effects()[0]!;
    expect(burst.magnitude).toBe(5);
    expect(burst.origins).toHaveLength(5);
    // The burst lasts until the last spark has landed.
    expect(burst.duration).toBe(2900 + DURATIONS.task_completed);
    // A completion after the window starts a fresh burst.
    expect(d.push({ type: "task_completed" }, 3200).action).toBe("start");
    expect(d.effects()).toHaveLength(2);
  });

  it("lets different kinds overlap and never blocks", () => {
    const d = new EventDirector();
    expect(d.push({ type: "task_completed" }, 0).action).toBe("start");
    expect(d.push({ type: "routine_instance", routineId: "r" }, 10).action).toBe("start");
    expect(d.push({ type: "goal_progress", goalId: "g" }, 20).action).toBe("start");
    expect(d.effects()).toHaveLength(3);
    d.tick(3100);
    expect(d.effects().map((e) => e.type)).toEqual([]);
    expect(d.idle).toBe(true);
  });

  it("plays big cinematic events one after another", () => {
    const d = new EventDirector();
    expect(d.push({ type: "focus_complete" }, 0).action).toBe("start");
    expect(d.push({ type: "goal_list_completed", listId: "l" }, 100).action).toBe("queued");
    expect(d.push({ type: "goal_list_completed", listId: "l" }, 150).action).toBe("queued");
    expect(d.tick(1000)).toEqual([]);
    const started = d.tick(DURATIONS.focus_complete + 1);
    expect(started).toHaveLength(1);
    expect(started[0]).toMatchObject({
      type: "goal_list_completed",
      detail: { listId: "l" },
      duration: 3500,
    });
    expect(d.tick(DURATIONS.focus_complete + 2)).toEqual([]);
  });

  it("uses the spec durations and carries event details", () => {
    expect(DURATIONS).toMatchObject({
      task_completed: 1200,
      overdue_postponed: 1500,
      goal_progress: 1000,
      goal_completed: 2500,
      goal_list_completed: 3500,
      routine_instance: 800,
      routine_day_complete: 2000,
      streak_rekindled: 1500,
      focus_start: 1500,
      focus_complete: 3000,
    });
    const d = new EventDirector();
    const r = d.push({ type: "overdue_postponed", count: 7 }, 0);
    expect(r.action === "start" && r.effect.magnitude).toBe(7);
  });

  it("turns every event into a brief glow when motion is reduced", () => {
    const d = new EventDirector();
    d.reduced = true;
    const r = d.push({ type: "focus_complete" }, 0);
    expect(r.action === "start" && r.effect.duration).toBe(GLOW_MS);
    const next = d.push({ type: "goal_list_completed", listId: "l" }, GLOW_MS + 1);
    expect(next.action === "start" && next.effect.duration).toBe(GLOW_MS);
  });
});

describe("event bus", () => {
  it("replays recent events to a late listener and then delivers live", () => {
    resetCosmicBus();
    emitCosmic({ type: "focus_complete" });
    const seen: string[] = [];
    const off = onCosmic((e) => seen.push(e.type));
    expect(seen).toEqual(["focus_complete"]);
    emitCosmic({ type: "focus_start" });
    expect(seen).toEqual(["focus_complete", "focus_start"]);
    off();
    emitCosmic({ type: "focus_complete" });
    expect(seen).toHaveLength(2);
    resetCosmicBus();
  });
});

describe("deterministic placement", () => {
  it("places systems, planets and constellations from ids alone", () => {
    expect(placeSystem("list-a", 0, 4)).toEqual(placeSystem("list-a", 0, 4));
    expect(placeSystem("list-a", 0, 4).family).toBe("gold");
    expect(placeSystem("list-b", 1, 4).family).toBe("violet");
    expect(placeSystem("list-c", 2, 4).family).toBe("rose");
    expect(placeSystem("list-d", 3, 4).family).toBe("blue");
    expect(placePlanet("goal-1", 0)).toEqual(placePlanet("goal-1", 0));
    expect(placePlanet("goal-1", 2).orbit).toBeGreaterThan(placePlanet("goal-1", 0).orbit);
    const c = placeConstellation("routine-1", 0, 3);
    expect(c).toEqual(placeConstellation("routine-1", 0, 3));
    expect(c.stars).toHaveLength(CONSTELLATION_MAX_STARS);
    expect(c.lines).toHaveLength(CONSTELLATION_MAX_STARS - 1);
    for (const s of c.stars) {
      expect(Math.hypot(...s)).toBeCloseTo(SKY_RADIUS, 5);
      expect(s[1]).toBeGreaterThan(0); // above the galactic plane
    }
  });

  it("grows planets with progress and dims broken streaks without removing them", () => {
    expect(planetRadius(0, false)).toBeGreaterThan(0);
    expect(planetRadius(1, false)).toBeGreaterThan(planetRadius(0.5, false));
    expect(planetRadius(1, true)).toBeGreaterThan(planetRadius(1, false));
    expect(constellationBrightness(0, true)).toBe(0.35);
    expect(constellationBrightness(1, false)).toBeGreaterThan(0.35);
    expect(constellationBrightness(30, false)).toBe(1);
    expect(litStars(0)).toBe(2);
    expect(litStars(400)).toBe(CONSTELLATION_MAX_STARS);
    expect(litStars(9)).toBeGreaterThan(litStars(1));
  });

  it("draws exactly as many stars as the snapshot reports, within the tier cap", () => {
    const recent = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const months = [
      { month: "2026-10", count: 4 },
      { month: "2026-11", count: 5 },
    ];
    const seeds = starSeeds(recent, months, 9, 100);
    expect(seeds).toHaveLength(9);
    expect(seeds.slice(0, 3)).toEqual(["a", "b", "c"]);
    expect(new Set(seeds).size).toBe(9);
    expect(starSeeds(recent, months, 9, 5)).toHaveLength(5);
    expect(starSeeds([], [], 0, 100)).toEqual([]);
    expect(starSeeds(recent, months, 9, 100)).toEqual(seeds);
  });

  it("places the background layers deterministically", () => {
    expect(placeClusters()).toHaveLength(6);
    expect(placeNeighbours()).toHaveLength(9);
    const web = placeWeb();
    expect(web.nodes.length).toBeGreaterThan(20);
    expect(web.edges.length).toBeGreaterThan(20);
    expect(placeWeb()).toEqual(web);
  });
});
