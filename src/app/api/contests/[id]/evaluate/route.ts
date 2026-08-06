import { prisma } from "@/lib/prisma";
import {
  apiError,
  apiSuccess,
  enforceRateLimit,
  handleUnexpected,
  isErrorResponse,
  requireAuth,
} from "@/lib/api-utils";
import { evaluateContest } from "@/lib/services/contest-evaluator";

/**
 * POST /api/contests/[id]/evaluate
 *
 * On-demand evaluation pass. The background worker normally drives this, but
 * the arena also calls it as a fallback so a duel still updates when the
 * worker isn't running (or realtime drops).
 *
 * Two bugs fixed here:
 *  - the response embedded Submission rows whose `cfSubmissionId` is a BigInt.
 *    `NextResponse.json` throws on BigInt, so this endpoint 500'd as soon as
 *    anyone submitted. Responses now go through `apiSuccess`, which serialises
 *    BigInt to string.
 *  - a finish detected here was never broadcast, so only the player who
 *    happened to poll last saw the result. `finishContest` now broadcasts.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const limited = enforceRateLimit(req, 30, 60_000);
    if (limited) return limited;

    const session = await requireAuth(req);
    if (isErrorResponse(session)) return session;

    const { id: contestId } = await params;
    if (!contestId) return apiError("Contest id is required", 400);

    // Authorisation first — cheap query, avoids doing CF work for strangers.
    const access = await prisma.contest.findUnique({
      where: { id: contestId },
      select: {
        id: true,
        room: { select: { hostId: true } },
        participants: { select: { userId: true } },
      },
    });

    if (!access) {
      return apiError("Contest not found", 404, { code: "CONTEST_NOT_FOUND" });
    }

    const allowed =
      access.room.hostId === session.userId ||
      access.participants.some((p) => p.userId === session.userId);

    if (!allowed) {
      return apiError("You are not part of this contest", 403, {
        code: "NOT_A_PARTICIPANT",
      });
    }

    const result = await evaluateContest(contestId);

    const winnerInfo = result.finish
      ? {
          winnerId: result.finish.winnerId,
          winnerHandle: result.finish.winnerHandle,
          isDraw: result.finish.isDraw,
          reason: result.finish.reason,
          eloChanges: result.finish.eloChanges,
          series: result.finish.series,
          standings: result.finish.standings,
        }
      : null;

    return apiSuccess({
      status: result.status,
      newSubmissions: result.newSubmissions > 0,
      standings: result.standings,
      problems: result.contest?.problems ?? [],
      submissions: result.contest?.submissions ?? [],
      contestStatus: result.finish ? "FINISHED" : result.contest?.status,
      winnerInfo,
    });
  } catch (error) {
    return handleUnexpected("contests/[id]/evaluate", error);
  }
}
