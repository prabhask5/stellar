"use client";

import { isDue } from "@stellar/shared";
import { emitCosmic } from "@stellar/universe/bus";
import { useEffect, useRef } from "react";
import { timerAction, toTimerState } from "@/lib/client/data/focus";
import { useFocus } from "@/lib/client/data/hooks";
import { serverNow } from "@/lib/client/session";

/** How long to wait for the server's scheduler before this client advances the phase itself. */
const FALLBACK_MS = 2500;

/**
 * Keeps the timer honest on every page. The server's scheduler loop is the
 * authoritative advancer; if it has not advanced a finished phase shortly
 * after its end, this client does (the versioned RPC makes that race safe).
 * Also celebrates a focus phase completed elsewhere.
 */
export function FocusTicker() {
  const focus = useFocus();
  const state = focus?.state;
  const lastCompleted = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (!state || state.status !== "running" || !state.phase_ends_at) return;
    const endsAt = Date.parse(state.phase_ends_at);
    const fire = () => {
      if (isDue(toTimerState(state), serverNow())) timerAction("advance");
    };
    const delay = Math.max(0, endsAt - serverNow()) + FALLBACK_MS;
    const t = setTimeout(fire, delay);
    return () => clearTimeout(t);
  }, [state]);

  useEffect(() => {
    if (!state) return;
    const previous = lastCompleted.current;
    lastCompleted.current = state.last_completed_at;
    // Skip the first observation (page load) and local advances, which already emitted.
    if (previous === undefined || previous === state.last_completed_at) return;
    if (
      state.last_completed_phase === "focus" &&
      state.last_completed_at &&
      Date.now() - Date.parse(state.last_completed_at) < 20_000
    ) {
      emitCosmic({ type: "focus_complete" });
    }
  }, [state]);

  return null;
}
