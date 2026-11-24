"use client";

import { type ReactNode, useEffect, useState } from "react";
import { whenZoneKnown, zoneKnown } from "@/lib/client/data/core";

/**
 * "Today" is the owner's day, which needs their time zone. On the very first launch on a
 * device that zone is not known for the first few hundred milliseconds, and anything
 * dated "today" in that window (a task, a routine tick, a new routine's start) could
 * land on the device's day instead.
 *
 * Until the settings arrive, the page is shown but cannot be acted on (inert). It is not
 * hidden: on a slow first load that would leave the screen empty for seconds. Every later
 * launch remembers the zone and never waits here.
 */
export function ZoneGate({ children }: { children: ReactNode }) {
  // The first render matches the server's; the gate is decided after mount.
  const [waiting, setWaiting] = useState(false);
  useEffect(() => {
    if (zoneKnown()) return;
    setWaiting(true);
    let cancelled = false;
    void whenZoneKnown().then(() => !cancelled && setWaiting(false));
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <div className="contents" inert={waiting} data-zone={waiting ? "pending" : undefined}>
      {children}
    </div>
  );
}
