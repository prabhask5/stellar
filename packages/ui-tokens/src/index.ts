import raw from "../tokens.json" with { type: "json" };
import type { Tokens } from "./generate.ts";

export type { Tokens, TypeStyle } from "./generate.ts";

/** The design tokens, typed. Single source for web, extension and the universe scene. */
export const tokens: Tokens = raw;

export const colors = tokens.color;
export const springs = tokens.motion.spring;
export const durations = tokens.motion.duration;
