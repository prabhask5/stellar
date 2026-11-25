/**
 * Pure generators: tokens.json → CSS variables, Tailwind v4 theme.
 * Kept free of I/O so the sync test can compare output with the files on disk.
 */

export interface TypeStyle {
  size: number;
  line: number;
  weight: number;
  tracking: number;
  uppercase?: boolean;
}

export interface Tokens {
  name: string;
  color: Record<string, string>;
  effect: Record<string, string>;
  font: { family: string };
  type: Record<string, TypeStyle>;
  space: number[];
  radius: Record<string, number>;
  motion: {
    duration: Record<string, number>;
    spring: Record<string, { stiffness: number; damping: number }>;
    pressScale: number;
  };
  layout: Record<string, number>;
}

const HEADER = "Generated from packages/ui-tokens/tokens.json. Do not edit by hand.";

export function kebab(key: string): string {
  return key
    .replace(/\./g, "-")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase();
}

export function generateCss(t: Tokens): string {
  const lines: string[] = [`/* ${HEADER} */`, ":root {"];
  for (const [k, v] of Object.entries(t.color)) lines.push(`  --sp-${kebab(k)}: ${v};`);
  for (const [k, v] of Object.entries(t.effect)) lines.push(`  --sp-${kebab(k)}: ${v};`);
  lines.push(`  --sp-font: ${t.font.family};`);
  for (const [k, v] of Object.entries(t.radius)) lines.push(`  --sp-radius-${kebab(k)}: ${v}px;`);
  for (const [k, v] of Object.entries(t.motion.duration)) lines.push(`  --sp-dur-${k}: ${v}ms;`);
  for (const [k, v] of Object.entries(t.layout)) {
    if (k.startsWith("breakpoint")) continue;
    lines.push(`  --sp-${kebab(k)}: ${v}px;`);
  }
  lines.push("}", "");
  return lines.join("\n");
}

/** Tailwind colour names: drop the "text." / "bg." namespaces that would read oddly as utilities. */
function twColor(key: string): string {
  const map: Record<string, string> = {
    "bg.void": "void",
    "glass.fill": "glass",
    "glass.fillStrong": "glass-strong",
    "glass.border": "hairline",
    "text.primary": "fg",
    "text.secondary": "fg-2",
  };
  return map[key] ?? kebab(key);
}

export function generateTheme(t: Tokens): string {
  const lines: string[] = [`/* ${HEADER} */`, "@theme {"];
  lines.push("  --color-*: initial;");
  lines.push("  --color-transparent: transparent;");
  lines.push("  --color-current: currentColor;");
  lines.push("  --color-black: #000;");
  lines.push("  --color-white: #fff;");
  for (const k of Object.keys(t.color)) {
    lines.push(`  --color-${twColor(k)}: var(--sp-${kebab(k)});`);
  }
  lines.push("  --font-sans: var(--sp-font);");
  lines.push("  --spacing: 4px;");
  lines.push("  --radius-*: initial;");
  for (const k of Object.keys(t.radius)) {
    lines.push(`  --radius-${kebab(k)}: var(--sp-radius-${kebab(k)});`);
  }
  lines.push("  --text-*: initial;");
  for (const [k, s] of Object.entries(t.type)) {
    const n = kebab(k);
    lines.push(`  --text-${n}: ${s.size}px;`);
    lines.push(`  --text-${n}--line-height: ${s.line}px;`);
    lines.push(`  --text-${n}--font-weight: ${s.weight};`);
    lines.push(`  --text-${n}--letter-spacing: ${s.tracking === 0 ? "0" : `${s.tracking}em`};`);
  }
  lines.push(`  --breakpoint-*: initial;`);
  lines.push(`  --breakpoint-md: ${t.layout.breakpointTablet}px;`);
  lines.push(`  --breakpoint-lg: ${t.layout.breakpointDesktop}px;`);
  lines.push(`  --breakpoint-xl: 1440px;`);
  lines.push(`  --shadow-glow: var(--sp-glow);`);
  lines.push(`  --ease-out-soft: cubic-bezier(0.22, 1, 0.36, 1);`);
  lines.push("}", "");
  return lines.join("\n");
}

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

export function parseColor(value: string): Rgba {
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex?.[1]) {
    const n = parseInt(hex[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  const rgba = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(value);
  if (rgba) {
    return {
      r: Number(rgba[1]),
      g: Number(rgba[2]),
      b: Number(rgba[3]),
      a: rgba[4] === undefined ? 1 : Number(rgba[4]),
    };
  }
  throw new Error(`Unsupported colour: ${value}`);
}
