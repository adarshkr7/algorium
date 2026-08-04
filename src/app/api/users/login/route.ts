import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchCFUserInfo } from "@/lib/codeforces";
import { apiError, apiSuccess } from "@/lib/api-utils";
import { rateLimit } from "@/lib/rate-limit";
import crypto from "crypto";

const VERIFICATION_PROBLEMS = ["4A", "71A", "158A", "231A", "282A", "50A", "112A", "339A", "281A", "266A"];

function getRandomProblem(): string {
  return VERIFICATION_PROBLEMS[crypto.randomInt(0, VERIFICATION_PROBLEMS.length)];
}

/**
 * POST /api/users/login
 * Step 1: Verify the handle exists on CF, then issue a verification problem.
 * The user must submit a compilation error to this problem to prove ownership.
 */
export async function POST(req: Request) {
  try {
    const rl = rateLimit(req as any, 5, 60 * 1000);
    if (!rl.success) {
      return apiError("Too many login attempts. Please try again later.", 429);
    }

    const { handle, forceVerify } = await req.json();
    if (!handle || typeof handle !== "string" || !handle.trim()) {
      return apiError("Codeforces handle is required", 400);
    }

    const trimmedHandle = handle.trim();
    
    // Check if user already exists and has a password
    const existingUser = await prisma.user.findUnique({ where: { handle: trimmedHandle } });
    if (existingUser?.passwordHash && !forceVerify) {
      // They have an account, prompt for password
      return apiSuccess({ step: "password", handle: existingUser.handle });
    }

    const cfUser = await fetchCFUserInfo(trimmedHandle);

    if (!cfUser) {
      return apiError(`Codeforces user '${trimmedHandle}' not found. Please verify your handle.`, 404);
    }

    const token = getRandomProblem();
    const tokenExpiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // Upsert user record and store the pending verification token
    await prisma.user.upsert({
      where: { handle: cfUser.handle },
      update: {
        avatar: cfUser.avatar,
        rating: cfUser.rating,
        maxRating: cfUser.maxRating,
        rank: cfUser.rank,
        maxRank: cfUser.maxRank,
        verificationToken: token,
        tokenExpiresAt,
      },
      create: {
        handle: cfUser.handle,
        avatar: cfUser.avatar,
        rating: cfUser.rating,
        maxRating: cfUser.maxRating,
        rank: cfUser.rank,
        maxRank: cfUser.maxRank,
        verificationToken: token,
        tokenExpiresAt,
      },
    });

    return apiSuccess({ step: "verify", token, handle: cfUser.handle });
  } catch (error: any) {
    console.error("Login initiate error:", error);
    return apiError("Internal server error", 500);
  }
}
