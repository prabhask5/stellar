import raw from "../tokens.json" with { type: "json" };
import type { Tokens } from "./generate.ts";

export type { Tokens, TypeStyle, UniverseTokens } from "./generate.ts";

/** The design tokens, typed. Single source for web, extension and the universe scene. */
export const tokens = raw as Tokens;

export const colors = tokens.color;
export const springs = tokens.motion.spring;
export const durations = tokens.motion.duration;
