"use client";

import { useEffect, useState } from "react";
import { IconButton } from "@/components/ui/button";
import { XIcon } from "@/components/ui/icons";
import { isStandalone } from "@/lib/client/device";
import { useLocalPref } from "@/lib/client/prefs";

function isIosSafari(): boolean {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  return ios && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

/**
 * "Add to Home Screen" hint for iPhone and iPad in Safari. Never shown inside
 * the installed app, and gone for good once dismissed.
 */
export function InstallHint() {
  const [dismissed, setDismissed] = useLocalPref<"1" | "0">("sp-install-hint", "0");
  const [eligible, setEligible] = useState(false);
  useEffect(() => {
    setEligible(isIosSafari() && !isStandalone());
  }, []);
  if (!eligible || dismissed === "1") return null;
  return (
    <aside
      className="glass relative mb-3 flex w-full max-w-[460px] items-center gap-3 rounded-list py-2 pl-4 pr-1.5"
      aria-label="Install"
      data-testid="install-hint"
    >
      <p className="min-w-0 flex-1 text-footnote text-fg-2">
        <span className="font-medium text-fg">Install Stellar Planner.</span> Tap Share, then Add to
        Home Screen, for a full-screen app that works offline and can notify you.
      </p>
      <IconButton label="Dismiss" variant="plain" size={36} onClick={() => setDismissed("1")}>
        <XIcon size={16} />
      </IconButton>
    </aside>
  );
}
