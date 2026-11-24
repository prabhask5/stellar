"use client";

import { useDemo } from "@/components/shell/demo";
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

/** Sections that only make sense with a server and an owner; the demo has neither. */
const LIVE_ONLY = new Set([
  "notifications",
  "security",
  "extension",
  "connection",
  "data",
  "about",
]);

export function Settings({ notifications }: { notifications?: React.ReactNode }) {
  const demo = useDemo();
  return (
    <Page>
      <PageHeader title="Settings" actions={<SyncIndicator />} />
      <nav
        aria-label="Settings sections"
        className="no-scrollbar -mx-1 -mt-1 mb-5 flex gap-2 overflow-x-auto overflow-y-hidden px-1 py-1"
      >
        {SECTIONS.filter(
          ([id]) => (id !== "notifications" || notifications) && !(demo && LIVE_ONLY.has(id)),
        ).map(([id, label]) => (
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
        {!demo && (
          <>
            {notifications}
            <SecuritySection />
            <ExtensionSection />
            <ConnectionSection />
            <DataSection />
            <AboutSection />
          </>
        )}
        {demo && (
          <p className="text-footnote text-fg-2">
            Notifications, security, the browser extension, the connection and data export belong to
            a real instance and are not part of the demo.
          </p>
        )}
      </div>
    </Page>
  );
}
