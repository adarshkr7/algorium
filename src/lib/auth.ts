import "server-only";

import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "./prisma";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "algorium-fallback-secret-change-me"
);

const COOKIE_NAME = "algorium_session";
const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds

export interface SessionPayload {
  userId: string;
  handle: string;
}

/**
 * Creates a signed JWT session token.
 */
export async function createSessionToken(
  payload: SessionPayload
): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(JWT_SECRET);
}

/**
 * Verifies a JWT session token and returns the payload.
 */
export async function verifySessionToken(
  token: string
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    if (!payload.userId || !payload.handle) return null;
    return {
      userId: payload.userId as string,
      handle: payload.handle as string,
    };
  } catch {
    return null;
  }
}

/**
 * Reads the session cookie and returns the authenticated user, or null.
 */
export async function getSessionFromCookies(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(COOKIE_NAME);
  if (!sessionCookie?.value) return null;
  return verifySessionToken(sessionCookie.value);
}

/**
 * Reads the session token from a Request's Cookie header (for API route handlers).
 */
export async function getSessionFromRequest(
  req: Request
): Promise<SessionPayload | null> {
  const cookieHeader = req.headers.get("cookie") || "";
  const match = cookieHeader.match(
    new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`)
  );
  if (!match) return null;
  return verifySessionToken(match[1]);
}

/**
 * Creates Set-Cookie header value for the session.
 */
export function createSessionCookieHeader(token: string): string {
  const isProduction = process.env.NODE_ENV === "production";
  const parts = [
    `${COOKIE_NAME}=${token}`,
    `Path=/`,
    `HttpOnly`,
    `SameSite=Lax`,
    `Max-Age=${SESSION_MAX_AGE}`,
  ];
  if (isProduction) parts.push("Secure");
  return parts.join("; ");
}

/**
 * Creates a Set-Cookie header that clears the session cookie.
 */
export function createClearSessionCookieHeader(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

/**
 * Gets the full authenticated user from DB using the session from a request.
 * Returns null if not authenticated or user not found.
 */
export async function getAuthenticatedUser(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      handle: true,
      avatar: true,
      rating: true,
      maxRating: true,
      rank: true,
      maxRank: true,
    },
  });

  return user;
}
