import { describe, expect, it } from "vitest";
import { pageFor, type RunInput, runState } from "@stellar/universe/modes";

const base: RunInput = { visible: true, still: false, playing: false };

describe("page modes", () => {
  it("is live on every page: explorable on Home, its own framing on Focus", () => {
    expect(pageFor("/")).toEqual({ mode: "interactive", framing: "home" });
    expect(pageFor("/focus")).toEqual({ mode: "live", framing: "focus" });
    for (const path of ["/tasks", "/goals", "/routines", "/settings", "/anything"])
      expect(pageFor(path), path).toEqual({ mode: "live", framing: "page" });
  });
});

describe("run state", () => {
  it("draws continuously, with or without an event", () => {
    expect(runState(base)).toBe("live");
    expect(runState({ ...base, playing: true })).toBe("live");
  });

  it("is still under reduced motion: nothing is drawn while idle", () => {
    expect(runState({ ...base, still: true })).toBe("still");
  });

  it("wakes a still sky for an event's glow, and rests again after", () => {
    expect(runState({ ...base, still: true, playing: true })).toBe("waking");
    expect(runState({ ...base, still: true, playing: false })).toBe("still");
  });

  it("stops entirely while the tab is hidden", () => {
    expect(runState({ ...base, visible: false })).toBe("hidden");
    expect(runState({ visible: false, still: true, playing: true })).toBe("hidden");
  });
});
