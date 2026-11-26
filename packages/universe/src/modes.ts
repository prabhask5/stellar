/**
 * How each page shows the galaxy, and what the engine does. Pure rules, shared by the app's
 * layer (page → mode) and the engine (state → frames).
 */
import type { FramingName } from "./renderer/camera.ts";

/** Live everywhere. `interactive` adds the owner's own orbit and zoom. */
export type PageMode = "interactive" | "live";

export interface PageStyle {
  mode: PageMode;
  framing: FramingName;
}

/**
 * Page → mode and framing. The galaxy is live on every page: explorable on Home, with a
 * closer, fixed framing on Focus, and wide and dimmer behind the content of every other page.
 */
export const PAGES: Record<string, PageStyle> = {
  "/": { mode: "interactive", framing: "home" },
  "/focus": { mode: "live", framing: "focus" },
};
const ELSEWHERE: PageStyle = { mode: "live", framing: "page" };

export function pageFor(pathname: string): PageStyle {
  return PAGES[pathname] ?? ELSEWHERE;
}

/**
 * What the engine is doing:
 *   live    the galaxy is redrawn every frame
 *   still   nothing moves by itself: one drawn frame, and no frame is requested
 *   waking  a still sky while an event plays: the cached galaxy plus the event's glow
 *   hidden  the tab or the installed app is in the background: no frames at all
 */
export type RunState = "live" | "waking" | "still" | "hidden";

export interface RunInput {
  visible: boolean;
  /** Reduced motion, or a device that cannot afford motion. */
  still: boolean;
  /** An event is playing or about to. */
  playing: boolean;
}

export function runState(input: RunInput): RunState {
  if (!input.visible) return "hidden";
  if (!input.still) return "live";
  return input.playing ? "waking" : "still";
}
