/**
 * Reads a number the way people type one: "1,000" and "1 000" are a thousand, "2,5" and
 * "2.5" are two and a half, "1.000,5" is a thousand and a half. Returns NaN for anything
 * that is not a plain finite number, so callers can reject it.
 */
export function parseAmount(text: string): number {
  let s = text.trim().replace(/[\s\u00a0\u202f']/g, "");
  if (s === "" || !/^[+-]?[\d.,]+$/.test(s)) return NaN;
  const comma = s.lastIndexOf(",");
  const dot = s.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    // Both present: the later one is the decimal mark, the other groups thousands.
    const decimal = comma > dot ? "," : ".";
    const group = decimal === "," ? "." : ",";
    s = s.split(group).join("").replace(decimal, ".");
  } else if (comma >= 0) {
    // Only commas: "1,000" / "12,345,678" group thousands; "2,5" is a decimal comma.
    s = /^[+-]?\d{1,3}(,\d{3})+$/.test(s) ? s.split(",").join("") : s.replace(",", ".");
  }
  if ((s.match(/\./g) ?? []).length > 1) return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}
