"use client";

import { useEffect } from "react";
import { LockScreen } from "@/components/auth/lock-screen";
import { useSettings } from "@/lib/client/data/hooks";
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
export function InactivityLock() {
  const minutes = useSettings()?.lock_after_minutes ?? null;
  const locked = useUi((s) => s.locked);
  const setLocked = useUi((s) => s.setLocked);

  useEffect(() => {
    if (!minutes) return;
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
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pointerdown", onActivity);
      window.removeEventListener("keydown", onActivity);
    };
  }, [minutes, setLocked]);

  if (!locked) return null;
  return (
    <div
      className="fixed inset-0 z-[100] overflow-y-auto bg-void/90 backdrop-blur-2xl"
      data-testid="inactivity-lock"
    >
      <LockScreen
        mode="unlock"
        onSuccess={() => {
          touch();
          setLocked(false);
        }}
      />
    </div>
  );
}
