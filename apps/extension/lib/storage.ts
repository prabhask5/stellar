import { browser } from "wxt/browser";
import type { Connection, LinkStatus, Snapshot } from "./types.ts";

export const KEYS = {
  connection: "sp.connection",
  snapshot: "sp.snapshot",
  status: "sp.status",
  rules: "sp.rules",
  auth: "sp.auth",
} as const;

async function read<T>(key: string): Promise<T | null> {
  const got = await browser.storage.local.get(key);
  return (got[key] as T | undefined) ?? null;
}

export const getConnection = () => read<Connection>(KEYS.connection);
export const getSnapshot = () => read<Snapshot>(KEYS.snapshot);
export const getStatus = async (): Promise<LinkStatus> =>
  (await read<LinkStatus>(KEYS.status)) ?? "disconnected";
export const getRulesKey = () => read<string>(KEYS.rules);

export const setConnection = (connection: Connection) =>
  browser.storage.local.set({ [KEYS.connection]: connection });
export const setSnapshot = (snapshot: Snapshot) =>
  browser.storage.local.set({ [KEYS.snapshot]: snapshot });
export const setStatus = (status: LinkStatus) =>
  browser.storage.local.set({ [KEYS.status]: status });
export const setRulesKey = (key: string) => browser.storage.local.set({ [KEYS.rules]: key });

/** Forgets the instance, the session and the cached state. */
export async function clearAll(): Promise<void> {
  await browser.storage.local.clear();
}

/** supabase-js session storage backed by extension storage, so the session survives worker restarts. */
export const supabaseStorage = {
  getItem: async (key: string): Promise<string | null> => (await read<string>(key)) ?? null,
  setItem: async (key: string, value: string): Promise<void> => {
    await browser.storage.local.set({ [key]: value });
  },
  removeItem: async (key: string): Promise<void> => {
    await browser.storage.local.remove(key);
  },
};

export type StorageListener = (changes: {
  connection?: boolean;
  snapshot?: boolean;
  status?: boolean;
}) => void;

/** Notifies when the cached connection, state or status changes (popup and block page re-render from this). */
export function onStorageChange(listener: StorageListener): () => void {
  const handler = (changes: Record<string, unknown>, area: string) => {
    if (area !== "local") return;
    listener({
      connection: KEYS.connection in changes,
      snapshot: KEYS.snapshot in changes,
      status: KEYS.status in changes,
    });
  };
  browser.storage.onChanged.addListener(handler);
  return () => browser.storage.onChanged.removeListener(handler);
}
