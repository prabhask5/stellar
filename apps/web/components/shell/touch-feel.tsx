"use client";

import { useEffect } from "react";

const PRESSABLE =
  'button, a[href], [role="button"], [role="radio"], [role="switch"], [role="checkbox"], [role="option"], [role="tab"], [role="menuitem"], [role="gridcell"], summary, [data-press]';
/** Movement that turns a touch into a scroll or a drag rather than a press. */
const SLOP = 10;

/**
 * Touch behaviour the browser does not give a web page by default:
 *
 * - Pressed feedback on pointerdown. `:active` on iOS waits to see whether the touch
 *   becomes a scroll; a native control darkens the moment it is touched. The pressed
 *   element gets `data-pressed` ("scale" for compact controls, "fill" for rows and
 *   cards) in the same frame, and loses it on release, on cancel, or as soon as the
 *   finger moves far enough to be scrolling.
 * - Dragging a list dismisses the keyboard, as it does in a native list.
 *
 * One passive listener set for the whole app; nothing is attached per element.
 */
export function TouchFeel() {
  useEffect(() => {
    let pressed: HTMLElement | null = null;
    let startX = 0;
    let startY = 0;

    const release = () => {
      if (pressed) pressed.removeAttribute("data-pressed");
      pressed = null;
    };
    const onDown = (e: PointerEvent) => {
      release();
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const el = (e.target as Element | null)?.closest<HTMLElement>(PRESSABLE);
      if (!el || el.matches(":disabled, [aria-disabled='true']") || el.closest("[inert]")) return;
      startX = e.clientX;
      startY = e.clientY;
      pressed = el;
      // Wide things (rows, cards, list items) light up; compact controls dip.
      const mode = el.dataset.press ?? (el.offsetWidth > 220 ? "fill" : "scale");
      el.setAttribute("data-pressed", mode);
    };
    const onMove = (e: PointerEvent) => {
      if (pressed && Math.hypot(e.clientX - startX, e.clientY - startY) > SLOP) release();
    };

    // A list dragged by a finger takes the keyboard down with it.
    let touchY: number | null = null;
    const onTouchStart = (e: TouchEvent) => {
      touchY = e.touches[0]?.clientY ?? null;
    };
    const onTouchMove = (e: TouchEvent) => {
      const y = e.touches[0]?.clientY;
      if (touchY === null || y === undefined || Math.abs(y - touchY) < 24) return;
      const active = document.activeElement as HTMLElement | null;
      if (!active || !/^(INPUT|TEXTAREA)$/.test(active.tagName)) return;
      const target = e.target as Node | null;
      // Scrolling inside the field itself (a long note) is not a reason to close the keyboard.
      if (target && active.contains(target)) return;
      active.blur();
      touchY = null;
    };

    const opts = { passive: true, capture: true } as const;
    // Loaded after first paint; until then controls fall back to their CSS :active state.
    document.documentElement.dataset.touchFeel = "on";
    window.addEventListener("pointerdown", onDown, opts);
    window.addEventListener("pointermove", onMove, opts);
    window.addEventListener("pointerup", release, opts);
    window.addEventListener("pointercancel", release, opts);
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", release);
    window.addEventListener("touchstart", onTouchStart, opts);
    window.addEventListener("touchmove", onTouchMove, opts);
    return () => {
      release();
      window.removeEventListener("pointerdown", onDown, opts);
      window.removeEventListener("pointermove", onMove, opts);
      window.removeEventListener("pointerup", release, opts);
      window.removeEventListener("pointercancel", release, opts);
      window.removeEventListener("blur", release);
      document.removeEventListener("visibilitychange", release);
      window.removeEventListener("touchstart", onTouchStart, opts);
      window.removeEventListener("touchmove", onTouchMove, opts);
    };
  }, []);
  return null;
}
