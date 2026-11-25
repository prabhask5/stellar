"use client";

import { Suspense, useEffect } from "react";
import { createPortal } from "react-dom";
import { useSettings } from "@/lib/client/data/hooks";
import { preloadable } from "@/lib/client/preloadable";
import { useUi } from "@/lib/client/ui-store";

const KEY = "sp-last-active";

function lastActive(): number {
  try {
    return Number(localStorage.getItem(KEY)) || Date.now();
  } catch {
    return Date.now();
  }
}

function touch(): void {
  try {
    localStorage.setItem(KEY, String(Date.now()));
  } catch {
    // ignored
  }
}

/**
 * "Lock after inactivity" (off / 5 min / 1 h / 1 day). When the limit passes,
 * the app is covered by the PIN screen until the PIN is entered again.
 */
// The PIN screen is fetched when a lock timeout is set, not with every page.
const { Component: LockScreen, preload: preloadLockScreen } = preloadable(() =>
  import("@/components/auth/lock-screen").then((m) => m.LockScreen),
);

export function InactivityLock() {
  const minutes = useSettings()?.lock_after_minutes ?? null;
  const locked = useUi((s) => s.locked);
  const setLocked = useUi((s) => s.setLocked);

  useEffect(() => {
    if (!minutes) return;
    // Have the PIN screen ready before it is needed (it must also open offline).
    void preloadLockScreen().catch(() => {});
    const limit = minutes * 60_000;
    const check = () => {
      if (!useUi.getState().locked && Date.now() - lastActive() > limit) setLocked(true);
    };
    let last = 0;
    const onActivity = () => {
      const now = Date.now();
      if (now - last < 5000 || useUi.getState().locked) return;
      last = now;
      touch();
    };
    check();
    if (!useUi.getState().locked) touch();
    const interval = setInterval(check, 15_000);
    const onVisible = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pointerdown", onActivity, { passive: true });
    window.addEventListener("keydown", onActivity);
    // Reading is activity too: scrolling a list must not let the lock fall mid-read.
    window.addEventListener("scroll", onActivity, { passive: true, capture: true });
    return () => {
      window.removeEventListener("scroll", onActivity, { capture: true });
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pointerdown", onActivity);
      window.removeEventListener("keydown", onActivity);
    };
  }, [minutes, setLocked]);

  // Everything under the lock is taken out of reach: no focus, no clicks, no keys, nothing
  // read out by a screen reader. Sheets and menus opened before the lock live in portals
  // beside the app, so every other child of <body> is made inert, not just the shell.
  useEffect(() => {
    if (!locked) return;
    useUi.getState().setCommandOpen(false);
    const overlay = document.querySelector<HTMLElement>("[data-inactivity-lock]");
    const others = [...document.body.children].filter(
      (el): el is HTMLElement => el instanceof HTMLElement && el !== overlay && !el.inert,
    );
    for (const el of others) el.inert = true;
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    return () => {
      for (const el of others) el.inert = false;
    };
  }, [locked]);

  if (!locked) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[100] overflow-y-auto overscroll-contain bg-void/90 backdrop-blur-2xl"
      data-testid="inactivity-lock"
      data-inactivity-lock=""
    >
      <Suspense fallback={null}>
        <LockScreen
          mode="unlock"
          onSuccess={() => {
            touch();
            setLocked(false);
          }}
        />
      </Suspense>
    </div>,
    document.body,
  );
}
