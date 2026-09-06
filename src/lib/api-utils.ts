import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";
import {
  assertCurrentSession,
  getSessionFromRequest,
  type SessionPayload,
} from "./auth";
import { toJsonSafe } from "./json";
import { log, reportError } from "./logger";
import { rateLimit, type RateLimitResult } from "./rate-limit";

// ── Standardized API responses ───────────────────────────────────────────────

export interface ApiErrorBody {
  error: string;
  code?: string;
  details?: unknown;
}

/** Standardized JSON error response. Never leaks internal details. */
export function apiError(
  message: string,
  status = 500,
  extra?: { code?: string; details?: unknown; headers?: HeadersInit },
): NextResponse {
  const body: ApiErrorBody = { error: message };
  if (extra?.code) body.code = extra.code;
  if (extra?.details !== undefined) body.details = extra.details;
  return NextResponse.json(body, { status, headers: extra?.headers });
}

/**
 * Standardized JSON success response. Runs the payload through `toJsonSafe`
 * so BigInt columns (cfSubmissionId) can be returned without crashing.
 */
export function apiSuccess<T extends Record<string, unknown>>(
  data: T,
  status = 200,
  headers?: HeadersInit,
): NextResponse {
  return NextResponse.json(toJsonSafe(data), { status, headers });
}

/** Checks if a value is a NextResponse (used after requireAuth / parseBody). */
export function isErrorResponse(value: unknown): value is NextResponse {
  return value instanceof NextResponse;
}

// ── Auth guard ───────────────────────────────────────────────────────────────

/**
 * Extracts and verifies the session. Returns the payload or a 401 response.
 *
 * Checks the account's `tokenVersion` as well as the signature, so a session
 * that was revoked by a password reset is rejected rather than honoured for
 * the remaining weeks of its 30-day expiry.
 */
export async function requireAuth(
  req: Request,
): Promise<SessionPayload | NextResponse> {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return apiError("Authentication required", 401, { code: "UNAUTHENTICATED" });
  }
  if (!(await assertCurrentSession(session))) {
    return apiError("Your session has expired. Please sign in again.", 401, {
      code: "SESSION_REVOKED",
    });
  }
  return session;
}

// ── Body parsing + validation ────────────────────────────────────────────────

/**
 * Reads and validates a JSON body against a Zod schema.
 * Returns the parsed value, or a 400 response listing the offending fields.
 */
export async function parseBody<S extends z.ZodType>(
  req: Request,
  schema: S,
): Promise<z.infer<S> | NextResponse> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return apiError("Request body must be valid JSON", 400, {
      code: "INVALID_JSON",
    });
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => ({
      field: issue.path.join(".") || "(root)",
      message: issue.message,
    }));
    return apiError(details[0]?.message ?? "Invalid request body", 400, {
      code: "VALIDATION_FAILED",
      details,
    });
  }
  return parsed.data;
}

// ── Rate limiting ────────────────────────────────────────────────────────────

/**
 * Applies a rate limit and returns a 429 response when exceeded.
 * On success returns null so callers can `if (limited) return limited;`.
 *
 * Async since the counters moved into Redis — every call site must `await`.
 */
export async function enforceRateLimit(
  req: Request,
  limit: number,
  windowMs: number,
  message = "Too many requests. Please slow down.",
): Promise<NextResponse | null> {
  const result: RateLimitResult = await rateLimit(req, limit, windowMs);
  if (result.success) return null;

  const retryAfter = Math.max(1, Math.ceil((result.reset - Date.now()) / 1000));
  return apiError(message, 429, {
    code: "RATE_LIMITED",
    headers: {
      "Retry-After": String(retryAfter),
      "X-RateLimit-Limit": String(limit),
      "X-RateLimit-Remaining": "0",
      "X-RateLimit-Reset": String(result.reset),
    },
  });
}

// ── Error logging ────────────────────────────────────────────────────────────

/**
 * Logs an unexpected error with a stable route tag and returns a generic 500.
 * Keeps stack traces out of the client response.
 *
 * The response carries the request id so a user reporting "it just said
 * internal server error" hands you the string that finds the log line. Pass
 * `req` to get one; without it the error is still logged, just uncorrelated.
 */
export function handleUnexpected(
  route: string,
  error: unknown,
  req?: Request,
): NextResponse {
  const requestId = req ? requestIdFor(req) : undefined;

  log.error("unhandled error", error, { scope: `api:${route}`, requestId });
  reportError(error, { scope: `api:${route}`, requestId });

  return apiError("Internal server error", 500, {
    code: "INTERNAL_ERROR",
    ...(requestId ? { details: { requestId } } : {}),
  });
}

/**
 * A stable id for one request.
 *
 * Reuses whatever the proxy in front already assigned, so a line here can be
 * matched to the same request in the load balancer's logs. Vercel, Fly and
 * Cloudflare each set one of these; anything else gets a fresh uuid.
 */
export function requestIdFor(req: Request): string {
  return (
    req.headers.get("x-request-id") ??
    req.headers.get("x-vercel-id") ??
    req.headers.get("fly-request-id") ??
    req.headers.get("cf-ray") ??
    crypto.randomUUID()
  );
}

// ── Legacy validation helpers (still referenced by the auth routes) ─────────

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(email: string): string | null {
  if (!email || typeof email !== "string") return "Email is required";
  if (!EMAIL_REGEX.test(email.trim().toLowerCase())) return "Invalid email format";
  return null;
}

export function validatePassword(password: string): string | null {
  if (!password || typeof password !== "string") return "Password is required";
  if (password.length < 8) return "Password must be at least 8 characters";
  if (!/\d/.test(password)) return "Password must contain at least one number";
  return null;
}
