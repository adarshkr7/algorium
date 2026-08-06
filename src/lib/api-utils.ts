import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionFromRequest, type SessionPayload } from "./auth";
import { toJsonSafe } from "./json";
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

/** Extracts and verifies the session. Returns the payload or a 401 response. */
export async function requireAuth(
  req: Request,
): Promise<SessionPayload | NextResponse> {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return apiError("Authentication required", 401, { code: "UNAUTHENTICATED" });
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
 */
export function enforceRateLimit(
  req: Request,
  limit: number,
  windowMs: number,
  message = "Too many requests. Please slow down.",
): NextResponse | null {
  const result: RateLimitResult = rateLimit(req, limit, windowMs);
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
 */
export function handleUnexpected(route: string, error: unknown): NextResponse {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[api:${route}]`, message, error);
  return apiError("Internal server error", 500, { code: "INTERNAL_ERROR" });
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
