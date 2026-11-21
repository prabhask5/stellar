"use client";

import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/toaster";
import { CommandBar } from "./command-bar";
import { FocusTicker } from "./focus-ticker";
import { InactivityLock } from "./inactivity-lock";
import { SideNav, TabBar } from "./nav";
import { Providers } from "./providers";
import { Shortcuts } from "./shortcuts";

/** Everything around a signed-in page: data providers, navigation, toasts, ⌘K, shortcuts, lock. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <Providers>
      <SideNav />
      <div className="sp-app min-h-dvh">{children}</div>
      <TabBar />
      <Toaster />
      <CommandBar />
      <Shortcuts />
      <FocusTicker />
      <InactivityLock />
    </Providers>
  );
}
