import { buildOpenApi } from "@stellar/shared/openapi";
import { NextResponse } from "next/server";
import { APP_VERSION } from "@/lib/server/version";

export const dynamic = "force-static";

/** The machine-readable description of this API (public; it contains no data). */
export function GET() {
  return NextResponse.json(buildOpenApi(APP_VERSION), {
    headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=3600" },
  });
}
