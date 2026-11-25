"use client";

import { type ComponentType, useEffect, useState } from "react";
import { whenIdle } from "@/lib/client/idle";

/**
 * Parts of the shell that nothing on screen waits for (the offline pill, the pressed-state
 * listener) are fetched once the browser is idle, so they cost the first paint nothing.
 */
export function Deferred({ load }: { load: () => Promise<ComponentType> }) {
  const [Component, setComponent] = useState<ComponentType | null>(null);
  useEffect(
    () =>
      whenIdle(() => {
        void load()
          .then((c) => setComponent(() => c))
          .catch(() => {});
      }, 1500),
    [load],
  );
  return Component ? <Component /> : null;
}
