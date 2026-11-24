import type { FocusSettings, FocusState } from "@stellar/db";
import { describe, expect, it } from "vitest";
import { badgeFor, clock, decide, localEndsAt, remaining } from "./blocking.ts";
import {
  blockedPatternFor,
  blockedUrlFor,
  buildRules,
  domainRegex,
  MAX_REGEX_RULES,
  parseBlockedLocation,
  rulesKey,
} from "./rules.ts";
import type { Snapshot } from "./types.ts";

const PAGE = "chrome-extension://abcdefghijklmnop/blocked.html";
const T0 = Date.UTC(2026, 10, 21, 9, 0, 0);

const settings: FocusSettings = {
  user_id: "u",
  focus_min: 25,
  short_break_min: 5,
  long_break_min: 15,
  rounds_before_long: 4,
  auto_start_breaks: false,
  auto_start_focus: false,
  active_block_list_ids: ["l1"],
  created_at: "",
  updated_at: "",
};

function snap(patch: Partial<FocusState>, extra: Partial<Snapshot> = {}): Snapshot {
  const state: FocusState = {
    user_id: "u",
    status: "running",
    phase: "focus",
    round: 2,
    phase_started_at: new Date(T0).toISOString(),
    phase_ends_at: new Date(T0 + 25 * 60_000).toISOString(),
    paused_remaining_ms: null,
    phase_total_ms: 25 * 60_000,
    session_id: "s",
    version: 3,
    last_completed_phase: null,
    last_completed_at: null,
    notified_phase_end_at: null,
    created_at: "",
    updated_at: "",
    ...patch,
  };
  return {
    state,
    settings,
    blocking: {
      active: true,
      lists: [{ id: "l1", name: "Social", emoji: null }],
      patterns: ["youtube.com", "reddit.com"],
    },
    skewMs: 0,
    fetchedAt: T0,
    ...extra,
  };
}

describe("redirect rules", () => {
  it("matches the domain and every subdomain, on http and https, and nothing else", () => {
    const re = new RegExp(domainRegex("youtube.com"), "i");
    for (const url of [
      "https://youtube.com",
      "https://youtube.com/",
      "http://www.youtube.com/watch?v=1&t=2",
      "https://music.youtube.com/x#y",
      "https://youtube.com:8443/a",
      "https://YouTube.com?x=1",
      "https://a.b.youtube.com#frag",
    ]) {
      expect(re.test(url), url).toBe(true);
    }
    for (const url of [
      "https://notyoutube.com/",
      "https://youtube.com.evil.io/",
      "https://example.com/?u=youtube.com",
      "ftp://youtube.com/",
      "https://youtubeXcom/",
    ]) {
      expect(re.test(url), url).toBe(false);
    }
  });

  it("builds one main-frame redirect per unique domain that carries the original URL", () => {
    const rules = buildRules(
      ["youtube.com", "reddit.com", "youtube.com", " News.YCombinator.com "],
      PAGE,
    );
    expect(rules.map((r) => r.id)).toEqual([1, 2, 3]);
    expect(
      rules.every(
        (r) => r.condition.resourceTypes[0] === "main_frame" && r.action.type === "redirect",
      ),
    ).toBe(true);
    const yt = rules.find((r) => r.condition.regexFilter?.includes("youtube"));
    expect(yt?.action.redirect).toEqual({ regexSubstitution: `${PAGE}?site=youtube.com#\\0` });
    // Applying the rule the way the browser does.
    const original = "https://www.youtube.com/watch?v=abc&t=10";
    const redirected = original.replace(
      new RegExp(yt!.condition.regexFilter!, "i"),
      `${PAGE}?site=youtube.com#$&`,
    );
    expect(redirected).toBe(`${PAGE}?site=youtube.com#${original}`);
    const u = new URL(redirected);
    expect(parseBlockedLocation(u.search, u.hash)).toEqual({
      site: "youtube.com",
      target: original,
    });
  });

  it("stays inside the browser's regex-rule budget", () => {
    const many = Array.from({ length: MAX_REGEX_RULES + 5 }, (_, i) => `site${i}.com`);
    const rules = buildRules(many, PAGE);
    expect(rules).toHaveLength(MAX_REGEX_RULES + 5);
    expect(rules.filter((r) => r.condition.regexFilter).length).toBe(MAX_REGEX_RULES);
    const plain = rules[rules.length - 1]!;
    expect(plain.condition.urlFilter).toMatch(/^\|\|site\d+\.com\^$/);
    expect(plain.action.redirect).toMatchObject({
      extensionPath: expect.stringMatching(/^\/blocked\.html\?site=/),
    });
  });

  it("fingerprints a rule set regardless of order", () => {
    expect(rulesKey(["b.com", "a.com", "a.com"])).toBe(rulesKey(["a.com", "b.com"]));
    expect(rulesKey(["a.com"])).not.toBe(rulesKey(["a.com", "b.com"]));
  });

  it("finds already-open tabs on blocked sites", () => {
    const patterns = ["youtube.com", "reddit.com"];
    expect(blockedPatternFor("https://old.reddit.com/r/all", patterns)).toBe("reddit.com");
    expect(blockedPatternFor("https://example.com/", patterns)).toBeNull();
    expect(blockedPatternFor("chrome://extensions", patterns)).toBeNull();
    expect(blockedPatternFor("not a url", patterns)).toBeNull();
    expect(blockedUrlFor("https://old.reddit.com/r/all", "reddit.com", PAGE)).toBe(
      `${PAGE}?site=reddit.com#https://old.reddit.com/r/all`,
    );
  });

  it("never sends the visitor somewhere other than the blocked site", () => {
    expect(parseBlockedLocation("?site=youtube.com", "#https://evil.example/phish")).toEqual({
      site: "youtube.com",
      target: "https://youtube.com",
    });
    expect(parseBlockedLocation("?site=youtube.com", "#javascript:alert(1)")).toEqual({
      site: "youtube.com",
      target: "https://youtube.com",
    });
    expect(parseBlockedLocation("?site=youtube.com", "")).toEqual({
      site: "youtube.com",
      target: "https://youtube.com",
    });
    expect(parseBlockedLocation("", "")).toEqual({ site: "", target: null });
  });
});

