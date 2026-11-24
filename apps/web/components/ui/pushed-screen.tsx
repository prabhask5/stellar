"use client";

import { useMotionValue, useTransform } from "motion/react";
import * as m from "motion/react-m";
import {
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { preloadAnimate, withAnimate } from "@/lib/client/motion-animate";

/** Width of the strip along the left edge where a back swipe can begin. */
const EDGE = 20;
/** Fraction of the screen the page must be dragged to go back on release. */
const COMMIT = 0.35;

/**
 * A pushed screen (a list's detail) with the iOS edge-swipe back gesture: a drag that
 * starts at the left edge moves the screen with the finger while the screen underneath
 * parallaxes in; letting go past a third of the width, or with a flick, goes back,
 * otherwise it springs home. The drag can be picked up again mid-animation.
 *
 * The gesture lives on an invisible strip over the page margin with `touch-action: none`,
 * so the browser hands us the whole drag and vertical scrolling everywhere else is
 * untouched. It only exists for touch input.
 */
export function PushedScreen({
  children,
  underlay,
  onBack,
}: {
  children: ReactNode;
  /** What is underneath this screen; shown, parallaxed, while the page is being dragged. */
  underlay?: ReactNode;
  onBack: () => void;
}) {
  const x = useMotionValue(0);
  const [dragging, setDragging] = useState(false);
  const width = () => (typeof window === "undefined" ? 400 : window.innerWidth);
  const underX = useTransform(x, (v) => -0.28 * width() * (1 - Math.min(1, v / width())));
  const underOpacity = useTransform(x, (v) => 0.35 + 0.65 * Math.min(1, v / width()));
  const g = useRef({
    id: -1,
    startX: 0,
    startY: 0,
    base: 0,
    lastX: 0,
    lastT: 0,
    v: 0,
    active: false,
  });
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(preloadAnimate, []);

  const settle = (to: number, velocity: number, done?: () => void) => {
    withAnimate((animate) => {
      void animate(x, to, { type: "spring", stiffness: 320, damping: 34, velocity }).then(() => {
        if (to === 0) setDragging(false);
        done?.();
      });
    });
  };

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse") return;
    x.stop();
    g.current = {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      base: x.get(),
      lastX: e.clientX,
      lastT: e.timeStamp,
      v: 0,
      active: x.get() > 0,
    };
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      // The pointer is already gone (a very short touch): there is nothing to capture.
    }
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = g.current;
    if (e.pointerId !== s.id) return;
    const dx = e.clientX - s.startX;
    const dy = e.clientY - s.startY;
    if (!s.active) {
      if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy)) return;
      s.active = true;
      s.startX = e.clientX;
      setDragging(true);
    }
    x.set(Math.max(0, s.base + (e.clientX - s.startX)));
    const dt = e.timeStamp - s.lastT;
    if (dt > 0) s.v = 0.75 * (((e.clientX - s.lastX) / dt) * 1000) + 0.25 * s.v;
    s.lastX = e.clientX;
    s.lastT = e.timeStamp;
  };
  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = g.current;
    if (e.pointerId !== s.id) return;
    s.id = -1;
    if (!s.active) return;
    s.active = false;
    const w = width();
    if (x.get() > w * COMMIT || s.v > 600) {
      settle(w, s.v, () => {
        onBackRef.current();
        // If the navigation does not unmount this screen, do not leave it off to the side.
        setTimeout(() => {
          x.set(0);
          setDragging(false);
        }, 250);
      });
    } else {
      settle(0, s.v);
    }
  };

  return (
    <div className="relative" data-pushed-screen data-dragging={dragging || undefined}>
      {dragging && underlay && (
        <m.div
          aria-hidden="true"
          inert
          className="pointer-events-none absolute inset-0 overflow-hidden"
          style={{ x: underX, opacity: underOpacity }}
        >
          {underlay}
        </m.div>
      )}
      <m.div style={{ x }} className={dragging ? "sp-pushed sp-pushed--dragging" : "sp-pushed"}>
        {children}
      </m.div>
      <div
        data-testid="edge-swipe"
        aria-hidden="true"
        className="touch:block fixed inset-y-0 left-0 z-30 hidden touch-none"
        style={{ width: `calc(${EDGE}px + var(--sal))` }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      />
    </div>
  );
}
