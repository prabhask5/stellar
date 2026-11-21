"use client";

import { emitCosmic } from "@stellar/universe/bus";
import { universeStore } from "@stellar/universe/store";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { useFocus, useSettings, useUniverse } from "@/lib/client/data/hooks";

/**
 * Feeds the universe from the signed-in app: the snapshot, the quality
 * setting, which page is showing, and whether a focus phase is running.
 * It renders nothing, and the canvas reads the store imperatively.
 */
export function UniverseBridge() {
  const pathname = usePathname();
  const snapshot = useUniverse();
  const settings = useSettings();
  const focus = useFocus();
  const lastEra = useRef<number | null>(null);

  useEffect(() => {
    universeStore.setState({ mode: pathname === "/" ? "home" : "page" });
  }, [pathname]);

  useEffect(
    () => () => {
      universeStore.setState({ mode: "off", hover: null });
    },
    [],
  );

  useEffect(() => {
    if (!snapshot) return;
    universeStore.setState({ snapshot });
    const era = snapshot.era.index;
    // A higher era than the one last seen on this device is a moment worth marking.
    if (lastEra.current !== null && era > lastEra.current)
      emitCosmic({ type: "new_era", index: era, name: snapshot.era.name });
    lastEra.current = era;
  }, [snapshot]);

  useEffect(() => {
    if (settings) universeStore.setState({ setting: settings.quality_tier });
  }, [settings?.quality_tier]); // eslint-disable-line react-hooks/exhaustive-deps

  const ambient = Boolean(
    focus && focus.state.phase === "focus" && focus.state.status === "running",
  );
  useEffect(() => {
    universeStore.setState({ focusAmbient: ambient });
  }, [ambient]);

  return null;
}
