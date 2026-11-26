/** The galaxy's colours, from the `universe.*` design tokens, as linear RGB for the shaders. */
import tokens from "@stellar/ui-tokens/tokens.json" with { type: "json" };
import { linearRgb } from "./math.ts";

const u = tokens.universe;

export type Rgb = readonly [number, number, number];

export const PALETTE = {
  bg: linearRgb(u.bg) as Rgb,
  young: linearRgb(u.young) as Rgb,
  disk: linearRgb(u.disk) as Rgb,
  bulge: linearRgb(u.bulge) as Rgb,
  hii: linearRgb(u.hii) as Rgb,
  core: linearRgb(u.core) as Rgb,
  /** How strongly the dust lanes absorb, 0…1. */
  dust: u.dust,
  fx: {
    done: linearRgb(u.fx.done) as Rgb,
    born: linearRgb(u.fx.born) as Rgb,
    gone: linearRgb(u.fx.gone) as Rgb,
    focus: linearRgb(u.fx.focus) as Rgb,
    goal: linearRgb(u.fx.goal) as Rgb,
    routine: linearRgb(u.fx.routine) as Rgb,
    comet: linearRgb(u.fx.comet) as Rgb,
  },
} as const;

export const WHITE: Rgb = [1, 1, 1];
