"use client";

import { Suspense, useState } from "react";
import { whenIdle } from "@/lib/client/idle";
import { preloadable } from "@/lib/client/preloadable";
import type { SheetProps } from "./sheet-impl";

export type { SheetProps };

const { Component: SheetImpl, preload } = preloadable<SheetProps>(() =>
  import("./sheet-impl").then((m) => m.Sheet),
);
// Fetched as soon as the browser is idle on any page that can open a sheet, so the first
// open is as immediate as every later one.
if (typeof window !== "undefined") whenIdle(() => void preload().catch(() => {}));

/**
 * Bottom sheet on phones, centred dialog on wide screens. The dialog machinery
 * is only needed once something opens, so it is fetched when the browser is
 * idle (or on first open, whichever comes first) instead of with the page.
 */
export function Sheet(props: SheetProps) {
  const [used, setUsed] = useState(props.open);
  if (props.open && !used) setUsed(true);
  if (!used) return null;
  return (
    <Suspense fallback={null}>
      <SheetImpl {...props} />
    </Suspense>
  );
}
