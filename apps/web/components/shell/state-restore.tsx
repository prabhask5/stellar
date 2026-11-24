"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const KEY = "sp-last-place";
/** A place left longer ago than this is not where the owner expects to land again. */
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

interface Place {
  url: string;
  scroll: number;
  at: number;
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function save(): void {
  try {
    const place: Place = {
      url: window.location.pathname + window.location.search,
      scroll: Math.round(window.scrollY),
      at: Date.now(),
    };
    localStorage.setItem(KEY, JSON.stringify(place));
  } catch {
    // storage unavailable: nothing to restore next time
  }
}

/**
 * iOS quietly ends a Home Screen app that has been in the background for a while; the
 * next tap on its icon is a cold start at the start URL. A native app would come back
 * where it was, so this does too: the place (route, segment, open list) and scroll
 * position are noted whenever the app goes to the background, and a cold start of the
 * installed app within a few hours returns to them. Unsent text is restored by the
 * fields themselves (quick add keeps its draft; an open task editor saves on the way out).
 *
 * In a browser tab the address bar is the truth: nothing is restored there.
 */
export function StateRestore() {
  const router = useRouter();

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") save();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", save);

    // Cold start of the installed app at its start URL.
    const nav = performance.getEntriesByType("navigation")[0] as
      PerformanceNavigationTiming | undefined;
    const coldStart =
      isStandalone() &&
      (nav?.type ?? "navigate") === "navigate" &&
      window.location.pathname === "/" &&
      window.location.search === "";
    if (coldStart) {
      try {
        const place = JSON.parse(localStorage.getItem(KEY) ?? "null") as Place | null;
        if (
          place &&
          place.url !== "/" &&
          place.url.startsWith("/") &&
          !place.url.startsWith("//") &&
          Date.now() - place.at < MAX_AGE_MS
        ) {
          router.replace(place.url, { scroll: false });
          let tries = 0;
          const restore = () => {
            if (window.location.pathname + window.location.search === place.url) {
              window.scrollTo(0, place.scroll);
              if (Math.abs(window.scrollY - place.scroll) <= 2 || tries > 40) return;
            }
            if (tries++ < 60) requestAnimationFrame(restore);
          };
          requestAnimationFrame(restore);
        }
      } catch {
        // an unreadable note is simply ignored
      }
    }
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", save);
    };
  }, [router]);

  return null;
}
