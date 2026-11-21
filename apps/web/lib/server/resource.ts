import { zId, zListQuery, zReorder } from "@stellar/shared";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, json, readJson } from "./http";
import { rateLimit } from "./rate-limit";
import { type AuthContext, authenticate } from "./supabase";

/**
 * Shared plumbing for the REST facade. Every handler forwards the caller's
 * token to Supabase, so RLS and the database's own rules decide what happens;
 * this file only shapes requests and responses.
 */

interface PgError {
  message: string;
  code?: string;
  details?: string | null;
}
interface PgResult<T = unknown> {
  data: T | null;
  error: PgError | null;
}

// Tables are addressed by name here, which the generated client types cannot express.
interface Query extends PromiseLike<PgResult<Record<string, unknown>[]>> {
  select(columns?: string): Query;
  insert(row: unknown): Query;
  upsert(row: unknown, opts?: unknown): Query;
  update(patch: unknown): Query;
  delete(): Query;
  eq(column: string, value: unknown): Query;
  in(column: string, values: unknown[]): Query;
  is(column: string, value: null): Query;
  gt(column: string, value: unknown): Query;
  gte(column: string, value: unknown): Query;
  lte(column: string, value: unknown): Query;
  order(column: string, opts?: { ascending?: boolean; nullsFirst?: boolean }): Query;
  limit(n: number): Query;
  maybeSingle(): PromiseLike<PgResult<Record<string, unknown>>>;
  single(): PromiseLike<PgResult<Record<string, unknown>>>;
}
interface Untyped {
  from(table: string): Query;
  rpc(
    fn: string,
    args?: Record<string, unknown>,
  ): PromiseLike<PgResult> & { maybeSingle(): PromiseLike<PgResult> };
}

/** Authenticates the caller and applies the general per-owner request budget. */
export async function guard(req: NextRequest): Promise<AuthContext> {
  const auth = await authenticate(req);
  const rate = rateLimit(`api:${auth.userId}:${auth.via}`, 1200, 60_000);
  if (!rate.allowed)
    throw new ApiError(
      "rate_limited",
      "Too many requests. Slow down a little.",
      rate.retryAfterSeconds,
    );
  return auth;
}

export function db(auth: AuthContext): Untyped {
  return auth.supabase as unknown as Untyped;
}

/** Maps a PostgREST/Postgres error onto the API's error envelope. */
export function fail(error: PgError): never {
  const code = error.code ?? "";
  if (code === "PGRST116" || code === "P0002") throw new ApiError("not_found", "Not found.");
  if (code === "42501" || code === "PGRST301") throw new ApiError("forbidden", "Not allowed.");
  if (code === "23505") throw new ApiError("conflict", "That already exists.");
  if (code.startsWith("22") || code.startsWith("23") || code === "P0001")
    throw new ApiError("bad_request", error.message);
  throw new ApiError("upstream_error", error.message);
}

export function unwrap<T>(res: PgResult<T>): T {
  if (res.error) fail(res.error);
  return res.data as T;
}

export function now(): string {
  return new Date().toISOString();
}

/**
 * The sync cursor handed to clients as `server_time`. It is the database's
 * clock, because that is the clock that stamps `updated_at` and deletions.
 */
export async function syncTime(auth: AuthContext): Promise<string> {
  const res = await db(auth).rpc("sp_now");
  if (res.error || typeof res.data !== "string") {
    // A database that has not run migration 0009 yet: step back a little so skew cannot hide a change.
    return new Date(Date.now() - 5000).toISOString();
  }
  return new Date(res.data).toISOString();
}

export interface ListOptions {
  table: string;
  /** Rows carry `deleted_at` and are soft-deleted. */
  softDelete: boolean;
  /** Extra filters for a full (non-delta) listing. */
  filter?: (q: Query, params: URLSearchParams) => Query;
  order?: [string, boolean][];
  limit?: number;
}

/**
 * `GET` for a collection. Without `updated_since` it returns every live row.
 * With it, only rows changed since then, plus the ids removed since then
 * (soft-deleted rows and tombstones of hard deletes) for delta sync.
 */
