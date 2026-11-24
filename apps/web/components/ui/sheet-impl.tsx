"use client";

import {
  AnimatePresence,
  type MotionValue,
  useIsPresent,
  useMotionValue,
  useReducedMotion,
} from "motion/react";
import * as m from "motion/react-m";
import { Dialog } from "radix-ui";
import { type ReactNode, type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { preloadAnimate, withAnimate } from "@/lib/client/motion-animate";
import { cx } from "./cx";
import { IconButton } from "./button";
import { XIcon } from "./icons";
import { useIsWide } from "./use-media";

export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Hide the title visually (it is still announced). */
  hideTitle?: boolean;
  description?: string;
  children: ReactNode;
  /** Phone detent: "auto" hugs the content, "large" fills most of the screen. */
  detent?: "auto" | "large";
  /** Desktop dialog width. */
  width?: number;
  footer?: ReactNode;
  className?: string;
}

const SPRING = { type: "spring", stiffness: 300, damping: 32 } as const;

/** Far enough below the screen for any sheet, in pixels (a MotionValue animates numbers best). */
const offscreen = () => (typeof window === "undefined" ? 1000 : window.innerHeight);

interface GestureOptions {
  enabled: boolean;
  /** The sheet element. State, not a ref: the dialog mounts it a tick after `open` turns true. */
  sheet: HTMLDivElement | null;
  scrollerRef: RefObject<HTMLDivElement | null>;
  y: MotionValue<number>;
  /** Large sheets rest at two heights: full, and a medium detent part-way down. */
  twoDetents: boolean;
  onClose: () => void;
}

/**
 * The bottom sheet's touch gesture, the way a native sheet behaves:
 *  - it follows the finger from anywhere on the sheet, not just the grabber;
 *  - inside the scrolling content, a pull down only drags the sheet once the content is
 *    at its top (otherwise it scrolls), and a push up scrolls unless the sheet can rise;
 *  - past its top detent it rubber-bands;
 *  - on release it flings by velocity to the nearest detent, or away;
 *  - touching it mid-animation takes over from where it is.
 */
