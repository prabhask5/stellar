import { describe, expect, it } from "vitest";
import { pageFor, type RunInput, runState } from "@stellar/universe/modes";

const base: RunInput = {
  visible: true,
  still: false,
  mode: "frozen",
  moving: false,
  playing: false,
};

describe("page modes", () => {
  it("is live and explorable on Home, live on Focus and frozen everywhere else", () => {
    expect(pageFor("/")).toEqual({ mode: "interactive", framing: "home" });
    expect(pageFor("/focus")).toEqual({ mode: "live", framing: "focus" });
    for (const path of ["/tasks", "/goals", "/routines", "/settings", "/anything"])
      expect(pageFor(path), path).toEqual({ mode: "frozen", framing: "page" });
  });
});

describe("run state", () => {
  it("draws continuously on live pages", () => {
    expect(runState({ ...base, mode: "interactive" })).toBe("live");
    expect(runState({ ...base, mode: "live" })).toBe("live");
  });

  it("draws nothing on a frozen page that is idle", () => {
    expect(runState(base)).toBe("frozen");
  });

  it("wakes a frozen page while an event plays, and freezes again after", () => {
    expect(runState({ ...base, playing: true })).toBe("waking");
    expect(runState({ ...base, playing: false })).toBe("frozen");
  });

  it("goes live on a frozen page only while the galaxy or the camera has to move", () => {
    expect(runState({ ...base, playing: true, moving: true })).toBe("live");
    expect(runState({ ...base, moving: true })).toBe("live");
    expect(runState({ ...base, playing: true, moving: false })).toBe("waking");
  });

  it("freezes every page under reduced motion; events still wake it for their glow", () => {
    for (const mode of ["interactive", "live", "frozen"] as const) {
      expect(runState({ ...base, still: true, mode }), mode).toBe("frozen");
      expect(runState({ ...base, still: true, mode, moving: true }), mode).toBe("frozen");
      expect(runState({ ...base, still: true, mode, playing: true }), mode).toBe("waking");
    }
  });

  it("stops entirely while the tab is hidden", () => {
    for (const mode of ["interactive", "live", "frozen"] as const)
      expect(runState({ ...base, visible: false, mode, playing: true, moving: true })).toBe(
        "hidden",
      );
  });
});
