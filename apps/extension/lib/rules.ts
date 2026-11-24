import { hostMatchesPattern } from "@stellar/shared/normalize";

/** A declarativeNetRequest rule, typed locally so the builder stays testable without browser types. */
export interface RedirectRule {
  id: number;
  priority: number;
  action: { type: "redirect"; redirect: { regexSubstitution: string } | { extensionPath: string } };
  condition: { regexFilter?: string; urlFilter?: string; resourceTypes: ["main_frame"] };
}

/** Chrome allows 1000 regex rules; stay well under and fall back to plain filters beyond that. */
export const MAX_REGEX_RULES = 900;
export const MAX_RULES = 4500;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Matches the whole URL of a top-level navigation to a domain or any of its
 * subdomains, over http or https, so `\0` in the substitution is the original URL.
 */
export function domainRegex(pattern: string): string {
  // `\\.?` after the host: "youtube.com." (a fully qualified name with its trailing dot)
  // reaches the same site and must not slip past the rule.
  return `^https?://([a-z0-9-]+\\.)*${escapeRegex(pattern)}\\.?(:[0-9]+)?([/?#].*)?$`;
}

/**
 * One redirect rule per blocked domain. The original address travels in the
 * fragment (after `#`), where it needs no encoding, so the block page can offer
 * to continue there once the focus phase ends.
 */
export function buildRules(
  patterns: readonly string[],
  blockedPageUrl: string,
  /** Domains (or "all") that must use a plain filter because their regex is not accepted. */
  plain: ReadonlySet<string> | "all" = new Set(),
): RedirectRule[] {
  const unique = [...new Set(patterns.map((p) => p.trim().toLowerCase()).filter(Boolean))]
    .sort()
    .slice(0, MAX_RULES);
  return unique.map((pattern, i) => {
    const id = i + 1;
    if (i < MAX_REGEX_RULES && plain !== "all" && !plain.has(pattern)) {
      return {
        id,
        priority: 1,
        action: {
          type: "redirect",
          redirect: {
            regexSubstitution: `${blockedPageUrl}?site=${encodeURIComponent(pattern)}#\\0`,
          },
        },
        condition: { regexFilter: domainRegex(pattern), resourceTypes: ["main_frame"] },
      };
    }
    // Beyond the regex budget: still blocked, without the "continue to" address.
    const page = new URL(blockedPageUrl);
    return {
      id,
      priority: 1,
      action: {
        type: "redirect",
        redirect: { extensionPath: `${page.pathname}?site=${encodeURIComponent(pattern)}` },
      },
      condition: { urlFilter: `||${pattern}^`, resourceTypes: ["main_frame"] },
    };
  });
}

/** A stable fingerprint of a rule set, to skip reinstalling identical rules. */
export function rulesKey(patterns: readonly string[]): string {
  return [...new Set(patterns)].sort().join("\n");
}

/** The blocked pattern a URL falls under, if any. Used for tabs that are already open. */
export function blockedPatternFor(url: string, patterns: readonly string[]): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  return patterns.find((p) => hostMatchesPattern(parsed.hostname, p)) ?? null;
}

/** Where an already-open tab should be sent. */
export function blockedUrlFor(url: string, pattern: string, blockedPageUrl: string): string {
  return `${blockedPageUrl}?site=${encodeURIComponent(pattern)}#${url}`;
}

/** Reads the block page's own address: which site was blocked and where the visitor was going. */
export function parseBlockedLocation(
  search: string,
  hash: string,
): { site: string; target: string | null } {
  const site = new URLSearchParams(search).get("site") ?? "";
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  let target: string | null = null;
  try {
    const u = new URL(raw);
    // Only ever send the visitor back to a web page on the site that was blocked.
    if (
      (u.protocol === "https:" || u.protocol === "http:") &&
      (!site || hostMatchesPattern(u.hostname, site))
    )
      target = u.href;
  } catch {
    target = null;
  }
  return { site, target: target ?? (site ? `https://${site}` : null) };
}
