import type { RealtimeChannel } from "@supabase/supabase-js";
import { browser } from "wxt/browser";
import { badgeFor, decide } from "./blocking.ts";
import {
  type Db,
  fetchSnapshot,
  forgetClient,
  getClient,
  isAuthFailure,
  isOffline,
  timerAction,
} from "./client.ts";
import {
  blockedPatternFor,
  blockedUrlFor,
  buildRules,
  domainRegex,
  MAX_REGEX_RULES,
  rulesKey,
} from "./rules.ts";
import {
  clearAll,
  getRulesKey,
  getSnapshot,
  setRulesKey,
  setSnapshot,
  setStatus,
} from "./storage.ts";
import type { Message, Snapshot } from "./types.ts";

const ALARM_RESYNC = "sp-resync";
const ALARM_UNBLOCK = "sp-unblock";
const TABLES = [
  "sp_focus_state",
  "sp_focus_settings",
  "sp_block_lists",
  "sp_block_list_sites",
] as const;

let channel: RealtimeChannel | null = null;
let channelFor: Db | null = null;
let resyncing: Promise<void> | null = null;
let debounce: ReturnType<typeof setTimeout> | null = null;

function blockedPage(): string {
  return browser.runtime.getURL("/blocked.html");
}

async function setBadge(snapshot: Snapshot | null): Promise<void> {
  const badge = badgeFor(snapshot, Date.now());
  await browser.action.setBadgeText({ text: badge.text });
  if (badge.text) {
    await browser.action.setBadgeBackgroundColor({ color: badge.color });
    // Dark text on the gold badge where the browser lets us choose.
    await browser.action.setBadgeTextColor?.({ color: "#1A1206" });
  }
}

/** Sends tabs that are already sitting on a blocked site to the block page. */
async function redirectOpenTabs(patterns: readonly string[]): Promise<void> {
  const tabs = await browser.tabs.query({});
  await Promise.all(
    tabs.map(async (tab) => {
      if (!tab.id || !tab.url) return;
      const pattern = blockedPatternFor(tab.url, patterns);
      if (pattern)
        await browser.tabs
          .update(tab.id, { url: blockedUrlFor(tab.url, pattern, blockedPage()) })
          .catch(() => undefined);
    }),
  );
}

type DnrRules = Parameters<typeof browser.declarativeNetRequest.updateDynamicRules>[0]["addRules"];

/** Domains whose regex the browser will not compile (too large, unsupported syntax). */
async function unsupportedRegexes(patterns: readonly string[]): Promise<Set<string>> {
  const dnr = browser.declarativeNetRequest as typeof browser.declarativeNetRequest & {
    isRegexSupported?: (options: { regex: string }) => Promise<{ isSupported: boolean }>;
  };
  const bad = new Set<string>();
  if (!dnr.isRegexSupported) return bad;
  await Promise.all(
    patterns.slice(0, MAX_REGEX_RULES).map(async (pattern) => {
      try {
        const res = await dnr.isRegexSupported?.({ regex: domainRegex(pattern) });
        if (res && !res.isSupported) bad.add(pattern);
      } catch {
        // cannot tell: leave it to the install fallback below
      }
    }),
  );
  return bad;
}

/**
 * Replaces the dynamic rules. An update is all-or-nothing, so one rule the browser
 * rejects would leave nothing blocked: such domains get a plain filter rule instead,
 * and if the set is still refused, every domain does.
 */
async function installRules(patterns: readonly string[]): Promise<void> {
  const existing = await browser.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existing.map((r) => r.id);
  if (patterns.length === 0) {
    await browser.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules: [] });
    return;
  }
  const plain = await unsupportedRegexes(patterns);
  try {
    await browser.declarativeNetRequest.updateDynamicRules({
      removeRuleIds,
      addRules: buildRules(patterns, blockedPage(), plain) as unknown as DnrRules,
    });
  } catch (err) {
    console.warn("[stellar] regex rules refused; blocking with plain filters", err);
    await browser.declarativeNetRequest.updateDynamicRules({
      removeRuleIds,
      addRules: buildRules(patterns, blockedPage(), "all") as unknown as DnrRules,
    });
  }
}

/**
 * Makes the browser match the cached state: redirect rules while a focus phase
 * blocks, none otherwise; the badge; and an alarm that lifts the block exactly
 * when a running phase ends, so it works with no network at all.
 */
export async function apply(snapshot: Snapshot | null = null): Promise<void> {
  const current = snapshot ?? (await getSnapshot());
  const decision = decide(current, Date.now());
  const key = decision.block ? rulesKey(decision.patterns) : "";
  const previous = (await getRulesKey()) ?? "";
  if (key !== previous) {
    await installRules(decision.block ? decision.patterns : []);
    await setRulesKey(key);
    // Blocking has just begun, or the lists changed: catch tabs that are already open.
    if (decision.block) await redirectOpenTabs(decision.patterns);
  }
  if (decision.block && decision.unblockAt) {
    await browser.alarms.create(ALARM_UNBLOCK, {
      when: Math.max(Date.now() + 250, decision.unblockAt + 150),
    });
  } else {
    await browser.alarms.clear(ALARM_UNBLOCK);
  }
  await setBadge(current);
}

