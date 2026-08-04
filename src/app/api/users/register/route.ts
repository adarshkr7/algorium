import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { apiError, apiSuccess, validateEmail, validatePassword } from "@/lib/api-utils";
import { createSessionToken, createSessionCookieHeader } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(req: Request) {
  try {
    const rl = rateLimit(req as any, 5, 60 * 1000);
    if (!rl.success) {
      return apiError("Too many registration attempts. Please try again later.", 429);
    }

    const { handle, email, password, passwordToken } = await req.json();

    if (!handle || !email || !password || !passwordToken) {
      return apiError("Missing required fields", 400);
    }

    const emailError = validateEmail(email);
    if (emailError) return apiError(emailError, 400);

    const passwordError = validatePassword(password);
    if (passwordError) return apiError(passwordError, 400);

    const trimmedHandle = handle.trim();
    const trimmedEmail = email.trim().toLowerCase();

    // Verify the password token
    const dbUser = await prisma.user.findUnique({
      where: { handle: trimmedHandle },
    });

    if (!dbUser || dbUser.verificationToken !== `SET_PASSWORD_${passwordToken}`) {
      return apiError("Invalid or expired registration token. Please verify your handle again.", 403);
    }

    if (dbUser.tokenExpiresAt && new Date() > dbUser.tokenExpiresAt) {
      return apiError("Registration token has expired. Please verify your handle again.", 403);
    }

    // Check if email is already in use by someone else
    const existingEmail = await prisma.user.findUnique({
      where: { email: trimmedEmail },
    });

    if (existingEmail && existingEmail.handle !== trimmedHandle) {
      return apiError("This email is already registered to another Codeforces handle.", 409);
    }

    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Save and clear the token
    const updatedUser = await prisma.user.update({
      where: { handle: trimmedHandle },
      data: {
        email: trimmedEmail,
        passwordHash,
        verificationToken: null,
        tokenExpiresAt: null,
      },
    });

    // Create session token
    const token = await createSessionToken({
      userId: updatedUser.id,
      handle: updatedUser.handle,
    });

    const response = apiSuccess({
      user: {
        id: updatedUser.id,
        handle: updatedUser.handle,
        avatar: updatedUser.avatar,
        rating: updatedUser.rating,
        maxRating: updatedUser.maxRating,
        rank: updatedUser.rank,
        maxRank: updatedUser.maxRank,
      }
    });

    response.headers.set("Set-Cookie", createSessionCookieHeader(token));
    return response;

  } catch (error: any) {
    console.error("Registration error:", error);
    return apiError("Internal server error", 500);
  }
}
