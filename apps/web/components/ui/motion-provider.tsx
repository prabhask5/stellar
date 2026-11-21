"use client";

import { LazyMotion } from "motion/react";
import type { ReactNode } from "react";

const features = () => import("@/lib/client/motion-features").then((m) => m.default);

/**
 * Components use the light `m.*` elements; the animation engine itself arrives
 * in a separate chunk after the page is interactive. Until then elements simply
 * render in their final state.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={features} strict>
      {children}
    </LazyMotion>
  );
}
