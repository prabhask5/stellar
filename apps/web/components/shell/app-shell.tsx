"use client";

import type { ReactNode } from "react";
import { UniverseBridge } from "@/components/universe/universe-bridge";
import { CommandBar } from "./command-bar";
import { Deferred } from "./deferred";
import { InactivityLock } from "./inactivity-lock";
import { SideNav, TabBar } from "./nav";
import { Providers } from "./providers";
import { ZoneGate } from "./zone-gate";

// Not needed to paint or to take the first tap: fetched when the browser is idle.
const loadDataStatus = () => import("./data-status").then((m) => m.DataStatus);
// Toasts follow something the owner did, never the first paint.
const loadToaster = () => import("@/components/ui/toaster").then((m) => m.Toaster);
const loadShortcuts = () => import("./shortcuts").then((m) => m.Shortcuts);
// Keeps the timer honest on every page; it pulls in the timer state machine, which only
// the Focus page needs at first paint.
const loadFocusTicker = () => import("./focus-ticker").then((m) => m.FocusTicker);

/** Everything around a signed-in page: data providers, navigation, toasts, ⌘K, shortcuts, lock. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <Providers>
      <SideNav />
      <div className="sp-app min-h-dvh">
        <ZoneGate>{children}</ZoneGate>
      </div>
      <TabBar />
      <Deferred load={loadDataStatus} />
      <Deferred load={loadToaster} />
      <CommandBar />
      <Deferred load={loadShortcuts} />
      <Deferred load={loadFocusTicker} />
      <InactivityLock />
      <UniverseBridge />
    </Providers>
  );
}
