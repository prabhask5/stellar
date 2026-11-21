"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

/** Subscribes to a media query. False during SSR and the first client render. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** ≥768px: sheets become centred dialogs, the tab bar becomes a rail. */
export const useIsWide = () => useMediaQuery("(min-width: 768px)");
/** ≥1024px: sidebar and multi-column layouts. */
export const useIsDesktop = () => useMediaQuery("(min-width: 1024px)");
export const useIsTouch = () => useMediaQuery("(pointer: coarse)");
export const useReducedMotionPref = () => useMediaQuery("(prefers-reduced-motion: reduce)");

export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

/**
 * Keeps `--kb` (on-screen keyboard height) current from visualViewport so
 * sheets and the quick-add bar stay above the iOS keyboard without layout jumps.
 */
export function useKeyboardInset(): void {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const hidden = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
        // Small differences are browser chrome, not a keyboard.
        document.documentElement.style.setProperty(
          "--kb",
          hidden > 120 ? `${Math.round(hidden)}px` : "0px",
        );
        document.documentElement.toggleAttribute("data-keyboard", hidden > 120);
      });
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      cancelAnimationFrame(frame);
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
}
