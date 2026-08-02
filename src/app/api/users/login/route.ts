import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchCFUserInfo } from "@/lib/codeforces";
import crypto from "crypto";

/** Generate a human-readable 6-char token like "CF_A3X9" */
function generateToken(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no O/0/I/1 ambiguity
  let token = "CF_";
  for (let i = 0; i < 4; i++) {
    token += chars[crypto.randomInt(0, chars.length)];
  }
  return token;
}

/**
 * POST /api/users/login
 * Step 1: Verify the handle exists on CF, then issue a verification token.
 * The user must set their CF "First Name" to this token to prove ownership.
 */
export async function POST(req: Request) {
  try {
    const { handle } = await req.json();
    if (!handle || typeof handle !== "string" || !handle.trim()) {
      return NextResponse.json({ error: "Codeforces handle is required" }, { status: 400 });
    }

    const trimmedHandle = handle.trim();
    const cfUser = await fetchCFUserInfo(trimmedHandle);

    if (!cfUser) {
      return NextResponse.json(
        { error: `Codeforces user '${trimmedHandle}' not found. Please verify your handle.` },
        { status: 404 }
      );
    }

    const token = generateToken();
    const tokenExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

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

    return NextResponse.json({ token, handle: cfUser.handle });
  } catch (error) {
    console.error("Login initiate error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