describe("blocking decision", () => {
  it("blocks during a running focus phase, until it ends", () => {
    const s = snap({});
    expect(decide(s, T0 + 60_000)).toMatchObject({
      block: true,
      unblockAt: T0 + 25 * 60_000,
      patterns: ["youtube.com", "reddit.com"],
    });
    // Offline past the end: blocking lifts on its own.
    expect(decide(s, T0 + 25 * 60_000)).toMatchObject({ block: false, unblockAt: null });
    expect(decide(s, T0 + 26 * 60_000).block).toBe(false);
  });

  it("keeps blocking while a focus phase is paused, with no end time", () => {
    const s = snap({ status: "paused", phase_ends_at: null, paused_remaining_ms: 10 * 60_000 });
    expect(decide(s, T0 + 99 * 60_000)).toMatchObject({ block: true, unblockAt: null });
  });

  it("never blocks during breaks, while awaiting, or when idle", () => {
    expect(decide(snap({ phase: "short_break" }), T0).block).toBe(false);
    expect(decide(snap({ phase: "long_break", status: "paused" }), T0).block).toBe(false);
    expect(decide(snap({ status: "awaiting" }), T0).block).toBe(false);
    expect(decide(snap({ status: "idle" }), T0).block).toBe(false);
    expect(decide(null, T0).block).toBe(false);
  });

  it("does not install rules when no site is listed", () => {
    const s = snap({}, { blocking: { active: true, lists: [], patterns: [] } });
    expect(decide(s, T0).block).toBe(false);
  });

  it("corrects for clock skew", () => {
    // The server clock is 90s ahead of this device.
    const s = snap({}, { skewMs: 90_000 });
    expect(localEndsAt(s)).toBe(T0 + 25 * 60_000 - 90_000);
    expect(decide(s, T0 + 25 * 60_000 - 60_000).block).toBe(false);
    expect(remaining(s, T0)).toBe(25 * 60_000 - 90_000);
  });
});

describe("badge and clock", () => {
  it("shows remaining minutes during focus, B on breaks, nothing when idle", () => {
    expect(badgeFor(snap({}), T0 + 2 * 60_000 + 3_000)).toEqual({ text: "23", color: "#F6C76E" });
    expect(badgeFor(snap({}), T0 + 24 * 60_000 + 30_000).text).toBe("1");
    expect(
      badgeFor(
        snap({ status: "paused", phase_ends_at: null, paused_remaining_ms: 12 * 60_000 }),
        T0,
      ).text,
    ).toBe("12");
    expect(badgeFor(snap({ phase: "short_break" }), T0)).toEqual({ text: "B", color: "#9D8CFF" });
    expect(badgeFor(snap({ status: "idle" }), T0).text).toBe("");
    expect(badgeFor(snap({ status: "awaiting", phase: "short_break" }), T0).text).toBe("");
    expect(badgeFor(snap({}), T0 + 26 * 60_000).text).toBe("");
    expect(badgeFor(null, T0).text).toBe("");
  });

  it("formats the countdown", () => {
    expect(clock(snap({}), T0 + 6 * 60_000 + 18_000)).toBe("18:42");
    expect(
      clock(snap({ status: "paused", phase_ends_at: null, paused_remaining_ms: 90_000 }), T0),
    ).toBe("01:30");
    expect(clock(snap({ status: "idle" }), T0)).toBe("25:00");
    expect(clock(snap({ status: "awaiting", phase: "long_break" }), T0)).toBe("15:00");
  });

  it("P1: a domain whose regex the browser refuses still gets a rule (plain filter)", () => {
    const rules = buildRules(["youtube.com", "reddit.com"], PAGE, new Set(["reddit.com"]));
    expect(rules).toHaveLength(2);
    const reddit = rules.find((r) => JSON.stringify(r).includes("reddit"));
    const youtube = rules.find((r) => JSON.stringify(r).includes("youtube"));
    expect(reddit?.condition).toEqual({
      urlFilter: "||reddit.com^",
      resourceTypes: ["main_frame"],
    });
    expect(youtube?.condition.regexFilter).toBe(domainRegex("youtube.com"));
    // Last resort when the whole set is refused: every domain is still blocked.
    const all = buildRules(["youtube.com", "reddit.com"], PAGE, "all");
    expect(all.every((r) => r.condition.urlFilter && !r.condition.regexFilter)).toBe(true);
  });

  it("P2: a trailing-dot hostname does not slip past the block rule", () => {
    const re = new RegExp(domainRegex("youtube.com"));
    expect(re.test("https://youtube.com./watch?v=1")).toBe(true);
    expect(re.test("https://www.youtube.com.:443/")).toBe(true);
    expect(re.test("https://youtube.com/")).toBe(true);
    expect(re.test("https://notyoutube.com/")).toBe(false);
    expect(re.test("https://youtube.com.evil.example/")).toBe(false);
  });
});
