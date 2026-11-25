import { refuseInDemo } from "./demo";
import type { ErrorBody, ErrorCode } from "@stellar/shared";

/** Error thrown for any non-2xx answer from our own API. */
export class ApiRequestError extends Error {
  readonly code: ErrorCode | "network";
  readonly status: number;
  readonly retryAfterSeconds: number | null;
  constructor(
    code: ErrorCode | "network",
    message: string,
    status: number,
    retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = "ApiRequestError";
    this.code = code;
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** A request that has not answered by now is treated as a network failure. */
const REQUEST_TIMEOUT_MS = 20_000;

export interface ApiOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
}

/** Same-origin JSON call with the `{ error: { code, message } }` envelope turned into a typed error. */
export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  refuseInDemo();
  let res: Response;
  try {
    res = await fetch(path, {
      method: options.method ?? (options.body === undefined ? "GET" : "POST"),
      headers: options.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: "same-origin",
      cache: "no-store",
      signal: options.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new ApiRequestError(
      "network",
      "Can't reach the server. Check your connection and try again.",
      0,
    );
  }
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    const err = (data as ErrorBody | null)?.error;
    throw new ApiRequestError(
      err?.code ?? "internal_error",
      err?.message ?? "Something went wrong. Try again.",
      res.status,
      err?.retry_after_seconds ?? null,
    );
  }
  return data as T;
}
