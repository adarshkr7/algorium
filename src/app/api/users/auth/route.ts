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
import { PasswordAuthSchema } from "@/lib/validation";

/**
 * POST /api/users/auth — password sign-in.
 *
 * Failures return one generic message so the endpoint can't be used to work
 * out which handles are registered.
 */
export async function POST(req: Request) {
  try {
    const limited = await enforceRateLimit(
      req,
      10,
      60_000,
      "Too many sign-in attempts. Please wait a minute.",
    );
    if (limited) return limited;

    const body = await parseBody(req, PasswordAuthSchema);
    if (isErrorResponse(body)) return body;

    const dbUser = await prisma.user.findUnique({
      where: { handle: body.handle },
    });

    const invalid = () =>
      apiError("Incorrect handle or password", 401, {
        code: "INVALID_CREDENTIALS",
      });

    if (!dbUser?.passwordHash) {
      // Equalise timing with the real comparison path.
      await bcrypt.compare(body.password, "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv");
      return invalid();
    }

    const ok = await bcrypt.compare(body.password, dbUser.passwordHash);
    if (!ok) return invalid();

    const token = await createSessionToken({
      userId: dbUser.id,
      handle: dbUser.handle,
      tokenVersion: dbUser.tokenVersion,
    });

    const user = await prisma.user.update({
      where: { id: dbUser.id },
      data: { lastSeenAt: new Date() },
      select: PUBLIC_USER_FIELDS,
    });

    return apiSuccess({ user }, 200, {
      "Set-Cookie": createSessionCookieHeader(token),
    });
  } catch (error) {
    return handleUnexpected("users/auth", error);
  }
}