function useSheetGesture({ enabled, sheet, scrollerRef, y, twoDetents, onClose }: GestureOptions) {
  useEffect(() => {
    const el = sheet;
    if (!enabled || !el) return;
    let startX = 0;
    let startY = 0;
    let base = 0;
    let lastY = 0;
    let lastT = 0;
    let velocity = 0;
    let decided = false;
    let dragging = false;
    let blocked = false;
    let fromScroller = false;

    const height = () => el.offsetHeight;
    const medium = () => (twoDetents ? Math.round(height() * 0.42) : 0);
    const rest = (to: number, v = 0) => {
      el.style.setProperty("--sheet-rest", `${Math.max(0, Math.round(to))}px`);
      withAnimate((animate) => {
        void animate(y, to, { type: "spring", stiffness: 300, damping: 32, velocity: v });
      });
    };

    const begin = (px: number, py: number, time: number, target: Element | null) => {
      // Interruptible: whatever the sheet was doing, it is now under the finger.
      y.stop();
      base = y.get();
      startX = px;
      startY = lastY = py;
      lastT = time;
      velocity = 0;
      decided = false;
      dragging = false;
      // Things that own vertical or free movement keep it: sliders, wheels, drag handles.
      blocked = Boolean(
        target?.closest('[data-sheet-no-drag], input[type="range"], [role="slider"]') ||
        (target?.closest(".touch-none") && !target.closest("[data-sheet-grabber]")),
      );
      fromScroller = Boolean(target && scrollerRef.current?.contains(target));
    };

    /** Returns true when the sheet has taken the gesture (the caller should stop the page reacting). */
    const move = (px: number, py: number, time: number): boolean => {
      if (blocked) return false;
      const dx = px - startX;
      const dy = py - startY;
      if (!decided) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return false;
        decided = true;
        if (Math.abs(dx) > Math.abs(dy)) return false;
        const sc = scrollerRef.current;
        const inner = fromScroller && sc ? sc : null;
        const scrollable = Boolean(inner && inner.scrollHeight > inner.clientHeight + 1);
        if (dy > 0) dragging = !inner || inner.scrollTop <= 0;
        else dragging = base > 1 || !scrollable;
        // Start from here, so taking over does not jump by the distance already travelled.
        if (dragging) startY = py;
      }
      if (!dragging) return false;
      let next = base + (py - startY);
      // Rubber band above the top detent.
      if (next < 0) next = -Math.pow(-next, 0.72);
      y.set(next);
      const dt = time - lastT;
      if (dt > 0) velocity = 0.75 * (((py - lastY) / dt) * 1000) + 0.25 * velocity;
      lastY = py;
      lastT = time;
      return true;
    };

    const end = () => {
      if (!dragging) return;
      dragging = false;
      const h = height();
      const med = medium();
      const at = y.get();
      const projected = at + velocity * 0.18;
      const dismissAt = twoDetents ? med + (h - med) * 0.4 : h * 0.33;
      if (projected > dismissAt || (velocity > 1000 && at > (twoDetents ? med * 0.7 : 24))) {
        onClose();
        return;
      }
      rest(twoDetents && projected > med * 0.5 ? med : 0, velocity);
    };

    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (e.touches.length === 1 && t)
        begin(t.clientX, t.clientY, e.timeStamp, e.target as Element);
    };
    const onMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (e.touches.length !== 1 || !t) return;
      if (move(t.clientX, t.clientY, e.timeStamp) && e.cancelable) e.preventDefault();
    };
    const onEnd = () => end();

    // A mouse drags the sheet by its grabber (a narrow desktop window).
    let mouse = false;
    const onMouseDown = (e: PointerEvent) => {
      if (
        e.pointerType !== "mouse" ||
        !(e.target as Element | null)?.closest("[data-sheet-grabber]")
      )
        return;
      mouse = true;
      begin(e.clientX, e.clientY, e.timeStamp, e.target as Element);
    };
    const onMouseMove = (e: PointerEvent) => {
      if (mouse) move(e.clientX, e.clientY, e.timeStamp);
    };
    const onMouseUp = () => {
      if (!mouse) return;
      mouse = false;
      end();
    };

    el.style.setProperty("--sheet-rest", "0px");
    el.addEventListener("touchstart", onStart, { passive: true });
    // Not passive: once the sheet is being dragged, the page must not scroll with it.
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: true });
    el.addEventListener("touchcancel", onEnd, { passive: true });
    el.addEventListener("pointerdown", onMouseDown);
    window.addEventListener("pointermove", onMouseMove);
    window.addEventListener("pointerup", onMouseUp);
    return () => {
      el.removeEventListener("pointerdown", onMouseDown);
      window.removeEventListener("pointermove", onMouseMove);
      window.removeEventListener("pointerup", onMouseUp);
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [enabled, sheet, scrollerRef, y, twoDetents, onClose]);
}

