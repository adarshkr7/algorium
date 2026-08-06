import { prisma } from "@/lib/prisma";
import { fetchCFUserInfo } from "@/lib/codeforces";
import { apiError, apiSuccess, handleUnexpected } from "@/lib/api-utils";
import { eloTier, STARTING_ELO } from "@/lib/elo";

export const dynamic = "force-dynamic";

const HISTORY_LIMIT = 25;
/** Refresh the cached Codeforces profile at most this often. */
const CF_REFRESH_MS = 15 * 60 * 1000;

const PROFILE_SELECT = {
  id: true,
  handle: true,
  avatar: true,
  rating: true,
  maxRating: true,
  rank: true,
  maxRank: true,
  wins: true,
  losses: true,
  draws: true,
  elo: true,
  peakElo: true,
  currentStreak: true,
  bestStreak: true,
  createdAt: true,
  lastSeenAt: true,
} as const;

/**
 * GET /api/profile/[handle]
 * Returns duel stats, Elo standing and recent match history. Unknown handles
 * are looked up on Codeforces and imported on first view.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ handle: string }> },
) {
  try {
    const { handle: rawHandle } = await params;
    if (!rawHandle) return apiError("Handle is required", 400);

    const handle = decodeURIComponent(rawHandle).trim();
    if (!/^[A-Za-z0-9_.-]{1,24}$/.test(handle)) {
      return apiError("Invalid Codeforces handle", 400, {
        code: "INVALID_HANDLE",
      });
    }

    let user = await prisma.user.findUnique({
      where: { handle },
      select: PROFILE_SELECT,
    });

    // Import on first view.
    if (!user) {
      const cfUser = await fetchCFUserInfo(handle);
      if (!cfUser) {
        return apiError(`No Codeforces user called "${handle}"`, 404, {
          code: "CF_USER_NOT_FOUND",
        });
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
        select: PROFILE_SELECT,
      });
    } else if (Date.now() - user.lastSeenAt.getTime() > CF_REFRESH_MS) {
      // Keep the cached CF rating reasonably fresh, but never fail the request
      // if Codeforces is down.
      const cfUser = await fetchCFUserInfo(handle);
      if (cfUser) {
        user = await prisma.user.update({
          where: { handle },
          data: {
            avatar: cfUser.avatar,
            rating: cfUser.rating,
            maxRating: cfUser.maxRating,
            rank: cfUser.rank,
            maxRank: cfUser.maxRank,
          },
          select: PROFILE_SELECT,
        });
      }
    }

    const matchHistory = await prisma.matchHistory.findMany({
      where: { userId: user.id },
      orderBy: { playedAt: "desc" },
      take: HISTORY_LIMIT,
    });

    const totalMatches = user.wins + user.losses + user.draws;
    const winRate =
      totalMatches > 0
        ? Number(((user.wins / totalMatches) * 100).toFixed(1))
        : 0;

    // Dense rank on the Elo ladder — only meaningful once they've played.
    const rankOnLadder =
      totalMatches > 0
        ? (await prisma.user.count({ where: { elo: { gt: user.elo } } })) + 1
        : null;

    return apiSuccess({
      user,
      stats: {
        totalMatches,
        wins: user.wins,
        losses: user.losses,
        draws: user.draws,
        winRate,
        elo: user.elo,
        peakElo: user.peakElo,
        eloTier: eloTier(user.elo).name,
        isProvisional: totalMatches < 10,
        startingElo: STARTING_ELO,
        currentStreak: user.currentStreak,
        bestStreak: user.bestStreak,
        ladderRank: rankOnLadder,
      },
      matchHistory,
    });
  } catch (error) {
    return handleUnexpected("profile/[handle]", error);
  }
}