export async function list(req: NextRequest, auth: AuthContext, opts: ListOptions) {
  const params = req.nextUrl.searchParams;
  const { updated_since } = zListQuery.parse({
    updated_since: params.get("updated_since") ?? undefined,
  });
  const client = db(auth);
  // Read the cursor before the rows, so nothing written in between can be missed.
  const serverTime = await syncTime(auth);
  let q = client.from(opts.table).select("*");
  if (opts.filter) q = opts.filter(q, params);
  for (const [column, ascending] of opts.order ?? [])
    q = q.order(column, { ascending, nullsFirst: false });
  q = q.limit(opts.limit ?? 5000);

  if (!updated_since) {
    if (opts.softDelete) q = q.is("deleted_at", null);
    return json({ data: unwrap(await q), deleted_ids: [], server_time: serverTime });
  }

  if (Number.isNaN(Date.parse(updated_since)))
    throw new ApiError("bad_request", "updated_since must be an ISO 8601 timestamp.");
  const rows = unwrap(await q.gt("updated_at", updated_since));
  const stones = unwrap(
    await client
      .from("sp_tombstones")
      .select("row_id,row_key")
      .eq("table_name", opts.table)
      .gt("deleted_at", updated_since)
      .limit(5000),
  );
  const deleted = new Set<string>();
  const data: Record<string, unknown>[] = [];
  for (const row of rows) {
    if (opts.softDelete && row.deleted_at) deleted.add(String(row.id));
    else data.push(row);
  }
  for (const stone of stones) deleted.add(String(stone.row_key ?? stone.row_id));
  return json({ data, deleted_ids: [...deleted], server_time: serverTime });
}

/** `POST` for a collection. A client-supplied id makes the create idempotent. */
export async function create<S extends z.ZodType>(
  req: NextRequest,
  auth: AuthContext,
  table: string,
  schema: S,
  shape?: (body: z.output<S>) => Record<string, unknown>,
) {
  const body = schema.parse(await readJson(req));
  const row = shape ? shape(body) : (body as Record<string, unknown>);
  const client = db(auth);
  if (typeof row.id === "string") {
    unwrap(
      await client.from(table).upsert(row, { onConflict: "id", ignoreDuplicates: true }).select(),
    );
    return json(unwrap(await client.from(table).select("*").eq("id", row.id).single()), {
      status: 201,
    });
  }
  return json(unwrap(await client.from(table).insert(row).select().single()), { status: 201 });
}

export async function update<S extends z.ZodType>(
  req: NextRequest,
  auth: AuthContext,
  table: string,
  id: string,
  schema: S,
) {
  const patch = schema.parse(await readJson(req)) as Record<string, unknown>;
  if (Object.keys(patch).length === 0)
    throw new ApiError("bad_request", "Send at least one field to change.");
  const row = unwrap(
    await db(auth).from(table).update(patch).eq("id", zId.parse(id)).select().maybeSingle(),
  );
  if (!row) throw new ApiError("not_found", "Not found.");
  return json(row);
}

/** `DELETE`. Soft-deleted rows can be restored for 30 days; hard deletes are final. */
export async function remove(auth: AuthContext, table: string, id: string, soft: boolean) {
  const client = db(auth);
  const q = soft
    ? client
        .from(table)
        .update({ deleted_at: now() })
        .eq("id", zId.parse(id))
        .is("deleted_at", null)
    : client.from(table).delete().eq("id", zId.parse(id));
  const rows = unwrap(await q.select("id"));
  if (rows.length === 0) throw new ApiError("not_found", "Not found.");
  return json({ ok: true });
}

export const zReorderBody = z.object({ items: z.array(zReorder).min(1).max(500) });

/** `POST …/reorder`: writes the new fractional rank of each moved row (normally one). */
export async function reorder(req: NextRequest, auth: AuthContext, table: string) {
  const { items } = zReorderBody.parse(await readJson(req));
  const client = db(auth);
  const updated: Record<string, unknown>[] = [];
  for (const item of items) {
    const row = unwrap(
      await client
        .from(table)
        .update({ sort_order: item.sort_order })
        .eq("id", item.id)
        .select()
        .maybeSingle(),
    );
    if (!row) throw new ApiError("not_found", `No row with id ${item.id}.`);
    updated.push(row);
  }
  return json({ data: updated });
}

export async function rpc<T = unknown>(
  auth: AuthContext,
  fn: string,
  args?: Record<string, unknown>,
): Promise<T> {
  return unwrap(await db(auth).rpc(fn, args)) as T;
}
