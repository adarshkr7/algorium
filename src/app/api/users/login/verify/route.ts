import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchCFUserInfo } from "@/lib/codeforces";
import crypto from "crypto";

/**
 * POST /api/users/login/verify
 * Step 2: Re-fetch the user's CF profile and check that firstName matches the token.
 * If it does, clear the token and return the full user object (session granted).
 */
export async function POST(req: Request) {
  try {
    const { handle } = await req.json();
    if (!handle || typeof handle !== "string" || !handle.trim()) {
      return NextResponse.json({ error: "Handle is required" }, { status: 400 });
    }

    const trimmedHandle = handle.trim();

    // Look up the pending token from the DB
    const dbUser = await prisma.user.findUnique({ where: { handle: trimmedHandle } });

    if (!dbUser || !dbUser.verificationToken || !dbUser.tokenExpiresAt) {
      return NextResponse.json(
        { error: "No pending verification found. Please restart the login process." },
        { status: 400 }
      );
    }

    // Check token expiry
    if (new Date() > dbUser.tokenExpiresAt) {
      await prisma.user.update({
        where: { handle: trimmedHandle },
        data: { verificationToken: null, tokenExpiresAt: null },
      });
      return NextResponse.json(
        { error: "Verification token has expired (10-minute limit). Please start again." },
        { status: 400 }
      );
    }

    // Re-fetch CF profile to check avatar/rating updates
    const cfUser = await fetchCFUserInfo(trimmedHandle);
    if (!cfUser) {
      return NextResponse.json({ error: "Could not reach Codeforces API. Try again." }, { status: 502 });
    }

    // Fetch the user's recent submissions
    const cfRawRes = await fetch(
      `https://codeforces.com/api/user.status?handle=${encodeURIComponent(trimmedHandle)}&from=1&count=15`,
      { cache: "no-store" }
    );
    const cfRaw = await cfRawRes.json();

    if (cfRaw.status !== "OK" || !cfRaw.result) {
      return NextResponse.json(
        { error: `Codeforces API Error: ${cfRaw.comment || "Could not fetch submissions"}. Please wait a few seconds and try again.` }, 
        { status: 502 }
      );
    }

    const submissions = cfRaw.result;
    
    // The token is a problem ID like "4A" or "158A"
    const targetProblem = dbUser.verificationToken;
    const match = targetProblem.match(/^(\d+)([A-Z]+)$/);
    if (!match) {
      return NextResponse.json({ error: "Invalid verification token format." }, { status: 500 });
    }
    const targetContestId = parseInt(match[1]);
    const targetIndex = match[2];
    
    const fiveMinutesAgo = Math.floor(Date.now() / 1000) - (5 * 60);
    
    // Verify a matching submission exists
    const hasValidSubmission = submissions.some((sub: any) => {
      return (
        sub.verdict === "COMPILATION_ERROR" &&
        sub.problem?.contestId === targetContestId &&
        sub.problem?.index === targetIndex &&
        sub.creationTimeSeconds >= fiveMinutesAgo
      );
    });

    if (!hasValidSubmission) {
      return NextResponse.json(
        {
          error: `Could not find a recent COMPILATION ERROR for problem ${targetProblem}. ` +
            "Make sure you submit invalid code to the correct problem, and try clicking Verify again.",
        },
        { status: 403 }
      );
    }

    const passwordToken = crypto.randomUUID();

    // ✅ Ownership verified — update profile, issue a password setup token
    await prisma.user.update({
      where: { handle: trimmedHandle },
      data: {
        avatar: cfUser.avatar,
        rating: cfUser.rating,
        maxRating: cfUser.maxRating,
        rank: cfUser.rank,
        maxRank: cfUser.maxRank,
        verificationToken: `SET_PASSWORD_${passwordToken}`,
        tokenExpiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 mins to set password
      },
    });

    return NextResponse.json({ step: "register", passwordToken, handle: trimmedHandle });
  } catch (error: any) {
    console.error("Login verify error:", error);
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
