"use client";

import { useCallback } from "react";
import { LockScreen } from "@/components/auth/lock-screen";

/** Where to go after signing in: only same-origin paths are honoured. */
function nextPath(): string {
  const next = new URLSearchParams(window.location.search).get("next");
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export function LockRoute() {
  const onSuccess = useCallback(() => {
    // A full navigation so the proxy sees the new session cookie.
    window.location.replace(nextPath());
  }, []);
  return <LockScreen mode="login" onSuccess={onSuccess} />;
}
