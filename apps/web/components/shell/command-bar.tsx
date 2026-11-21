"use client";

import { lazy, Suspense, useEffect, useState } from "react";
import { whenIdle } from "@/lib/client/idle";
import { useUi } from "@/lib/client/ui-store";

const load = () => import("./command-bar-impl");
const CommandBarImpl = lazy(() => load().then((m) => ({ default: m.CommandBar })));

/** ⌘K / Ctrl+K. The palette itself loads when idle or on first use. */
export function CommandBar() {
  const open = useUi((s) => s.commandOpen);
  const setOpen = useUi((s) => s.setCommandOpen);
  const [used, setUsed] = useState(false);
  if (open && !used) setUsed(true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!useUi.getState().commandOpen);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);

  useEffect(() => whenIdle(() => void load()), []);

  if (!used) return null;
  return (
    <Suspense fallback={null}>
      <CommandBarImpl />
    </Suspense>
  );
}
