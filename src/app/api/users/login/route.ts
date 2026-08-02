import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchCFUserInfo } from "@/lib/codeforces";
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
    const { handle, forceVerify } = await req.json();
    if (!handle || typeof handle !== "string" || !handle.trim()) {
      return NextResponse.json({ error: "Codeforces handle is required" }, { status: 400 });
    }

    const trimmedHandle = handle.trim();
    
    // Check if user already exists and has a password
    const existingUser = await prisma.user.findUnique({ where: { handle: trimmedHandle } });
    if (existingUser?.passwordHash && !forceVerify) {
      // They have an account, prompt for password
      return NextResponse.json({ step: "password", handle: existingUser.handle });
    }

    const cfUser = await fetchCFUserInfo(trimmedHandle);

    if (!cfUser) {
      return NextResponse.json(
        { error: `Codeforces user '${trimmedHandle}' not found. Please verify your handle.` },
        { status: 404 }
      );
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

    return NextResponse.json({ step: "verify", token, handle: cfUser.handle });
  } catch (error: any) {
    console.error("Login initiate error:", error);
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
