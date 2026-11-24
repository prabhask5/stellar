"use client";

import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/toaster";
import { UniverseBridge } from "@/components/universe/universe-bridge";
import { CommandBar } from "./command-bar";
import { DataStatus } from "./data-status";
import { FocusTicker } from "./focus-ticker";
import { InactivityLock } from "./inactivity-lock";
import { SideNav, TabBar } from "./nav";
import { Providers } from "./providers";
import { Shortcuts } from "./shortcuts";
import { StateRestore } from "./state-restore";
import { ZoneGate } from "./zone-gate";

/** Everything around a signed-in page: data providers, navigation, toasts, ⌘K, shortcuts, lock. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <Providers>
      <SideNav />
      <div className="sp-app min-h-dvh">
        <ZoneGate>{children}</ZoneGate>
      </div>
      <TabBar />
      <DataStatus />
      <Toaster />
      <CommandBar />
      <Shortcuts />
      <FocusTicker />
      <InactivityLock />
      <UniverseBridge />
      <StateRestore />
    </Providers>
  );
}
