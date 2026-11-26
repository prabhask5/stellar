import type { BlockList, BlockListSite, FocusSettings, FocusState } from "@stellar/db";
import {
  applyTimerAction,
  isBlockingActive,
  parseSiteList,
  rankAtEnd,
  type TimerAction,
  type TimerSettings,
  type TimerState,
} from "@stellar/shared";
import { type CosmicEventType, emitCosmic } from "@stellar/universe/bus";
import { type FocusCache, getRows, keys, queryClient, setRows } from "../cache";
import { enqueue } from "../outbox";
import { serverNow } from "../session";
import { toast } from "../toast";
import {
  currentUserId,
  hardDeleteRow,
  insertRow,
  newId,
  nowIso,
  restoreRow,
  softDeleteRow,
  updateRow,
} from "./core";

const ms = (iso: string | null): number | null => (iso ? Date.parse(iso) : null);
const iso = (t: number | null): string | null => (t === null ? null : new Date(t).toISOString());

/** Database row → the pure state machine's shape. */
export function toTimerState(row: FocusState): TimerState {
  return {
    status: row.status,
    phase: row.phase,
    round: row.round,
    phase_started_at: ms(row.phase_started_at),
    phase_ends_at: ms(row.phase_ends_at),
    paused_remaining_ms: row.paused_remaining_ms,
    phase_total_ms: row.phase_total_ms,
    session_id: row.session_id,
    version: Number(row.version),
    last_completed_phase: row.last_completed_phase,
    last_completed_at: ms(row.last_completed_at),
  };
}

function toRow(prev: FocusState, s: TimerState): FocusState {
  return {
    ...prev,
    status: s.status,
    phase: s.phase,
    round: s.round,
    phase_started_at: iso(s.phase_started_at),
    phase_ends_at: iso(s.phase_ends_at),
    paused_remaining_ms: s.paused_remaining_ms,
    phase_total_ms: s.phase_total_ms,
    session_id: s.session_id,
    version: s.version,
    last_completed_phase: s.last_completed_phase,
    last_completed_at: iso(s.last_completed_at),
    updated_at: nowIso(),
  };
}

export function toTimerSettings(row: FocusSettings): TimerSettings {
  return {
    focus_min: row.focus_min,
    short_break_min: row.short_break_min,
    long_break_min: row.long_break_min,
    rounds_before_long: row.rounds_before_long,
    auto_start_breaks: row.auto_start_breaks,
    auto_start_focus: row.auto_start_focus,
  };
}

/**
 * Applies a timer action instantly with the shared state machine, then sends
 * it with the version it was based on. The server is authoritative: if another
 * device got there first, the result replaces the optimistic state.
 */
export function timerAction(action: TimerAction): boolean {
  const cache = queryClient.getQueryData<FocusCache>(keys.focus);
  if (!cache) return false;
  const before = toTimerState(cache.state);
  const result = applyTimerAction(
    before,
    toTimerSettings(cache.settings),
    action,
    before.version,
    serverNow(),
  );
  if (!result.ok) return false;
  queryClient.setQueryData<FocusCache>(keys.focus, {
    ...cache,
    state: toRow(cache.state, result.state),
  });
  enqueue({ kind: "timer", action, expectedVersion: before.version });
  return true;
}

/** A completion older than this was not seen happening: it is not celebrated. */
const FRESH_MS = 20_000;

export type FocusEventType = Extract<
  CosmicEventType,
  "focus_started" | "focus_break" | "focus_completed"
>;

type FocusMoment = Pick<
  FocusState,
  "phase" | "status" | "last_completed_phase" | "last_completed_at"
>;

/**
 * The cosmic events a change of the shared timer stands for. The timer is one row for every
 * device, so these play wherever the app is open, whoever pressed the button: a focus phase
 * beginning (not a resume), a break beginning, a focus phase running to its end.
 */
export function focusEventsFor(
  before: FocusMoment,
  after: FocusMoment,
  now: number,
): FocusEventType[] {
  const events: FocusEventType[] = [];
  const onBreak = (s: FocusMoment) =>
    s.phase !== "focus" && (s.status === "running" || s.status === "paused");
  if (
    after.last_completed_at !== before.last_completed_at &&
    after.last_completed_phase === "focus" &&
    after.last_completed_at &&
    now - Date.parse(after.last_completed_at) < FRESH_MS
  )
    events.push("focus_completed");
  if (isBlockingActive(after) && !isBlockingActive(before)) events.push("focus_started");
  if (onBreak(after) && !onBreak(before)) events.push("focus_break");
  return events;
}

let watching: (() => void) | null = null;