function subscribe(db: Db, userId: string, deviceId: string | null): void {
  if (channel && channelFor === db) return;
  if (channel && channelFor) void channelFor.removeChannel(channel);
  let ch = db.channel(`sp:${userId}`, {
    config: { presence: { key: `extension:${deviceId ?? browser.runtime.id}` } },
  });
  for (const table of TABLES) {
    ch = ch.on(
      "postgres_changes",
      { event: "*", schema: "public", table, filter: `user_id=eq.${userId}` },
      () => schedule(),
    );
  }
  // Site deletions carry no user_id, so listen for them unfiltered.
  ch = ch.on(
    "postgres_changes",
    { event: "DELETE", schema: "public", table: "sp_block_list_sites" },
    () => schedule(),
  );
  ch.subscribe((status) => {
    if (status === "SUBSCRIBED") {
      void ch.track({
        device: `extension:${deviceId ?? browser.runtime.id}`,
        kind: "extension",
        at: Date.now(),
      });
      schedule();
    }
  });
  channel = ch;
  channelFor = db;
}

/** Coalesces bursts of Realtime events into one refetch. */
function schedule(): void {
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(() => {
    debounce = null;
    void resync();
  }, 120);
}

/** Fetches the current state and applies it. Safe to call on every wake. */
export function resync(): Promise<void> {
  if (resyncing) return resyncing;
  resyncing = (async () => {
    try {
      const link = await getClient();
      if (!link) {
        // Not linked: "disconnected" is the default, so nothing is written to storage.
        await apply(null);
        return;
      }
      const { db, connection } = link;
      // Realtime needs the session's token; restoring the session is also what triggers a refresh.
      const { data, error } = await db.auth.getSession();
      if (error && isOffline(error)) {
        // The token could not be refreshed because there is no connection. That is "offline",
        // not "signed out": keep showing and enforcing the last known timer.
        await setStatus("offline");
        await apply();
        return;
      }
      if (error || !data.session) {
        // The session is really gone (revoked, signed out everywhere). Without it the timer
        // cannot be followed any more, so a cached "paused focus" must not block for ever.
        await setStatus("needs_pin");
        await setSnapshot(null);
        await apply(null);
        return;
      }
      try {
        const snapshot = await fetchSnapshot(db);
        await setSnapshot(snapshot);
        await setStatus("connected");
        await apply(snapshot);
        subscribe(db, connection.userId, connection.deviceId);
      } catch (err) {
        if (isAuthFailure(err) && !isOffline(err)) {
          await setStatus("needs_pin");
          await setSnapshot(null);
          await apply(null);
          return;
        }
        await setStatus("offline");
        // Offline: keep enforcing the last known state (it expires by itself at phase_ends_at).
        await apply();
      }
    } finally {
      resyncing = null;
    }
  })();
  return resyncing;
}

async function disconnect(): Promise<void> {
  // Let a sync that is already under way finish first, so it cannot write state back afterwards.
  if (debounce) {
    clearTimeout(debounce);
    debounce = null;
  }
  if (resyncing) await resyncing.catch(() => undefined);
  const link = await getClient();
  if (link) {
    if (channel) await link.db.removeChannel(channel).catch(() => undefined);
    await link.db.auth.signOut({ scope: "local" }).catch(() => undefined);
  }
  channel = null;
  channelFor = null;
  forgetClient();
  await clearAll();
  await installRules([]);
  await browser.alarms.clear(ALARM_UNBLOCK);
  await browser.action.setBadgeText({ text: "" });
}

async function act(
  action: Extract<Message, { type: "timer" }>["action"],
): Promise<{ ok: boolean; error: string | null }> {
  const link = await getClient();
  const snapshot = await getSnapshot();
  if (!link || !snapshot) return { ok: false, error: "not_connected" };
  try {
    let result = await timerAction(link.db, action, Number(snapshot.state.version));
    await resync();
    if (!result.ok) {
      // Another device moved the timer first. If the press still means the same thing
      // against the state as it is now, apply it there instead of silently dropping it.
      const fresh = await getSnapshot();
      if (
        fresh &&
        fresh.state.status === snapshot.state.status &&
        fresh.state.phase === snapshot.state.phase
      ) {
        result = await timerAction(link.db, action, Number(fresh.state.version));
        await resync();
      }
    }
    return result;
  } catch (err) {
    return { ok: false, error: isOffline(err) ? "offline" : "failed" };
  }
}

/** Wires the worker: startup, alarms, messages and connectivity. Called once per worker start. */
export function startBackground(): void {
  const wake = () => {
    // The shortest period browsers allow; each tick re-syncs in case the socket was suspended.
    void browser.alarms.create(ALARM_RESYNC, { periodInMinutes: 0.5 });
    void apply().then(() => resync());
  };
  browser.runtime.onInstalled.addListener(wake);
  browser.runtime.onStartup.addListener(wake);
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_UNBLOCK) void apply().then(() => resync());
    else if (alarm.name === ALARM_RESYNC) void resync();
  });
  browser.runtime.onMessage.addListener((message: Message, _sender, respond) => {
    if (message.type === "connected" || message.type === "resync")
      void resync().then(() => respond({ ok: true }));
    else if (message.type === "disconnect") void disconnect().then(() => respond({ ok: true }));
    else if (message.type === "timer") void act(message.action).then(respond);
    else return undefined;
    return true; // keep the channel open for the async answer
  });
  globalThis.addEventListener?.("online", () => void resync());
  wake();
}
