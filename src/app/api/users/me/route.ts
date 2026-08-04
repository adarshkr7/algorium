import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

/**
 * GET /api/users/me
 * Returns the currently authenticated user from the session cookie.
 */
export async function GET(req: Request) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) {
      return apiError("Not authenticated", 401);
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        handle: true,
        avatar: true,
        rating: true,
        maxRating: true,
        rank: true,
        maxRank: true,
      },
    });

    if (!user) {
      return apiError("User not found", 404);
    }

    return NextResponse.json({ user });
  } catch {
    return apiError("Internal server error", 500);
  }
}
