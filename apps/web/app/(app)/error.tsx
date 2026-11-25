"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/** A page failed to render. The shell, the sky and the data are untouched; offer a way back. */
export default function AppError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error("[app] page failed to render", error);
  }, [error]);
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-safe pb-clearance pt-safe text-center">
      <h1 className="text-title2">This page hit a problem</h1>
      <p className="max-w-[320px] text-subhead text-fg-2">
        Your data is safe. Try again, and if it keeps happening, reload the app.
      </p>
      <div className="mt-3 flex gap-3">
        <Button variant="primary" onClick={reset}>
          Try again
        </Button>
        <Button onClick={() => window.location.reload()}>Reload</Button>
      </div>
    </main>
  );
}
