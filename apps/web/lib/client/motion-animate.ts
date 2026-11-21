import type { animate } from "motion/react";

type Animate = typeof animate;

let loaded: Animate | null = null;
const load = () =>
  import("./motion-features").then((m) => {
    loaded = m.animate;
    return m.animate;
  });

/** Fetches the spring engine ahead of the first gesture. */
export function preloadAnimate(): void {
  if (!loaded) void load();
}

/**
 * Runs `run` with motion's `animate`: immediately once the engine is loaded
 * (so a gesture's release and its settle happen in the same frame), otherwise
 * as soon as it arrives.
 */
export function withAnimate(run: (animate: Animate) => void): void {
  if (loaded) run(loaded);
  else void load().then(run);
}
