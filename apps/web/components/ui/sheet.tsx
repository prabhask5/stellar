"use client";

import { lazy, Suspense, useEffect, useState } from "react";
import { whenIdle } from "@/lib/client/idle";
import type { SheetProps } from "./sheet-impl";

export type { SheetProps };

const load = () => import("./sheet-impl");
const SheetImpl = lazy(() => load().then((m) => ({ default: m.Sheet })));

/**
 * Bottom sheet on phones, centred dialog on wide screens. The dialog machinery
 * is only needed once something opens, so it is fetched when the browser is
 * idle (or on first open, whichever comes first) instead of with the page.
 */
export function Sheet(props: SheetProps) {
  const [used, setUsed] = useState(props.open);
  if (props.open && !used) setUsed(true);
  useEffect(() => whenIdle(() => void load()), []);
  if (!used) return null;
  return (
    <Suspense fallback={null}>
      <SheetImpl {...props} />
    </Suspense>
  );
}
