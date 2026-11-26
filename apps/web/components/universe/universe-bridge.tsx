"use client";

import { isBlockingActive } from "@stellar/shared";
import { setUniverseState } from "@stellar/universe/state";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useFocus, useSettings } from "@/lib/client/data/hooks";

/**
 * Tells the universe about the signed-in app: which page is showing, the quality setting,
 * and whether a focus phase is on. It renders nothing; the layer reads the state it writes.
 */
export function UniverseBridge() {
  const pathname = usePathname();
  const quality = useSettings()?.quality_tier;
  const focus = useFocus()?.state;
  const focusing = Boolean(focus && isBlockingActive(focus));

  useEffect(() => {
    setUniverseState({ active: true, pathname });
  }, [pathname]);

  useEffect(() => () => setUniverseState({ active: false }), []);

  useEffect(() => {
    if (!quality) return;
    setUniverseState({ setting: quality });
    // The lightest tier also drops the interface's blur, before the renderer has loaded.
    if (quality === "minimal") document.documentElement.dataset.tier = "low";
  }, [quality]);

  useEffect(() => {
    setUniverseState({ focusing });
  }, [focusing]);

  return null;
}
