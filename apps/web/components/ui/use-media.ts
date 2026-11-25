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
/**
 * Room for a popover beside its trigger: a wide and reasonably tall viewport. A phone held
 * sideways is wide but only ~390px high, where a calendar or emoji grid cannot fit next to
 * anything; pickers open in a sheet there, as they do on a phone held upright.
 */
export const usePopoverFits = () => useMediaQuery("(min-width: 768px) and (min-height: 600px)");
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
 * An installed app on iOS can start with a viewport shorter than the screen by the height
 * of the status bar (the translucent status bar is applied after the first layout, with no
 * resize event). Everything anchored to the bottom then floats too high, and it stays that
 * way on a page that fits the short viewport exactly, such as Home; a page taller than the
 * viewport makes WebKit measure again, which is why visiting another tab cured it.
 *
 * So while the window is shorter than the screen, the document is made a little taller
 * than the screen (`html.sp-short-viewport`), and that is undone once the window is right.
 */
export function useSettledViewport(): void {
  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (!standalone || !/iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent)) return;
    const root = document.documentElement;
    const check = () => {
      // `screen` keeps its portrait numbers on iOS whichever way the device is held.
      const landscape = window.matchMedia("(orientation: landscape)").matches;
      const { width, height } = window.screen;
      const full = landscape ? Math.min(width, height) : Math.max(width, height);
      const short = window.innerHeight < full - 1;
      if (short) root.style.setProperty("--screen-h", `${full}px`);
      root.classList.toggle("sp-short-viewport", short);
    };
    check();
    const timers = [50, 150, 400, 1000, 2500].map((ms) => window.setTimeout(check, ms));
    const events = ["resize", "pageshow", "orientationchange"] as const;
    events.forEach((e) => window.addEventListener(e, check));
    document.addEventListener("visibilitychange", check);
    return () => {
      timers.forEach(clearTimeout);
      events.forEach((e) => window.removeEventListener(e, check));
      document.removeEventListener("visibilitychange", check);
    };
  }, []);
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
