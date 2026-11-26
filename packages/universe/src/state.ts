/**
 * What the app tells the universe, and the pointer input from the Home stage. A few plain
 * values with listeners and no imports: the app writes here from its first render, long
 * before the host (a lazy chunk) exists to read it.
 */
import type { QualitySetting } from "./renderer/quality.ts";

export interface UniverseAppState {
  /** False while signed out: the CSS starfield is all there is. */
  active: boolean;
  pathname: string;
  setting: QualitySetting;
  /** A focus phase is running or paused. */
  focusing: boolean;
}

let state: UniverseAppState = { active: false, pathname: "/", setting: "auto", focusing: false };
const stateListeners = new Set<(s: UniverseAppState) => void>();

export function getUniverseState(): UniverseAppState {
  return state;
}

export function setUniverseState(patch: Partial<UniverseAppState>): void {
  let changed = false;
  for (const key of Object.keys(patch) as (keyof UniverseAppState)[]) {
    if (patch[key] !== undefined && patch[key] !== state[key]) changed = true;
  }
  if (!changed) return;
  state = { ...state, ...patch };
  for (const l of stateListeners) l(state);
}

export function onUniverseState(listener: (s: UniverseAppState) => void): () => void {
  stateListeners.add(listener);
  return () => {
    stateListeners.delete(listener);
  };
}

/** Pointer input on the Home stage. Angles in pixels of travel; `zoom` > 1 moves closer. */
export type StageInput =
  | { type: "grab" }
  | { type: "drag"; dx: number; dy: number }
  | { type: "release" }
  | { type: "zoom"; factor: number }
  | { type: "reset" };

let inputListener: ((input: StageInput) => void) | null = null;

export function sendStageInput(input: StageInput): void {
  inputListener?.(input);
}

export function onStageInput(listener: ((input: StageInput) => void) | null): void {
  inputListener = listener;
}
