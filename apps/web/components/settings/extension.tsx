"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { GroupedList } from "@/components/ui/grouped-list";
import { DownloadIcon } from "@/components/ui/icons";
import { Section } from "./parts";

const PACKAGES = [
  {
    id: "chrome",
    name: "Chrome, Edge, Brave, Arc",
    file: "/extension/stellar-planner-chrome.zip",
    steps: [
      "Unzip the download.",
      "Open chrome://extensions and turn on Developer mode.",
      "Choose “Load unpacked” and pick the unzipped folder.",
    ],
  },
  {
    id: "firefox",
    name: "Firefox",
    file: "/extension/stellar-planner-firefox.zip",
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
      description="The browser extension shows the same focus timer and blocks distracting sites while a focus phase runs. It stays in sync with every other device."
    >
      <GroupedList>
        {PACKAGES.map((p) => (
          <div key={p.id} className="p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-headline text-fg">{p.name}</p>
              {available[p.id] === false ? (
                <span className="text-footnote text-fg-2">Not included in this build</span>
              ) : (
                <a href={p.file} download className="contents">
                  <Button
                    variant="tinted"
                    size="sm"
                    icon={<DownloadIcon size={16} />}
                    tabIndex={-1}
                    disabled={available[p.id] === undefined}
                  >
                    Download
                  </Button>
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
