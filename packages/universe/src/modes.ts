/**
 * Where the galaxy is live and where it is frozen, and what the engine does in each case.
 * Pure rules, shared by the app's layer (page → mode) and the engine (mode → frames).
 */
import type { FramingName } from "./renderer/camera.ts";

/** How a page shows the galaxy. */
export type PageMode = "interactive" | "live" | "frozen";

export interface PageStyle {
  mode: PageMode;
  framing: FramingName;
}

/**
 * Page → mode and framing. Home is live and can be explored; Focus is live with a fixed
 * framing; every other page has the galaxy frozen behind its content.
 */
export const PAGES: Record<string, PageStyle> = {
  "/": { mode: "interactive", framing: "home" },
  "/focus": { mode: "live", framing: "focus" },
};
const ELSEWHERE: PageStyle = { mode: "frozen", framing: "page" };

export function pageFor(pathname: string): PageStyle {
  return PAGES[pathname] ?? ELSEWHERE;
}

/**
 * What the engine is doing:
 *   live    the galaxy is redrawn every frame
 *   waking  a frozen page while an event plays: the cached galaxy plus the particles
 *   frozen  nothing is drawn and no frame is requested
 *   hidden  the tab or the installed app is in the background: no frames at all
 */
export type RunState = "live" | "waking" | "frozen" | "hidden";

export interface RunInput {
  visible: boolean;
  /** Reduced motion (or a device that cannot afford motion): nothing moves by itself. */
  still: boolean;
  mode: PageMode;
  /** The camera is travelling, the scene is settling into or out of a focus phase, or an event that moves the galaxy is playing. */
  moving: boolean;
  /** An event is playing or about to. */
  playing: boolean;
}

export function runState(input: RunInput): RunState {
  if (!input.visible) return "hidden";
  // A frozen page goes live only for as long as something has to move, then freezes again.
  if (!input.still && (input.mode !== "frozen" || input.moving)) return "live";
  return input.playing ? "waking" : "frozen";
}
