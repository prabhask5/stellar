"use client";

import { useEffect, useState } from "react";
import { cx } from "@/components/ui/cx";
import { GroupedList } from "@/components/ui/grouped-list";
import { DownloadIcon } from "@/components/ui/icons";
import { Section } from "./parts";

const PACKAGES = [
  {
    id: "chrome",
    name: "Chrome, Edge, Brave, Arc",
    file: "/extension/stellar-focus-chrome.zip",
    steps: [
      "Unzip the download.",
      "Open chrome://extensions and turn on Developer mode.",
      "Choose “Load unpacked” and pick the unzipped folder.",
    ],
  },
  {
    id: "firefox",
    name: "Firefox",
    file: "/extension/stellar-focus-firefox.zip",
    steps: [
      "Open about:debugging and choose “This Firefox”.",
      "Choose “Load Temporary Add-on” and pick the zip.",
      "For a permanent install, sign it as an unlisted add-on (see docs/EXTENSION.md).",
    ],
  },
] as const;

/** Download links for the browser extension packages served by this app, with install steps. */
export function ExtensionSection() {
  const [available, setAvailable] = useState<Record<string, boolean>>({});
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
    let cancelled = false;
    void Promise.all(
      PACKAGES.map(async (p) => {
        try {
          const res = await fetch(p.file, { method: "HEAD", cache: "no-store" });
          return [p.id, res.ok] as const;
        } catch {
          return [p.id, false] as const;
        }
      }),
    ).then((entries) => {
      if (!cancelled) setAvailable(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Section
      id="extension"
      title="Extension"
      description="Stellar Focus, the browser extension, shows the same focus timer and blocks distracting sites while a focus phase runs. It stays in sync with every other device."
    >
      <GroupedList>
        {PACKAGES.map((p) => (
          <div key={p.id} className="p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-headline text-fg">{p.name}</p>
              {available[p.id] === false ? (
                <span className="text-footnote text-fg-2">Not included in this build</span>
              ) : (
                <a
                  href={available[p.id] ? p.file : undefined}
                  download
                  aria-disabled={available[p.id] === undefined || undefined}
                  className={cx(
                    "inline-flex h-9 min-h-9 shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-chip border border-accent-line bg-accent-soft px-3 text-[14px] font-medium text-accent",
                    "transition-[transform,background-color,opacity] duration-100 ease-out hover:bg-[rgba(246,199,110,0.2)] active:scale-[0.97]",
                    available[p.id] === undefined && "pointer-events-none opacity-45",
                  )}
                >
                  <DownloadIcon size={16} />
                  Download
                </a>
              )}
            </div>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-footnote text-fg-2">
              {p.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </div>
        ))}
      </GroupedList>
      <p className="px-1 text-footnote text-fg-2">
        After installing, open the extension, enter this address and your PIN:{" "}
        <span className="select-all break-all text-fg">{origin}</span>
      </p>
    </Section>
  );
}