/**
 * Emits the focus events from every change of the timer in the cache: this device's own
 * action the moment it is applied, and another device's when it arrives. The first state
 * seen is only remembered, so opening the app mid-phase plays nothing.
 */
export function watchFocusEvents(): () => void {
  if (watching) return watching;
  let last = queryClient.getQueryData<FocusCache>(keys.focus)?.state;
  const off = queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== "updated" || event.query.queryKey[0] !== keys.focus[0]) return;
    const next = (event.query.state.data as FocusCache | undefined)?.state;
    if (!next || next === last) return;
    const previous = last;
    last = next;
    // An older version arriving late is not a change.
    if (!previous || Number(next.version) < Number(previous.version)) return;
    for (const type of focusEventsFor(previous, next, serverNow())) emitCosmic({ type });
  });
  watching = () => {
    off();
    watching = null;
  };
  return watching;
}

export type FocusSettingsPatch = Partial<
  Pick<
    FocusSettings,
    | "focus_min"
    | "short_break_min"
    | "long_break_min"
    | "rounds_before_long"
    | "auto_start_breaks"
    | "auto_start_focus"
    | "active_block_list_ids"
  >
>;

export function updateFocusSettings(patch: FocusSettingsPatch): void {
  queryClient.setQueryData<FocusCache>(keys.focus, (prev) =>
    prev ? { ...prev, settings: { ...prev.settings, ...patch } } : prev,
  );
  enqueue({ kind: "update_singleton", table: "sp_focus_settings", patch });
}

/** Turns a block list on or off for focus sessions. Works before and during a session. */
export function toggleBlockList(id: string): void {
  const cache = queryClient.getQueryData<FocusCache>(keys.focus);
  if (!cache) return;
  const active = cache.settings.active_block_list_ids;
  updateFocusSettings({
    active_block_list_ids: active.includes(id) ? active.filter((x) => x !== id) : [...active, id],
  });
}

// ── block lists ─────────────────────────────────────────────────────────────
export function createBlockList(name: string, emoji: string | null): BlockList {
  const now = nowIso();
  const row: BlockList = {
    id: newId(),
    user_id: currentUserId(),
    name: name.trim(),
    emoji,
    sort_order: rankAtEnd(getRows("sp_block_lists").map((l) => l.sort_order ?? 0)),
    deleted_at: null,
    created_at: now,
    updated_at: now,
  };
  insertRow("sp_block_lists", row, {
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    sort_order: row.sort_order,
  });
  return row;
}

export function updateBlockList(
  id: string,
  patch: Partial<Pick<BlockList, "name" | "emoji">>,
): void {
  updateRow("sp_block_lists", id, patch);
}

export function deleteBlockList(id: string): void {
  const cache = queryClient.getQueryData<FocusCache>(keys.focus);
  const wasActive = cache?.settings.active_block_list_ids.includes(id) ?? false;
  const removed = softDeleteRow("sp_block_lists", id);
  if (!removed) return;
  // The database drops a deleted list from the active set; mirror that locally.
  if (cache && wasActive) {
    queryClient.setQueryData<FocusCache>(keys.focus, {
      ...cache,
      settings: {
        ...cache.settings,
        active_block_list_ids: cache.settings.active_block_list_ids.filter((x) => x !== id),
      },
    });
  }
  toast(`Deleted “${removed.name}”`, {
    undo: () => {
      restoreRow("sp_block_lists", removed);
      if (wasActive) toggleBlockList(id);
    },
  });
}

export interface AddSitesResult {
  added: string[];
  duplicates: string[];
  invalid: { input: string; message: string }[];
}

/** Adds one or many sites (pasted lines are fine). Patterns are normalised and de-duplicated. */
export function addSites(listId: string, text: string): AddSitesResult {
  const parsed = parseSiteList(text);
  const existing = new Set(
    getRows("sp_block_list_sites")
      .filter((s) => s.block_list_id === listId)
      .map((s) => s.pattern),
  );
  const added: string[] = [];
  const duplicates: string[] = [];
  const now = nowIso();
  for (const pattern of parsed.valid) {
    if (existing.has(pattern)) {
      duplicates.push(pattern);
      continue;
    }
    const row: BlockListSite = {
      id: newId(),
      user_id: currentUserId(),
      block_list_id: listId,
      pattern,
      created_at: now,
      updated_at: now,
    };
    insertRow("sp_block_list_sites", row, { id: row.id, block_list_id: listId, pattern });
    added.push(pattern);
  }
  return { added, duplicates, invalid: parsed.invalid };
}

export function removeSite(id: string): void {
  hardDeleteRow("sp_block_list_sites", id);
}

export function removeSitesOfList(listId: string): void {
  setRows("sp_block_list_sites", (rows) => rows.filter((s) => s.block_list_id !== listId));
}
