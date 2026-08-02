import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchCFUserInfo } from "@/lib/codeforces";

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

    // Re-fetch CF profile to check the current firstName
    const cfUser = await fetchCFUserInfo(trimmedHandle);
    if (!cfUser) {
      return NextResponse.json({ error: "Could not reach Codeforces API. Try again." }, { status: 502 });
    }

    // The Codeforces API returns firstName as a field on the raw user object.
    // fetchCFUserInfo strips it, so we call the CF API directly here.
    const cfRawRes = await fetch(
      `https://codeforces.com/api/user.info?handles=${encodeURIComponent(trimmedHandle)}`,
      { cache: "no-store" }
    );
    const cfRaw = await cfRawRes.json();

    if (cfRaw.status !== "OK" || !cfRaw.result || cfRaw.result.length === 0) {
      return NextResponse.json({ error: "Could not reach Codeforces API. Try again." }, { status: 502 });
    }

    const rawCFUser = cfRaw.result[0];
    const firstName: string = (rawCFUser.firstName ?? "").trim();

    if (firstName !== dbUser.verificationToken) {
      return NextResponse.json(
        {
          error: `First name mismatch. Expected "${dbUser.verificationToken}" but found "${firstName || "(empty)"}". ` +
            "Make sure you saved your Codeforces profile after changing the First Name field.",
        },
        { status: 403 }
      );
    }

    // ✅ Ownership verified — update profile, clear token, return user
    const verifiedUser = await prisma.user.update({
      where: { handle: trimmedHandle },
      data: {
        avatar: cfUser.avatar,
        rating: cfUser.rating,
        maxRating: cfUser.maxRating,
        rank: cfUser.rank,
        maxRank: cfUser.maxRank,
        verificationToken: null,
        tokenExpiresAt: null,
      },
    });

    return NextResponse.json({ user: verifiedUser });
  } catch (error: any) {
    console.error("Login verify error:", error);
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
