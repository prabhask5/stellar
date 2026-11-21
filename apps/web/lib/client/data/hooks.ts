"use client";

import type { Settings } from "@stellar/db";
import { type DateStr, todayIn, type UniverseSnapshot, type WeekStart } from "@stellar/shared";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, useSyncExternalStore } from "react";
import { create } from "zustand";
import { type Collections, type CollectionTable, type FocusCache, keys } from "../cache";
import { serverNow, setServerSkew } from "../session";
import { getSupabase } from "../supabase";
import { fetchCollection, fetchFocus, fetchSettings } from "./core";

/** True once a session (or the remembered connection details) is available, so queries may run. */
export const useReady = create<{ ready: boolean }>(() => ({ ready: false }));

const EMPTY: readonly never[] = Object.freeze([]);

export function useCollection<T extends CollectionTable>(
  table: T,
): { rows: Collections[T][]; loading: boolean } {
  const ready = useReady((s) => s.ready);
  const q = useQuery({
    queryKey: keys.table(table),
    queryFn: () => fetchCollection(table),
    enabled: ready,
  });
  return { rows: q.data ?? (EMPTY as unknown as Collections[T][]), loading: q.data === undefined };
}

export function useSettings(): Settings | undefined {
  const ready = useReady((s) => s.ready);
  return useQuery({
    queryKey: keys.settings,
    queryFn: fetchSettings,
    enabled: ready,
    staleTime: 30 * 60_000,
  }).data;
}

export function useFocus(): FocusCache | undefined {
  const ready = useReady((s) => s.ready);
  return useQuery({ queryKey: keys.focus, queryFn: fetchFocus, enabled: ready, staleTime: 60_000 })
    .data;
}

async function fetchUniverse(): Promise<UniverseSnapshot> {
  const { data, error } = await (await getSupabase()).rpc("sp_universe_snapshot");
  if (error) throw Object.assign(new Error(error.message), error);
  const snapshot = data as unknown as UniverseSnapshot;
  setServerSkew(snapshot.server_time);
  return snapshot;
}

export function useUniverse(): UniverseSnapshot | undefined {
  const ready = useReady((s) => s.ready);
  return useQuery({
    queryKey: keys.universe,
    queryFn: fetchUniverse,
    enabled: ready,
    staleTime: 60_000,
  }).data;
}

// ── clock ───────────────────────────────────────────────────────────────────
// One shared minute tick; components that show "today" or time-of-day subscribe to it.
let minuteNow = Date.now();
const minuteListeners = new Set<() => void>();
let minuteTimer: ReturnType<typeof setInterval> | null = null;

function subscribeMinute(listener: () => void): () => void {
  minuteListeners.add(listener);
  if (!minuteTimer) {
    const tick = () => {
      minuteNow = serverNow();
      for (const l of minuteListeners) l();
    };
    minuteTimer = setInterval(tick, 20_000);
    document.addEventListener("visibilitychange", tick);
  }
  return () => {
    minuteListeners.delete(listener);
  };
}

/** Server-corrected "now", refreshed a few times a minute. Stable during SSR. */
export function useMinute(): number {
  return useSyncExternalStore(
    subscribeMinute,
    () => minuteNow,
    () => 0,
  );
}

export function useTimeZone(): string {
  const settings = useSettings();
  return settings?.timezone ?? "UTC";
}

export function useWeekStart(): WeekStart {
  const settings = useSettings();
  return settings?.week_start === 0 ? 0 : 1;
}

/** Today's date in the owner's time zone. Rolls over at midnight without a reload. */
export function useToday(): DateStr {
  const tz = useTimeZone();
  const now = useMinute();
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return todayIn(tz, hydrated && now ? now : serverNow());
}

/** A fast clock for countdowns: re-renders every `intervalMs` while mounted and visible. */
export function useTick(intervalMs = 250, active = true): number {
  const [now, setNow] = useState(() => serverNow());
  useEffect(() => {
    if (!active) return;
    setNow(serverNow());
    const t = setInterval(() => setNow(serverNow()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs, active]);
  return now;
}
