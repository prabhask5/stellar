"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useUi } from "@/lib/client/ui-store";
import { NAV } from "./nav";

function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return (
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "SELECT" ||
    el.isContentEditable
  );
}

/** Global keys: N new task, 1–5 pages. (Space on Focus and ⌘K live with their features.) */
export function Shortcuts() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented || typing(e.target)) return;
      // Leave keys alone while a dialog, sheet or the lock screen is open.
      if (document.querySelector('[role="dialog"]') || useUi.getState().locked) return;
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        if (pathname !== "/tasks") router.push("/tasks");
        // Give the page a moment to mount when navigating.
        setTimeout(() => useUi.getState().focusQuickAdd(), pathname === "/tasks" ? 0 : 120);
        return;
      }
      const index = Number(e.key) - 1;
      const item = Number.isInteger(index) ? NAV[index] : undefined;
      if (item && e.key.length === 1) {
        e.preventDefault();
        router.push(item.href);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, pathname]);

  return null;
}
