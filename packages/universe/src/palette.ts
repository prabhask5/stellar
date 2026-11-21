import type { PlanetFamily } from "./layout.ts";

/** Scene colours, from the Nebula Gold tokens. RGB 0…1 for shaders, CSS strings for the 2D overlay. */
export const GOLD = "#F6C76E";
export const GOLD_RGB: [number, number, number] = [0.965, 0.78, 0.431];
export const CORE_RGB: [number, number, number] = [1.0, 0.839, 0.588];
export const VIOLET_RGB: [number, number, number] = [0.616, 0.549, 1.0];

export const FAMILY_RGB: Record<
  PlanetFamily,
  { base: [number, number, number]; light: [number, number, number] }
> = {
  gold: { base: [0.965, 0.78, 0.431], light: [1.0, 0.92, 0.72] },
  violet: { base: [0.616, 0.549, 1.0], light: [0.87, 0.84, 1.0] },
  rose: { base: [0.91, 0.435, 0.66], light: [1.0, 0.82, 0.9] },
  blue: { base: [0.435, 0.64, 1.0], light: [0.81, 0.89, 1.0] },
};

export const NEBULA_RGBA = {
  violet: "110,76,255",
  magenta: "214,72,160",
  blue: "60,110,255",
  gold: "246,199,110",
  core: "255,214,150",
  white: "245,243,255",
} as const;
