"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useSync } from "@/lib/client/sync-store";

/**
 * App-wide status line for the two things every screen can suffer from:
 *  - offline: a quiet pill saying changes are kept on this device (and how many wait);
 *  - a first load that failed: what happened, and a Retry. With cached data on screen a
 *    failed refresh stays silent; the data shown is simply a little older.
 */
export function DataStatus() {
  const client = useQueryClient();
  const online = useSync((s) => s.online);
  const pending = useSync((s) => s.pending);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const cache = client.getQueryCache();
    const check = () =>
      setFailed(
        cache.getAll().some((q) => q.state.status === "error" && q.state.data === undefined),
      );
    check();
    return cache.subscribe(check);
  }, [client]);

  if (online && !failed) return null;
  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[35] flex justify-center px-safe"
      style={{ top: "calc(max(8px, var(--sat)) + 6px)" }}
    >
      <div
        role="status"
        data-testid="data-status"
        className="glass-strong pointer-events-auto flex min-h-9 items-center gap-3 rounded-full py-1 pl-4 pr-1.5 text-footnote text-fg shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
      >
        {!online ? (
          <span className="py-1.5 pr-2.5">
            <span
              className="mr-2 inline-block size-2 rounded-full bg-warning align-middle"
              aria-hidden="true"
            />
            {pending > 0
              ? `Offline. ${pending} ${pending === 1 ? "change is" : "changes are"} saved on this device.`
              : "Offline. Changes are saved on this device."}
          </span>
        ) : (
          <>
            <span className="py-1.5">Couldn't load your data.</span>
            <Button
              size="sm"
              variant="tinted"
              onClick={() => void client.refetchQueries({ type: "all" })}
            >
              Retry
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
