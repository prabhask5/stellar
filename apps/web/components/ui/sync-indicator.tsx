"use client";

import { syncLabel, useSync } from "@/lib/client/sync-store";
import { cx } from "./cx";

/** Dot + "N devices in sync" / "Offline, changes saved" / "Syncing…". */
export function SyncIndicator({ className, bare }: { className?: string; bare?: boolean }) {
  const state = useSync();
  const { tone, text } = syncLabel(state);
  return (
    <span
      role="status"
      aria-live="polite"
      data-tone={tone}
      className={cx(
        "inline-flex h-8 items-center gap-2 whitespace-nowrap text-[13px] font-medium text-fg-2",
        !bare && "glass rounded-full px-3",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cx(
          "size-2 rounded-full",
          tone === "live" && "bg-success shadow-[0_0_8px_rgba(124,242,176,0.7)]",
          tone === "offline" && "bg-warning",
          tone === "busy" && "animate-pulse bg-fg-2",
        )}
      />
      {text}
    </span>
  );
}
