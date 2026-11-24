"use client";

import { universeStore } from "@stellar/universe/store";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
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
    if (snapshot) universeStore.setState({ snapshot });
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
