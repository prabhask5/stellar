/** Normalisation for site patterns and instance URLs. Site rules mirror SQL `sp_normalize_site`. */

export type Normalized<T> = { ok: true; value: T } | { ok: false; message: string };

const LABEL_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * Normalises a blocked-site entry to a bare domain: lowercase, no scheme,
 * no "www.", no path, query, port or credentials. "https://www.YouTube.com/watch?v=1" → "youtube.com".
 */
export function normalizeSitePattern(input: string): Normalized<string> {
  let s = input.trim().toLowerCase();
  if (!s) return { ok: false, message: "Enter a website, like youtube.com." };
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  s = s.replace(/^[^/?#]*@/, "");
  s = s.split(/[/?#]/)[0] ?? "";
  s = s.replace(/:\d+$/, "");
  s = s.replace(/^\*\./, "");
  s = s.replace(/^www\./, "");
  s = s.replace(/\.$/, "");
  if (!s) return { ok: false, message: "Enter a website, like youtube.com." };
  if (/\s/.test(s)) return { ok: false, message: "A website can't contain spaces." };
  if (s.length > 253) return { ok: false, message: "That address is too long." };
  const labels = s.split(".");
  if (labels.length < 2) {
    return { ok: false, message: `"${s}" needs a domain ending, like ${s}.com.` };
  }
  if (!labels.every((l) => LABEL_RE.test(l))) {
    return { ok: false, message: `"${s}" isn't a valid website address.` };
  }
  const tld = labels[labels.length - 1] ?? "";
  if (/^\d+$/.test(tld))
    return { ok: false, message: "IP addresses can't be blocked. Use a domain." };
  return { ok: true, value: s };
}

/** True when `hostname` is the pattern's domain or any subdomain of it. */
export function hostMatchesPattern(hostname: string, pattern: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return host === pattern || host.endsWith(`.${pattern}`);
}

export interface ParsedSites {
  valid: string[];
  invalid: { input: string; message: string }[];
}

/** Splits pasted text (newlines, commas, spaces) into unique normalised patterns. */
export function parseSiteList(text: string): ParsedSites {
  const valid: string[] = [];
  const invalid: { input: string; message: string }[] = [];
  const seen = new Set<string>();
  for (const raw of text.split(/[\s,;]+/)) {
    const entry = raw.trim();
    if (!entry) continue;
    const r = normalizeSitePattern(entry);
    if (!r.ok) invalid.push({ input: entry, message: r.message });
    else if (!seen.has(r.value)) {
      seen.add(r.value);
      valid.push(r.value);
    }
  }
  return { valid, invalid };
}

const SUPABASE_SUFFIXES = [
  "/rest/v1",
  "/auth/v1",
  "/realtime/v1",
  "/storage/v1",
  "/functions/v1",
  "/graphql/v1",
  "/pg",
  "/api",
  "/rest",
  "/auth",
];

export interface NormalizedUrl {
  url: string;
  /** True when the result differs from the trimmed input beyond adding a scheme. */
  changed: boolean;
  /** What the user typed (trimmed), for hints like "you entered …/api". */
  entered: string;
}

function withScheme(input: string): string {
  if (/^https?:\/\//i.test(input)) return input;
  const bare = input.replace(/^\/+/, "");
  const local = /^(localhost|127\.|10\.|192\.168\.|\[?::1\]?|host\.docker\.internal)/i.test(bare);
  return `${local ? "http" : "https"}://${bare}`;
}

/**
 * Normalises a Supabase URL: trims whitespace and trailing slashes, strips
 * accidental API suffixes (/rest/v1, /auth/v1, /api…), adds https:// if missing.
 */
export function normalizeSupabaseUrl(input: string): Normalized<NormalizedUrl> {
  const entered = input.trim();
  if (!entered) return { ok: false, message: "Enter your Supabase URL." };
  let parsed: URL;
  try {
    parsed = new URL(withScheme(entered));
  } catch {
    return { ok: false, message: "That doesn't look like a URL." };
  }
  if (!parsed.hostname.includes(".") && parsed.hostname !== "localhost") {
    return { ok: false, message: "That doesn't look like a URL." };
  }
  let path = parsed.pathname.replace(/\/+$/, "");
  let stripped = true;
  while (stripped) {
    stripped = false;
    for (const suffix of SUPABASE_SUFFIXES) {
      if (path.toLowerCase().endsWith(suffix)) {
        path = path.slice(0, -suffix.length).replace(/\/+$/, "");
        stripped = true;
        break;
      }
    }
  }
  const url = `${parsed.protocol}//${parsed.host}${path}`;
  const comparable = withScheme(entered).replace(/\/+$/, "");
  return { ok: true, value: { url, changed: url !== comparable, entered } };
}

/** Normalises the app's public URL as typed into the extension or iOS app. */
export function normalizeAppUrl(input: string): Normalized<string> {
  const entered = input.trim();
  if (!entered) return { ok: false, message: "Enter your Stellar Planner address." };
  let parsed: URL;
  try {
    parsed = new URL(withScheme(entered));
  } catch {
    return { ok: false, message: "That doesn't look like a web address." };
  }
  if (!parsed.hostname.includes(".") && parsed.hostname !== "localhost") {
    return { ok: false, message: "That doesn't look like a web address." };
  }
  let path = parsed.pathname.replace(/\/+$/, "");
  path = path.replace(/\/api(\/v1(\/instance)?)?$/i, "");
  // A pasted deep link ("/tasks", "/focus") still points at the same instance.
  path = path.replace(/\/(tasks|goals|routines|focus|settings|setup|lock)(\/.*)?$/i, "");
  return { ok: true, value: `${parsed.protocol}//${parsed.host}${path}` };
}
