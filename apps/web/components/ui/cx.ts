export type ClassValue = string | number | false | null | undefined | ClassValue[];

/** Joins class names, skipping falsy values. */
export function cx(...values: ClassValue[]): string {
  const out: string[] = [];
  for (const v of values) {
    if (!v && v !== 0) continue;
    if (Array.isArray(v)) {
      const inner = cx(...v);
      if (inner) out.push(inner);
    } else {
      out.push(String(v));
    }
  }
  return out.join(" ");
}
