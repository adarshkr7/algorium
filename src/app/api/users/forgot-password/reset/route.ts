import crypto from "crypto";
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
import { ResetPasswordSchema } from "@/lib/validation";

const BCRYPT_ROUNDS = 12;

/** Length-safe constant-time comparison. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * POST /api/users/forgot-password/reset
 *
 * Bug fix: the change-password page posts `handleOrEmail`, but this route read
 * `handle` and passed the resulting `undefined` straight into
 * `findUnique({ where: { handle } })`. Password reset was broken for everyone;
 * it now accepts either a handle or an email, matching the UI.
 */
export async function POST(req: Request) {
  try {
    const limited = enforceRateLimit(
      req,
      6,
      60_000,
      "Too many reset attempts. Please wait a minute.",
    );
    if (limited) return limited;

    const body = await parseBody(req, ResetPasswordSchema);
    if (isErrorResponse(body)) return body;

    const identifier = body.handleOrEmail;

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { handle: { equals: identifier, mode: "insensitive" } },
          { email: { equals: identifier, mode: "insensitive" } },
        ],
      },
      select: { id: true, verificationToken: true, tokenExpiresAt: true },
    });

    const invalidCode = () =>
      apiError("That code is incorrect or has expired.", 401, {
        code: "INVALID_OTP",
      });

    if (!user?.verificationToken || !user.tokenExpiresAt) return invalidCode();
    if (new Date() > user.tokenExpiresAt) {
      await prisma.user.update({
        where: { id: user.id },
        data: { verificationToken: null, tokenExpiresAt: null },
      });
      return invalidCode();
    }
    if (!safeEqual(user.verificationToken, body.otp)) return invalidCode();

    const passwordHash = await bcrypt.hash(body.newPassword, BCRYPT_ROUNDS);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        verificationToken: null,
        tokenExpiresAt: null,
      },
    });

    return apiSuccess({
      success: true,
      message: "Password updated. You can sign in now.",
    });
  } catch (error) {
    return handleUnexpected("users/forgot-password/reset", error);
  }
}
