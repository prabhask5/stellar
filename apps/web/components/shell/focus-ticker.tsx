"use client";

import { isDue } from "@stellar/shared";
import { useEffect } from "react";
import { type FocusCache, keys, queryClient } from "@/lib/client/cache";
import { timerAction, toTimerState, watchFocusEvents } from "@/lib/client/data/focus";
import { useFocus } from "@/lib/client/data/hooks";
import { serverNow } from "@/lib/client/session";

/** How long to wait for the server's scheduler before this client advances the phase itself. */
const FALLBACK_MS = 2500;
/** A phase that ended longer ago than this was not ended on this screen. */
const STALE_MS = 8000;

/**
 * Keeps the timer honest on every page. The server's scheduler loop is the
 * authoritative advancer; if it has not advanced a finished phase shortly
 * after its end, this client does (the versioned RPC makes that race safe).
 * Also starts the watch that turns timer changes into the universe's focus events.
 */
export function FocusTicker() {
  const focus = useFocus();
  const state = focus?.state;

  useEffect(() => {
    if (!state || state.status !== "running" || !state.phase_ends_at) return;
    const endsAt = Date.parse(state.phase_ends_at);
    let cancelled = false;
    const fire = async () => {
      // If the end is long past, this state is old (a tab that was frozen, a cold start
      // from the cache): the server has almost certainly moved on. Ask it before acting,
      // instead of "advancing" a phase that ended minutes ago and celebrating it again.
      if (serverNow() - endsAt > STALE_MS) {
        await queryClient.refetchQueries({ queryKey: keys.focus }).catch(() => {});
        if (cancelled) return;
        const fresh = queryClient.getQueryData<FocusCache>(keys.focus)?.state;
        if (!fresh || fresh.version !== state.version) return;
      }
      if (isDue(toTimerState(state), serverNow())) timerAction("advance");
    };
    const delay = Math.max(0, endsAt - serverNow()) + FALLBACK_MS;
    const t = setTimeout(() => void fire(), delay);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [state]);

  // Returning to the app: the timer may have been advanced, paused or ended elsewhere.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible")
        void queryClient.invalidateQueries({ queryKey: keys.focus });
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  // The focus events of the universe follow the timer, on this device and every other.
  useEffect(() => watchFocusEvents(), []);

  return null;
}
