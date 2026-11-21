import {
  REALTIME_TABLES,
  type FocusSettings,
  type FocusState,
  type RealtimeTable,
} from "@stellar/db";
import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import {
  type Collections,
  type CollectionTable,
  type FocusCache,
  keys,
  queryClient,
  removeRow,
  rowId,
  touchUniverse,
  upsertRow,
} from "./cache";
import { SCORING_TABLES } from "./data/core";
import { hasPending } from "./outbox";
import { readMeta, type SessionMeta } from "./session";
import { type Db, getSupabase } from "./supabase";
import { useSync } from "./sync-store";

type Row = Record<string, unknown>;

const HARD_DELETE_TABLES: readonly RealtimeTable[] = [
  "sp_routines",
  "sp_routine_logs",
  "sp_block_list_sites",
];

function applyFocusState(row: Row): void {
  if (hasPending("sp_focus_state")) return;
  const next = row as unknown as FocusState;
  const prev = queryClient.getQueryData<FocusCache>(keys.focus);
  if (!prev) {
    void queryClient.invalidateQueries({ queryKey: keys.focus });
    return;
  }
  if (Number(next.version) < Number(prev.state.version)) return;
  const phaseEnded =
    next.last_completed_at !== prev.state.last_completed_at || next.status === "idle";
  queryClient.setQueryData<FocusCache>(keys.focus, { ...prev, state: next });
  if (phaseEnded || Number(next.version) !== Number(prev.state.version)) {
    void queryClient.invalidateQueries({ queryKey: keys.table("sp_focus_sessions") });
    void queryClient.invalidateQueries({ queryKey: ["focus_stats"] });
    touchUniverse();
  }
}

function applyChange(table: RealtimeTable, payload: RealtimePostgresChangesPayload<Row>): void {
  if (table === "sp_focus_state") {
    if (payload.eventType !== "DELETE") applyFocusState(payload.new);
    return;
  }
  if (table === "sp_focus_settings") {
    if (payload.eventType === "DELETE" || hasPending("sp_focus_settings")) return;
    queryClient.setQueryData<FocusCache>(keys.focus, (prev) =>
      prev ? { ...prev, settings: payload.new as unknown as FocusSettings } : prev,
    );
    return;
  }

  const collection = table as CollectionTable;
  if (payload.eventType === "DELETE") {
    const old = payload.old as Row;
    const id =
      collection === "sp_routine_logs"
        ? `${String(old.routine_id)}:${String(old.date)}`
        : String(old.id ?? "");
    if (!id || id.startsWith("undefined")) return;
    removeRow(collection, id);
    if (collection === "sp_routines") {
      // Its logs were cascade-deleted with it.
      queryClient.setQueryData<Collections["sp_routine_logs"][]>(
        keys.table("sp_routine_logs"),
        (rows) => (rows ?? []).filter((l) => l.routine_id !== id),
      );
    }
  } else {
    const row = payload.new;
    // While a local edit to this row is still queued, the cache already shows the newer intent.
    if (hasPending(`${collection}:${rowId(collection, row)}`)) return;
    upsertRow(collection, row as unknown as Collections[typeof collection]);
  }
  if (SCORING_TABLES.has(table) || table === "sp_goal_lists" || table === "sp_routines")
    touchUniverse();
}

let channel: RealtimeChannel | null = null;
let hadConnection = false;

/**
 * One channel for everything: row changes for the ten published tables,
 * filtered to the owner, plus presence so the app can say how many devices
 * are in sync. After a reconnect every query is refreshed to catch up.
 */
export function startRealtime(deviceKind: "web" | "pwa" = "web"): () => void {
  const meta = readMeta();
  if (!meta || channel || starting) return () => {};
  let cancelled = false;
  let stop = () => {};
  starting = true;
  void getSupabase()
    .then((db) => {
      if (!cancelled) stop = subscribe(db, meta, deviceKind);
    })
    .catch(() => undefined)
    .finally(() => {
      starting = false;
    });
  return () => {
    cancelled = true;
    stop();
  };
}

let starting = false;

function subscribe(db: Db, meta: SessionMeta, deviceKind: "web" | "pwa"): () => void {
  if (channel) return () => {};
  const presenceKey = `${deviceKind}:${meta.deviceId ?? crypto.randomUUID()}:${Math.random().toString(36).slice(2, 8)}`;
  let ch = db.channel(`sp:${meta.userId}`, { config: { presence: { key: presenceKey } } });

  for (const table of REALTIME_TABLES) {
    ch = ch.on<Row>(
      "postgres_changes",
      { event: "*", schema: "public", table, filter: `user_id=eq.${meta.userId}` },
      (payload) => applyChange(table, payload),
    );
  }
  // Delete events cannot be filtered by column, so listen for them separately on tables that hard-delete.
  for (const table of HARD_DELETE_TABLES) {
    ch = ch.on<Row>("postgres_changes", { event: "DELETE", schema: "public", table }, (payload) =>
      applyChange(table, payload),
    );
  }

  const countDevices = () => {
    const state = ch.presenceState<{ device?: string }>();
    const devices = new Set<string>();
    for (const [key, metas] of Object.entries(state)) {
      for (const m of metas) devices.add(m.device ?? key);
    }
    useSync.setState({ devices: Math.max(1, devices.size) });
  };
  ch = ch.on("presence", { event: "sync" }, countDevices);

  useSync.setState({ realtime: "connecting" });
  let cancelled = false;
  // The join must carry the owner's access token (RLS decides what is streamed), so hand it
  // to the socket before subscribing; otherwise the channel would join with the anon key.
  void db.realtime
    .setAuth()
    .catch(() => {})
    .then(() => {
      if (cancelled) return;
      ch.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          useSync.setState({ realtime: "connected", online: true });
          void ch.track({
            device: `${deviceKind}:${meta.deviceId ?? presenceKey}`,
            kind: deviceKind,
            at: Date.now(),
          });
          if (hadConnection) void queryClient.invalidateQueries();
          hadConnection = true;
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          useSync.setState({ realtime: "disconnected", devices: 1 });
        }
      });
    });
  channel = ch;

  return () => {
    cancelled = true;
    void db.removeChannel(ch);
    if (channel === ch) channel = null;
    useSync.setState({ realtime: "idle", devices: 1 });
  };
}