/**
 * Bottom sheet on phones (drag down to dismiss, respects the home indicator
 * and the keyboard), centred dialog from 768px up. Focus is trapped and
 * restored by Radix Dialog.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  hideTitle,
  description,
  children,
  detent = "auto",
  width = 480,
  footer,
  className,
}: SheetProps) {
  const wide = useIsWide();
  const reduce = useReducedMotion();
  const y = useMotionValue(0);
  const [sheetEl, setSheetEl] = useState<HTMLDivElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  useEffect(preloadAnimate, []);
  useSheetGesture({
    enabled: open && !wide && !reduce,
    sheet: sheetEl,
    scrollerRef,
    y,
    twoDetents: detent === "large",
    onClose: close,
  });

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <m.div
                className="fixed inset-0 z-[60] bg-[rgba(4,3,14,0.62)]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              />
            </Dialog.Overlay>
            <Dialog.Content
              asChild
              forceMount
              aria-describedby={description ? undefined : undefined}
            >
              {wide ? (
                <m.div
                  className={cx(
                    "glass-strong fixed left-1/2 top-1/2 z-[61] flex max-h-[min(86dvh,760px)] w-[calc(100vw-48px)] flex-col rounded-hero outline-none",
                    className,
                  )}
                  style={{ maxWidth: width, x: "-50%", y: "-50%" }}
                  initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
                  transition={reduce ? { duration: 0.15 } : SPRING}
                >
                  <ExitGuard>
                    <Header
                      title={title}
                      hideTitle={hideTitle}
                      description={description}
                      onClose={() => onOpenChange(false)}
                    />
                    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-6">
                      {children}
                    </div>
                    {footer && <div className="border-t border-separator px-6 py-4">{footer}</div>}
                  </ExitGuard>
                </m.div>
              ) : (
                <m.div
                  className={cx(
                    "glass-strong fixed inset-x-0 bottom-0 z-[61] flex flex-col rounded-t-hero border-b-0 outline-none",
                    detent === "large" ? "h-[92dvh]" : "max-h-[92dvh]",
                    className,
                  )}
                  ref={setSheetEl}
                  style={{
                    y,
                    paddingLeft: "var(--sal)",
                    paddingRight: "var(--sar)",
                    paddingBottom: "var(--kb)",
                  }}
                  initial={reduce ? { opacity: 0 } : { y: offscreen() }}
                  animate={reduce ? { opacity: 1 } : { y: 0 }}
                  exit={reduce ? { opacity: 0 } : { y: offscreen() }}
                  transition={reduce ? { duration: 0.15 } : SPRING}
                >
                  <ExitGuard>
                    <div
                      className="flex h-6 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
                      data-sheet-grabber=""
                      aria-hidden="true"
                    >
                      <span className="h-[5px] w-9 rounded-full bg-white/25" />
                    </div>
                    <Header
                      title={title}
                      hideTitle={hideTitle}
                      description={description}
                      onClose={() => onOpenChange(false)}
                      compact
                    />
                    <div
                      ref={scrollerRef}
                      className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5"
                      style={{
                        // At the medium detent the sheet hangs below the screen by --sheet-rest;
                        // the same amount of padding keeps the end of the content reachable.
                        paddingBottom: footer
                          ? "calc(16px + var(--sheet-rest, 0px))"
                          : "calc(max(20px, var(--sab)) + var(--sheet-rest, 0px))",
                      }}
                    >
                      {children}
                    </div>
                    {footer && (
                      <div
                        className="border-t border-separator px-5 pt-3"
                        style={{ paddingBottom: "max(12px, var(--sab))" }}
                      >
                        {footer}
                      </div>
                    )}
                  </ExitGuard>
                </m.div>
              )}
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}

/**
 * A sheet stays mounted while it animates out. During that time it must not take
 * input: a second tap on "Create" a few frames after the first would submit twice.
 */
function ExitGuard({ children }: { children: ReactNode }) {
  const present = useIsPresent();
  return (
    <div
      className="contents"
      inert={!present}
      onClickCapture={
        present
          ? undefined
          : (e) => {
              e.preventDefault();
              e.stopPropagation();
            }
      }
    >
      {children}
    </div>
  );
}

function Header({
  title,
  hideTitle,
  description,
  onClose,
  compact,
}: {
  title: string;
  hideTitle?: boolean;
  description?: string;
  onClose: () => void;
  compact?: boolean;
}) {
  return (
    <div
      className={cx(
        "flex shrink-0 items-start justify-between gap-3",
        compact ? "px-5 pb-3" : "px-6 pb-4 pt-6",
      )}
    >
      <div className="min-w-0">
        <Dialog.Title className={cx("text-title3", hideTitle && "sr-only")}>{title}</Dialog.Title>
        {description ? (
          <Dialog.Description className="mt-1 text-subhead text-fg-2">
            {description}
          </Dialog.Description>
        ) : (
          <Dialog.Description className="sr-only">{title}</Dialog.Description>
        )}
      </div>
      <IconButton
        label="Close"
        variant="subtle"
        size={32}
        onClick={onClose}
        className="-mr-1 shrink-0 text-fg-2"
      >
        <XIcon size={16} strokeWidth={2.2} />
      </IconButton>
    </div>
  );
}
