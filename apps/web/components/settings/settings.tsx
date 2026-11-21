"use client";

import { Page, PageHeader } from "@/components/ui/page";
import { SyncIndicator } from "@/components/ui/sync-indicator";
import { AboutSection } from "./about";
import { AppearanceSection } from "./appearance";
import { ConnectionSection } from "./connection";
import { DataSection } from "./data";
import { ExtensionSection } from "./extension";
import { GeneralSection } from "./general";
import { QuotesSection } from "./quotes";
import { SecuritySection } from "./security";

const SECTIONS = [
  ["general", "General"],
  ["appearance", "Appearance"],
  ["quotes", "Quotes"],
  ["notifications", "Notifications"],
  ["security", "Security"],
  ["extension", "Extension"],
  ["connection", "Connection"],
  ["data", "Data"],
  ["about", "About"],
] as const;

export function Settings({ notifications }: { notifications?: React.ReactNode }) {
  return (
    <Page>
      <PageHeader title="Settings" actions={<SyncIndicator />} />
      <nav
        aria-label="Settings sections"
        className="no-scrollbar -mx-1 mb-6 flex gap-2 overflow-x-auto px-1"
      >
        {SECTIONS.filter(([id]) => id !== "notifications" || notifications).map(([id, label]) => (
          <a
            key={id}
            href={`#${id}`}
            className="flex h-9 shrink-0 items-center rounded-chip border border-hairline bg-fill-subtle px-3 text-[14px] font-medium text-fg-2 hover:bg-fill-selected hover:text-fg"
          >
            {label}
          </a>
        ))}
      </nav>
      <div className="flex flex-col gap-9">
        <GeneralSection />
        <AppearanceSection />
        <QuotesSection />
        {notifications}
        <SecuritySection />
        <ExtensionSection />
        <ConnectionSection />
        <DataSection />
        <AboutSection />
      </div>
    </Page>
  );
}
