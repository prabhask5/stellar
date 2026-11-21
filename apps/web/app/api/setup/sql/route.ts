import { fullMigrationSql } from "@stellar/db";
import { api } from "@/lib/server/http";
import { guardSetup } from "@/lib/server/setup-guard";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** The complete migration script, for pasting into the Supabase Studio SQL editor. */
export const GET = api(async (req) => {
  await guardSetup(req);
  return new NextResponse(fullMigrationSql(), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
});
