import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import {
  apiError,
  apiSuccess,
  enforceRateLimit,
  handleUnexpected,
  isErrorResponse,
  parseBody,
} from "@/lib/api-utils";
import {
  createSessionCookieHeader,
  createSessionToken,
  PUBLIC_USER_FIELDS,
} from "@/lib/auth";
import { RegisterSchema } from "@/lib/validation";

const BCRYPT_ROUNDS = 12;

/**
 * POST /api/users/register
 * Step 3 — set an email and password, using the token issued after the
 * Codeforces ownership check. Signs the user in on success.
 */
export async function POST(req: Request) {
  try {
    const limited = enforceRateLimit(
      req,
      6,
      60_000,
      "Too many registration attempts. Please try again shortly.",
    );
    if (limited) return limited;

    const body = await parseBody(req, RegisterSchema);
    if (isErrorResponse(body)) return body;

    const dbUser = await prisma.user.findUnique({
      where: { handle: body.handle },
    });

    if (
      !dbUser ||
      dbUser.verificationToken !== `SET_PASSWORD_${body.passwordToken}`
    ) {
      return apiError(
        "That registration link is no longer valid. Verify your handle again.",
        403,
        { code: "INVALID_SETUP_TOKEN" },
      );
    }

    if (dbUser.tokenExpiresAt && new Date() > dbUser.tokenExpiresAt) {
      return apiError(
        "Your registration window expired. Verify your handle again.",
        410,
        { code: "SETUP_TOKEN_EXPIRED" },
      );
    }

    const emailOwner = await prisma.user.findUnique({
      where: { email: body.email },
      select: { handle: true },
    });
    if (emailOwner && emailOwner.handle !== dbUser.handle) {
      return apiError(
        "That email is already linked to another Codeforces handle.",
        409,
        { code: "EMAIL_TAKEN" },
      );
    }

    const passwordHash = await bcrypt.hash(body.password, BCRYPT_ROUNDS);

    const user = await prisma.user.update({
      where: { handle: dbUser.handle },
      data: {
        email: body.email,
        passwordHash,
        verificationToken: null,
        tokenExpiresAt: null,
        lastSeenAt: new Date(),
      },
      select: PUBLIC_USER_FIELDS,
    });

    const token = await createSessionToken({
      userId: user.id,
      handle: user.handle,
    });

    return apiSuccess({ user }, 200, {
      "Set-Cookie": createSessionCookieHeader(token),
    });
  } catch (error) {
    return handleUnexpected("users/register", error);
  }
}
