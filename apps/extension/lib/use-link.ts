import { useEffect, useState } from "react";
import { browser } from "wxt/browser";
import { getConnection, getSnapshot, getStatus, onStorageChange } from "./storage.ts";
import type { Connection, LinkStatus, Message, Snapshot } from "./types.ts";

export interface Link {
  loaded: boolean;
  connection: Connection | null;
  snapshot: Snapshot | null;
  status: LinkStatus;
}

/** The cached connection, timer state and link status, kept current from extension storage. */
export function useLink(): Link {
  const [link, setLink] = useState<Link>({
    loaded: false,
    connection: null,
    snapshot: null,
    status: "disconnected",
  });
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const [connection, snapshot, status] = await Promise.all([
        getConnection(),
        getSnapshot(),
        getStatus(),
      ]);
      if (alive) setLink({ loaded: true, connection, snapshot, status });
    };
    void load();
    const off = onStorageChange(() => void load());
    return () => {
      alive = false;
      off();
    };
  }, []);
  return link;
}

/** Re-renders on an interval for live countdowns. */
export function useNow(intervalMs = 250): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function send<T = { ok: boolean; error?: string | null }>(message: Message): Promise<T> {
  return browser.runtime.sendMessage(message) as Promise<T>;
}
