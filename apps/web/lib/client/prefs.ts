"use client";

import { useCallback, useSyncExternalStore } from "react";

const listeners = new Set<() => void>();

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** A small device-local preference (view toggles and the like), kept in localStorage. */
export function useLocalPref<T extends string>(key: string, fallback: T): [T, (value: T) => void] {
  const value = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      window.addEventListener("storage", l);
      return () => {
        listeners.delete(l);
        window.removeEventListener("storage", l);
      };
    },
    () => (read(key) as T | null) ?? fallback,
    () => fallback,
  );
  const set = useCallback(
    (next: T) => {
      try {
        localStorage.setItem(key, next);
      } catch {
        // storage unavailable: the preference lasts for this render only
      }
      for (const l of listeners) l();
    },
    [key],
  );
  return [value, set];
}

/** "Show completed" is remembered per view. */
export function useShowCompleted(
  view: string,
  defaultOn = false,
): [boolean, (on: boolean) => void] {
  const [raw, setRaw] = useLocalPref<"1" | "0">(`sp-show-completed:${view}`, defaultOn ? "1" : "0");
  return [raw === "1", (on) => setRaw(on ? "1" : "0")];
}
