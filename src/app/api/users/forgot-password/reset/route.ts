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
/** Guesses allowed against one issued code before it is burned. */
const MAX_OTP_ATTEMPTS = 5;

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
    const limited = await enforceRateLimit(
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
      select: {
        id: true,
        resetOtpHash: true,
        resetOtpExpiresAt: true,
        resetOtpAttempts: true,
      },
    });

    const invalidCode = () =>
      apiError("That code is incorrect or has expired.", 401, {
        code: "INVALID_OTP",
      });

    if (!user?.resetOtpHash || !user.resetOtpExpiresAt) return invalidCode();

    const clearOtp = () =>
      prisma.user.update({
        where: { id: user.id },
        data: {
          resetOtpHash: null,
          resetOtpExpiresAt: null,
          resetOtpAttempts: 0,
        },
      });

    if (new Date() > user.resetOtpExpiresAt) {
      await clearOtp();
      return invalidCode();
    }

    // A six-digit code is 10^6 wide, and the per-IP limit above does nothing
    // against guesses spread over many addresses. Burn the code after a
    // handful of misses so the search has to start over with a new email.
    if (user.resetOtpAttempts >= MAX_OTP_ATTEMPTS) {
      await clearOtp();
      return apiError(
        "Too many incorrect codes. Request a new one.",
        429,
        { code: "OTP_ATTEMPTS_EXHAUSTED" },
      );
    }

    if (!(await bcrypt.compare(body.otp, user.resetOtpHash))) {
      await prisma.user.update({
        where: { id: user.id },
        data: { resetOtpAttempts: { increment: 1 } },
      });
      return invalidCode();
    }

    const passwordHash = await bcrypt.hash(body.newPassword, BCRYPT_ROUNDS);

    // Bumping tokenVersion is the point of the reset: whoever prompted it has
    // to be locked out, and a stateless 30-day session ignores a new password.
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        resetOtpHash: null,
        resetOtpExpiresAt: null,
        resetOtpAttempts: 0,
        tokenVersion: { increment: 1 },
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
