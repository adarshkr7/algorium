import "server-only";

import { NextResponse } from "next/server";
import {
  getSessionFromRequest,
  type SessionPayload,
} from "./auth";

// ── Standardized API Responses ──

/**
 * Returns a standardized JSON error response. Never leaks internal details.
 */
export function apiError(message: string, status: number = 500): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Returns a standardized JSON success response.
 */
export function apiSuccess(data: Record<string, unknown>, status: number = 200): NextResponse {
  return NextResponse.json(data, { status });
}

// ── Auth Guard ──

export interface AuthenticatedRequest {
  session: SessionPayload;
}

/**
 * Extracts and verifies the session from a request.
 * Returns the session payload or a 401 NextResponse.
 */
export async function requireAuth(
  req: Request
): Promise<SessionPayload | NextResponse> {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return apiError("Authentication required", 401);
  }
  return session;
}

/**
 * Checks if a value is a NextResponse (used after requireAuth).
 */
export function isErrorResponse(value: unknown): value is NextResponse {
  return value instanceof NextResponse;
}

// ── Validation Helpers ──

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validates an email address format.
 */
export function validateEmail(email: string): string | null {
  if (!email || typeof email !== "string") return "Email is required";
  const trimmed = email.trim().toLowerCase();
  if (!EMAIL_REGEX.test(trimmed)) return "Invalid email format";
  return null; // valid
}

/**
 * Validates password strength: minimum 8 characters, at least one number.
 */
export function validatePassword(password: string): string | null {
  if (!password || typeof password !== "string") return "Password is required";
  if (password.length < 8) return "Password must be at least 8 characters";
  if (!/\d/.test(password)) return "Password must contain at least one number";
  return null; // valid
}
