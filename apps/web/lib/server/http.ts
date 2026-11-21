import { type ErrorCode } from "@stellar/shared";
import { type NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { getConfig, NotConfiguredError } from "./config";
import { DecryptError } from "./crypto";

const STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  locked: 423,
  not_configured: 503,
  upstream_error: 502,
  internal_error: 500,
};

/** An error that maps onto the `{ error: { code, message } }` envelope. */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly retryAfterSeconds?: number;
  constructor(code: ErrorCode, message: string, retryAfterSeconds?: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function errorResponse(
  code: ErrorCode,
  message: string,
  retryAfterSeconds?: number,
): NextResponse {
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (retryAfterSeconds) headers["Retry-After"] = String(retryAfterSeconds);
  return NextResponse.json(
    {
      error: {
        code,
        message,
        ...(retryAfterSeconds ? { retry_after_seconds: retryAfterSeconds } : {}),
      },
    },
    { status: STATUS[code], headers },
  );
}

export function json<T>(
  data: T,
  init?: { status?: number; headers?: Record<string, string> },
): NextResponse {
  return NextResponse.json(data, {
    status: init?.status ?? 200,
    headers: { "Cache-Control": "no-store", ...init?.headers },
  });
}

function zodMessage(err: ZodError): string {
  const issue = err.issues[0];
  if (!issue) return "The request was not valid.";
  const where = issue.path.length ? `${issue.path.join(".")}: ` : "";
  return `${where}${issue.message}`;
}

export function toErrorResponse(err: unknown): NextResponse {
  if (err instanceof ApiError) return errorResponse(err.code, err.message, err.retryAfterSeconds);
  if (err instanceof ZodError) return errorResponse("bad_request", zodMessage(err));
  if (err instanceof NotConfiguredError) return errorResponse("not_configured", err.message);
  if (err instanceof DecryptError) return errorResponse("internal_error", err.message);
  if (err instanceof SyntaxError)
    return errorResponse("bad_request", "The request body is not valid JSON.");
  console.error("[api] unexpected error", err);
  return errorResponse("internal_error", "Something went wrong on the server.");
}

/** Origins allowed to call the API from a browser context: the app itself and browser extensions. */
export function allowedOrigin(req: NextRequest): string | null {
  const origin = req.headers.get("origin");
  if (!origin) return null;
  if (/^(chrome-extension|moz-extension|safari-web-extension):\/\//.test(origin)) return origin;
  const self = requestOrigin(req);
  if (origin === self) return origin;
  const publicUrl = getConfigSafe()?.publicAppUrl;
  if (publicUrl && origin === new URL(publicUrl).origin) return origin;
  return null;
}

function getConfigSafe() {
  try {
    return getConfig();
  } catch {
    return null;
  }
}

/** The app's public origin as the client sees it (honours reverse-proxy headers). */
export function requestOrigin(req: NextRequest): string {
  const configured = getConfigSafe()?.publicAppUrl;
  if (configured) return new URL(configured).origin;
  const proto =
    req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ??
    req.nextUrl.protocol.replace(":", "");
  const host =
    req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ??
    req.headers.get("host") ??
    req.nextUrl.host;
  return `${proto}://${host}`;
}

export function withCors(req: NextRequest, res: NextResponse): NextResponse {
  const origin = allowedOrigin(req);
  if (origin) {
    res.headers.set("Access-Control-Allow-Origin", origin);
    res.headers.set("Access-Control-Allow-Credentials", "true");
    res.headers.append("Vary", "Origin");
  }
  return res;
}

export function preflight(req: NextRequest): NextResponse {
  const res = new NextResponse(null, { status: 204 });
  const origin = allowedOrigin(req);
  if (origin) {
    res.headers.set("Access-Control-Allow-Origin", origin);
    res.headers.set("Access-Control-Allow-Credentials", "true");
    res.headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.headers.set("Access-Control-Allow-Headers", "Authorization,Content-Type");
    res.headers.set("Access-Control-Max-Age", "600");
    res.headers.append("Vary", "Origin");
  }
  return res;
}

type Ctx<P> = { params: Promise<P> };
type Handler<P> = (req: NextRequest, params: P) => Promise<NextResponse> | NextResponse;

/** Wraps a route handler with the error envelope and CORS. */
export function api<P = Record<string, never>>(handler: Handler<P>) {
  return async (req: NextRequest, ctx: Ctx<P>): Promise<NextResponse> => {
    try {
      const params = ctx?.params ? await ctx.params : ({} as P);
      return withCors(req, await handler(req, params));
    } catch (err) {
      return withCors(req, toErrorResponse(err));
    }
  };
}

export function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || req.headers.get("x-real-ip") || "unknown";
}

export async function readJson(req: NextRequest): Promise<unknown> {
  const text = await req.text();
  if (!text) return {};
  return JSON.parse(text);
}

/** Secure cookies when the request arrived over HTTPS (directly or via a proxy). */
export function isSecure(req: NextRequest): boolean {
  return requestOrigin(req).startsWith("https://");
}
