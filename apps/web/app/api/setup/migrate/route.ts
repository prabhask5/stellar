import { MIGRATIONS } from "@stellar/db";
import type { NextRequest } from "next/server";
import { toErrorResponse } from "@/lib/server/http";
import { migrate } from "@/lib/server/setup";
import { guardSetup } from "@/lib/server/setup-guard";

export const dynamic = "force-dynamic";

/**
 * Runs pending migrations and streams progress as NDJSON, one event per line:
 *   {"type":"plan","migrations":[…]}  {"type":"progress",…}  {"type":"result",…}
 */
export async function POST(req: NextRequest) {
  try {
    await guardSetup(req);
  } catch (err) {
    return toErrorResponse(err);
  }
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: unknown) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      send({
        type: "plan",
        migrations: MIGRATIONS.map((m) => ({ version: m.version, name: m.name })),
      });
      try {
        const outcome = await migrate((p) => send({ type: "progress", ...p }));
        send({ type: "result", ...outcome });
      } catch (err) {
        send({
          type: "result",
          ok: false,
          method: "manual",
          error: err instanceof Error ? err.message : String(err),
        });
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
