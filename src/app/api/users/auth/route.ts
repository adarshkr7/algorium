import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { apiError, apiSuccess } from "@/lib/api-utils";
import { createSessionToken, createSessionCookieHeader } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const { handle, password } = await req.json();

    if (!handle || !password) {
      return apiError("Handle and password are required", 400);
    }

    const trimmedHandle = handle.trim();

    // Find the user
    const dbUser = await prisma.user.findUnique({
      where: { handle: trimmedHandle },
    });

    if (!dbUser || !dbUser.passwordHash) {
      return apiError("Invalid credentials or account not fully setup.", 401);
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, dbUser.passwordHash);

    if (!isPasswordValid) {
      return apiError("Invalid password", 401);
    }

    // Create session token
    const token = await createSessionToken({
      userId: dbUser.id,
      handle: dbUser.handle,
    });

    // Return the user session object
    const response = apiSuccess({
      user: {
        id: dbUser.id,
        handle: dbUser.handle,
        avatar: dbUser.avatar,
        rating: dbUser.rating,
        maxRating: dbUser.maxRating,
        rank: dbUser.rank,
        maxRank: dbUser.maxRank,
      }
    });

    response.headers.set("Set-Cookie", createSessionCookieHeader(token));
    return response;

  } catch (error: any) {
    console.error("Auth error:", error);
    return apiError("Internal server error", 500);
  }
}
