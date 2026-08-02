import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchCFUserInfo } from "@/lib/codeforces";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ handle: string }> }
) {
  try {
    const { handle } = await params;
    if (!handle) {
      return NextResponse.json({ error: "Handle is required" }, { status: 400 });
    }

    const decodedHandle = decodeURIComponent(handle);

    // Fetch user from DB or Codeforces
    let user = await prisma.user.findUnique({
      where: { handle: decodedHandle },
      include: {
        matchHistories: {
          orderBy: { playedAt: "desc" },
          take: 20,
        },
      },
    });

    if (!user) {
      const cfUser = await fetchCFUserInfo(decodedHandle);
      if (!cfUser) {
        return NextResponse.json({ error: "User not found on Codeforces" }, { status: 404 });
      }
      user = await prisma.user.create({
        data: {
          handle: cfUser.handle,
          avatar: cfUser.avatar,
          rating: cfUser.rating,
          maxRating: cfUser.maxRating,
          rank: cfUser.rank,
          maxRank: cfUser.maxRank,
        },
        include: { matchHistories: true },
      });
    }

    const totalMatches = user.wins + user.losses + user.draws;
    const winRate = totalMatches > 0 ? ((user.wins / totalMatches) * 100).toFixed(1) : "0.0";

    return NextResponse.json({
      user,
      stats: {
        totalMatches,
        wins: user.wins,
        losses: user.losses,
        draws: user.draws,
        winRate: Number(winRate),
      },
      matchHistory: user.matchHistories,
    });
  } catch (error) {
    console.error("Profile API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
