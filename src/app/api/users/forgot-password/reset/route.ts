import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { apiError, apiSuccess, validatePassword } from "@/lib/api-utils";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(req: Request) {
  try {
    const rl = rateLimit(req as any, 5, 60 * 1000);
    if (!rl.success) {
      return apiError("Too many password reset attempts. Please try again later.", 429);
    }

    const { handle, otp, newPassword } = await req.json();

    if (!handle || !otp || !newPassword) {
      return apiError("Handle, OTP, and new password are required", 400);
    }

    const passwordError = validatePassword(newPassword);
    if (passwordError) return apiError(passwordError, 400);

    const user = await prisma.user.findUnique({
      where: { handle },
    });

    if (!user) {
      return apiError("User not found", 404);
    }

    if (user.verificationToken !== otp) {
      return apiError("Invalid OTP", 401);
    }

    if (!user.tokenExpiresAt || new Date() > user.tokenExpiresAt) {
      return apiError("OTP has expired", 401);
    }

    // Hash the new password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    // Update password and clear OTP
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        verificationToken: null,
        tokenExpiresAt: null,
      },
    });

    return apiSuccess({ success: true, message: "Password reset successfully" }, 200);
  } catch (error: any) {
    console.error("Error resetting password:", error);
    return apiError("Failed to reset password", 500);
  }
}
