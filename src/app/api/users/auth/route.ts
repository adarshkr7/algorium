import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function POST(req: Request) {
  try {
    const { handle, password } = await req.json();

    if (!handle || !password) {
      return NextResponse.json({ error: "Handle and password are required" }, { status: 400 });
    }

    const trimmedHandle = handle.trim();

    // Find the user
    const dbUser = await prisma.user.findUnique({
      where: { handle: trimmedHandle },
    });

    if (!dbUser || !dbUser.passwordHash) {
      return NextResponse.json(
        { error: "Invalid credentials or account not fully setup." },
        { status: 401 }
      );
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, dbUser.passwordHash);

    if (!isPasswordValid) {
      return NextResponse.json(
        { error: "Invalid password" },
        { status: 401 }
      );
    }

    // Return the user session object
    return NextResponse.json({
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

  } catch (error: any) {
    console.error("Auth error:", error);
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
