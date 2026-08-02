import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function POST(req: Request) {
  try {
    const { handle, email, password, passwordToken } = await req.json();

    if (!handle || !email || !password || !passwordToken) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const trimmedHandle = handle.trim();
    const trimmedEmail = email.trim().toLowerCase();

    // Verify the password token
    const dbUser = await prisma.user.findUnique({
      where: { handle: trimmedHandle },
    });

    if (!dbUser || dbUser.verificationToken !== `SET_PASSWORD_${passwordToken}`) {
      return NextResponse.json(
        { error: "Invalid or expired registration token. Please verify your handle again." },
        { status: 403 }
      );
    }

    if (dbUser.tokenExpiresAt && new Date() > dbUser.tokenExpiresAt) {
      return NextResponse.json(
        { error: "Registration token has expired. Please verify your handle again." },
        { status: 403 }
      );
    }

    // Check if email is already in use by someone else
    const existingEmail = await prisma.user.findUnique({
      where: { email: trimmedEmail },
    });

    if (existingEmail && existingEmail.handle !== trimmedHandle) {
      return NextResponse.json(
        { error: "This email is already registered to another Codeforces handle." },
        { status: 409 }
      );
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

    return NextResponse.json({
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

  } catch (error: any) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
