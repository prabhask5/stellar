import { NextResponse } from "next/server";
import { getConfig } from "@/lib/server/config";
import { schedulerRunning } from "@/lib/server/scheduler";
import { APP_VERSION } from "@/lib/server/version";

export const dynamic = "force-dynamic";

function readState(): { configured: boolean; stage: string } {
  try {
    const c = getConfig();
    return { configured: c.configured, stage: c.stage };
  } catch {
    return { configured: false, stage: "error" };
  }
}

/** Liveness for Docker/Dokploy. Always 200 while the server can answer, even before setup. */
export function GET() {
  const state = readState();
  return NextResponse.json(
    {
      status: "ok",
      version: APP_VERSION,
      ...state,
      scheduler: schedulerRunning(),
      time: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
