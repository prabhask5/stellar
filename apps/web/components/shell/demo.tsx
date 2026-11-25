"use client";

import { useEffect, useState } from "react";
import { exitDemo, isDemo } from "@/lib/client/demo";

/**
 * Whether this is demo mode, or `null` until it is known: on the server and on the first
 * client frame the answer is not available, so the markup matches. Anything that must not
 * run in the demo (a request to the server) waits for `false` rather than "not true".
 */
export function useDemoState(): boolean | null {
  const [demo, setDemo] = useState<boolean | null>(null);
  useEffect(() => setDemo(isDemo()), []);
  return demo;
}

/** True in demo mode. False on the server and on the first client frame, so markup matches. */
export function useDemo(): boolean {
  return useDemoState() === true;
}

/** Always-visible reminder that this is sample data, with the way out. */
export function DemoBanner() {
  if (!useDemo()) return null;
  return (
    <div
      role="status"
      data-testid="demo-banner"
      className="pointer-events-none fixed inset-x-0 z-[45] flex justify-center px-4"
      style={{ top: "max(8px, var(--sat))" }}
    >
      <div className="pointer-events-auto flex min-h-9 items-center gap-3 rounded-full border border-accent-line bg-[rgb(22,18,50)] py-1 pl-4 pr-1.5 text-footnote text-fg shadow-[0_8px_24px_rgba(0,0,0,0.4)]">
        <span>
          <span className="font-semibold text-accent">Demo</span> · sample data, nothing is saved
        </span>
        <button
          type="button"
          onClick={exitDemo}
          className="flex h-7 items-center rounded-full bg-fill-selected px-3 font-medium hover:bg-fill-thumb"
        >
          Exit
        </button>
      </div>
    </div>
  );
}
