import { create } from "zustand";

export type RealtimeStatus = "idle" | "connecting" | "connected" | "disconnected";

export interface SyncState {
  /** Browser connectivity, corrected by real request failures. */
  online: boolean;
  /** Mutations waiting in the outbox. */
  pending: number;
  /** True while the outbox is being sent. */
  syncing: boolean;
  realtime: RealtimeStatus;
  /** Devices currently connected (Realtime presence), including this one. */
  devices: number;
}

export const useSync = create<SyncState>(() => ({
  // Node also defines `navigator` (without onLine), so test for the browser explicitly.
  online: typeof window === "undefined" ? true : navigator.onLine !== false,
  pending: 0,
  syncing: false,
  realtime: "idle",
  devices: 1,
}));

export type SyncLabel = { tone: "live" | "offline" | "busy"; text: string };

/** The line shown by SyncIndicator. */
export function syncLabel(s: SyncState): SyncLabel {
  if (!s.online) {
    return { tone: "offline", text: s.pending > 0 ? "Offline, changes saved" : "Offline" };
  }
  if (s.syncing || s.pending > 0 || s.realtime === "connecting")
    return { tone: "busy", text: "Syncing…" };
  if (s.realtime === "disconnected") return { tone: "busy", text: "Reconnecting…" };
  return {
    tone: "live",
    text: s.devices === 1 ? "1 device in sync" : `${s.devices} devices in sync`,
  };
}
