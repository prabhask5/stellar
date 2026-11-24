import type { PersistedClient, Persister } from "@tanstack/react-query-persist-client";
import { createStore, del, get, set } from "idb-keyval";

const KEY = "client";

/**
 * Persists the TanStack Query cache to IndexedDB so the app opens instantly
 * with the last known data, online or not. Writes are throttled.
 */
export function createIdbPersister(throttleMs = 1000): Persister {
  const store = typeof indexedDB === "undefined" ? null : createStore("stellar-cache", "query");
  let timer: ReturnType<typeof setTimeout> | null = null;
  let latest: PersistedClient | null = null;

  const write = () => {
    timer = null;
    if (!store || !latest) return;
    set(KEY, latest, store).catch(() => {
      // Quota or private mode: the cache simply is not persisted.
    });
  };

  // The app may be ended while in the background: write what is pending on the way out,
  // instead of losing the last second of changes to the throttle.
  if (typeof document !== "undefined") {
    const flush = () => {
      if (document.visibilityState !== "hidden" || !timer) return;
      clearTimeout(timer);
      write();
    };
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", flush);
  }

  return {
    persistClient: (client) => {
      latest = client;
      if (!timer) timer = setTimeout(write, throttleMs);
    },
    restoreClient: async () => {
      if (!store) return undefined;
      try {
        return await get<PersistedClient>(KEY, store);
      } catch {
        return undefined;
      }
    },
    removeClient: async () => {
      latest = null;
      if (timer) clearTimeout(timer);
      timer = null;
      if (store) await del(KEY, store).catch(() => {});
    },
  };
}

function deleteDatabases(names: string[]): Promise<void[]> {
  return Promise.all(
    names.map(
      (name) =>
        new Promise<void>((resolve) => {
          const req = indexedDB.deleteDatabase(name);
          req.onsuccess = req.onerror = req.onblocked = () => resolve();
        }),
    ),
  );
}

/** Removes the cached copy of the data but keeps changes that are still waiting to be sent. */
export async function clearCachedData(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  await deleteDatabases(["stellar-cache"]);
}

/** Removes everything this app stored locally. Used when signing out. */
export async function clearLocalData(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  await Promise.all(
    ["stellar-cache", "stellar-outbox"].map(
      (name) =>
        new Promise<void>((resolve) => {
          const req = indexedDB.deleteDatabase(name);
          req.onsuccess = req.onerror = req.onblocked = () => resolve();
        }),
    ),
  );
}
