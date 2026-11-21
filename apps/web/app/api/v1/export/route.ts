import { ApiError, api, preflight } from "@/lib/server/http";
import { authenticate } from "@/lib/server/supabase";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/** Everything the owner has stored, as one JSON document. */
export const GET = api(async (req) => {
  const auth = await authenticate(req);
  const { data, error } = await auth.supabase.rpc("sp_export");
  if (error) throw new ApiError("upstream_error", error.message);
  const day = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="stellar-planner-${day}.json"`,
      "Cache-Control": "no-store",
    },
  });
});
