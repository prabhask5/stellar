/**
 * Pure generators: tokens.json → CSS variables, Tailwind v4 theme, SwiftUI file.
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
  era: { name: string; threshold: number }[];
}

const HEADER = "Generated from packages/ui-tokens/tokens.json. Do not edit by hand.";

export function kebab(key: string): string {
  return key
    .replace(/\./g, "-")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase();
}

function camel(key: string): string {
  return key.replace(/[.-]([a-zA-Z])/g, (_, c: string) => c.toUpperCase());
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

const swiftWeight: Record<number, string> = {
  200: ".ultraLight",
  300: ".light",
  400: ".regular",
  500: ".medium",
  600: ".semibold",
  700: ".bold",
};

function f(n: number): string {
  return (Math.round(n * 1000) / 1000).toString();
}

export function generateSwift(t: Tokens): string {
  const out: string[] = [
    `// ${HEADER}`,
    `// Palette: ${t.name}. Dark only.`,
    "",
    "import SwiftUI",
    "",
    "public enum StellarTokens {",
    "    public enum Colors {",
  ];
  for (const [k, v] of Object.entries(t.color)) {
    const c = parseColor(v);
    out.push(
      `        public static let ${camel(k)} = Color(.sRGB, red: ${f(c.r / 255)}, green: ${f(c.g / 255)}, blue: ${f(c.b / 255)}, opacity: ${f(c.a)})`,
    );
  }
  out.push("    }", "", "    public enum Radius {");
  for (const [k, v] of Object.entries(t.radius)) {
    out.push(`        public static let ${camel(k)}: CGFloat = ${v === 9999 ? ".infinity" : v}`);
  }
  out.push("    }", "", "    public enum Space {");
  for (const v of t.space) out.push(`        public static let s${v}: CGFloat = ${v}`);
  out.push("    }", "", "    public enum Layout {");
  for (const [k, v] of Object.entries(t.layout)) {
    out.push(`        public static let ${camel(k)}: CGFloat = ${v}`);
  }
  out.push("    }", "", "    public enum Motion {");
  for (const [k, v] of Object.entries(t.motion.duration)) {
    out.push(`        public static let ${k}: Double = ${f(v / 1000)}`);
  }
  for (const [k, v] of Object.entries(t.motion.spring)) {
    out.push(
      `        public static let ${k}Spring = Animation.interpolatingSpring(stiffness: ${v.stiffness}, damping: ${v.damping})`,
    );
  }
  out.push(`        public static let pressScale: CGFloat = ${t.motion.pressScale}`);
  out.push("    }", "", "    public struct Era {", "        public let name: String");
  out.push("        public let threshold: Int", "    }", "");
  out.push("    public static let eras: [Era] = [");
  for (const e of t.era) out.push(`        Era(name: "${e.name}", threshold: ${e.threshold}),`);
  out.push("    ]", "}", "");

  out.push("public struct StellarTextStyle {");
  out.push("    public let size: CGFloat");
  out.push("    public let lineHeight: CGFloat");
  out.push("    public let weight: Font.Weight");
  out.push("    public let tracking: CGFloat");
  out.push("    public let uppercase: Bool");
  out.push("");
  out.push("    public var font: Font { .system(size: size, weight: weight) }");
  out.push("}", "");
  out.push("public extension StellarTextStyle {");
  for (const [k, s] of Object.entries(t.type)) {
    out.push(
      `    static let ${camel(k)} = StellarTextStyle(size: ${s.size}, lineHeight: ${s.line}, weight: ${swiftWeight[s.weight] ?? ".regular"}, tracking: ${f(s.tracking * s.size)}, uppercase: ${s.uppercase ? "true" : "false"})`,
    );
  }
  out.push("}", "");
  out.push("public extension View {");
  out.push(
    "    /// Applies a Stellar text style: system font, tracking, line spacing, tabular digits.",
  );
  out.push("    func stellarText(_ style: StellarTextStyle) -> some View {");
  out.push("        self.font(style.font.monospacedDigit())");
  out.push("            .tracking(style.tracking)");
  out.push("            .lineSpacing(max(0, style.lineHeight - style.size * 1.2))");
  out.push("            .textCase(style.uppercase ? .uppercase : nil)");
  out.push("    }");
  out.push("");
  out.push("    /// Glass surface used for cards, the tab bar and sheets.");
  out.push(
    "    func stellarGlass(cornerRadius: CGFloat = StellarTokens.Radius.card) -> some View {",
  );
  out.push("        self.background(");
  out.push("            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)");
  out.push("                .fill(StellarTokens.Colors.glassFill)");
  out.push(
    "                .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))",
  );
  out.push("        )");
  out.push("        .overlay(");
  out.push("            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)");
  out.push("                .strokeBorder(StellarTokens.Colors.glassBorder, lineWidth: 1)");
  out.push("        )");
  out.push("    }");
  out.push("}", "");
  return out.join("\n");
}
