import "server-only";

import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "./prisma";

/**
 * The session secret must be provided in production. Previously a hardcoded
 * fallback was used, which meant anyone who read the source could forge a
 * session cookie for any handle on a deployed instance.
 */
function resolveSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;

  if (!secret || secret.length < 32) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "JWT_SECRET is missing or too short (needs >= 32 chars). " +
          "Generate one with: openssl rand -base64 48",
      );
    }
    console.warn(
      "[auth] JWT_SECRET is unset or weak — using a development-only fallback. " +
        "Set JWT_SECRET in .env before deploying.",
    );
    return new TextEncoder().encode(
      "algorium-development-only-secret-do-not-use-in-production",
    );
  }

  return new TextEncoder().encode(secret);
}

const JWT_SECRET = resolveSecret();

const COOKIE_NAME = "algorium_session";
const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds

export interface SessionPayload {
  userId: string;
  handle: string;
}

/** Creates a signed JWT session token. */
export async function createSessionToken(
  payload: SessionPayload,
): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(JWT_SECRET);
}

/** Verifies a JWT session token and returns the payload. */
export async function verifySessionToken(
  token: string,
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

/** Reads the session cookie and returns the authenticated user, or null. */
export async function getSessionFromCookies(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(COOKIE_NAME);
  if (!sessionCookie?.value) return null;
  return verifySessionToken(sessionCookie.value);
}

/** Reads the session token from a Request's Cookie header (API route handlers). */
export async function getSessionFromRequest(
  req: Request,
): Promise<SessionPayload | null> {
  const cookieHeader = req.headers.get("cookie") || "";
  const match = cookieHeader.match(
    new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`),
  );
  if (!match) return null;
  return verifySessionToken(match[1]);
}

/** Creates the Set-Cookie header value for the session. */
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

/** Creates a Set-Cookie header that clears the session cookie. */
export function createClearSessionCookieHeader(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

const PUBLIC_USER_FIELDS = {
  id: true,
  handle: true,
  avatar: true,
  rating: true,
  maxRating: true,
  rank: true,
  maxRank: true,
  elo: true,
  peakElo: true,
  wins: true,
  losses: true,
  draws: true,
  currentStreak: true,
} as const;

export type PublicUser = {
  [K in keyof typeof PUBLIC_USER_FIELDS]: K extends
    | "id"
    | "handle"
    | "avatar"
    | "rank"
    | "maxRank"
    ? string
    : number;
};

/**
 * Gets the authenticated user from the DB using the session on the request.
 * Returns null if not authenticated or the user no longer exists.
 */
export async function getAuthenticatedUser(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return null;

  return prisma.user.findUnique({
    where: { id: session.userId },
    select: PUBLIC_USER_FIELDS,
  });
}

export { PUBLIC_USER_FIELDS };

/**
 * Records activity without blocking the response. Used by /api/users/me so the
 * CF cache daemon can prioritise recently active handles.
 */
export function touchLastSeen(userId: string): void {
  prisma.user
    .update({ where: { id: userId }, data: { lastSeenAt: new Date() } })
    .catch(() => {
      /* best effort only */
    });
}
