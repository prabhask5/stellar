import type { FocusSettings, FocusState } from "@stellar/db";

/** What the extension remembers about the instance it is linked to. */
export interface Connection {
  /** The app's public URL, e.g. https://planner.example.com */
  appUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  userId: string;
  deviceId: string | null;
  connectedAt: number;
}

export interface BlockingInfo {
  active: boolean;
  lists: { id: string; name: string; emoji: string | null }[];
  patterns: string[];
}

/** The last state fetched from the server, cached so blocking keeps working offline. */
export interface Snapshot {
  state: FocusState;
  settings: FocusSettings;
  blocking: BlockingInfo;
  /** Server clock minus local clock, in ms, measured when this was fetched. */
  skewMs: number;
  fetchedAt: number;
}

export type LinkStatus = "disconnected" | "connected" | "offline" | "needs_pin";

export type Message =
  | { type: "connected" }
  | { type: "disconnect" }
  | { type: "resync" }
  | { type: "timer"; action: "start" | "pause" | "resume" | "skip" | "end" };
