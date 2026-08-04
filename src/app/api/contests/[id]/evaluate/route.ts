import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isErrorResponse, apiError, apiSuccess } from "@/lib/api-utils";
import { finishContest } from "@/lib/services/contest-finalizer";
import { BroadcastService } from "@/lib/services/broadcast";
import { calculateStandings } from "@/lib/services/standings";
import { processUserSubs } from "@/lib/services/submission-processor";
import { rateLimit } from "@/lib/rate-limit";

// Helper: Fetch Codeforces user submissions
async function fetchCFSubmissions(userHandle: string, count = 200) {
  if (!userHandle) return [];
  try {
    const res = await fetch(
      `https://codeforces.com/api/user.status?handle=${encodeURIComponent(userHandle)}&from=1&count=${count}`
    );
    const data = await res.json();
    if (data.status === "OK" && data.result) {
      return data.result;
    }
  } catch (err: any) {
    console.error(`CF fetch error for ${userHandle}:`, err.message);
  }
  return [];
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rl = rateLimit(req as any, 30, 60 * 1000);
    if (!rl.success) {
      return apiError("Too many evaluate requests. Please slow down.", 429);
    }

    const sessionOrError = await requireAuth(req);
    if (isErrorResponse(sessionOrError)) return sessionOrError;
    const session = sessionOrError;

    const { id: contestId } = await params;
    
    // Initial fetch of contest state
    const contest = await prisma.contest.findUnique({
      where: { id: contestId },
      include: {
        room: { include: { host: true, guest: true, player1: true, player2: true } },
        problems: { orderBy: { indexInContest: "asc" } },
        participants: { include: { user: true } },
        submissions: true,
      },
    });

    if (!contest || contest.status === "FINISHED" || !contest.startTime) {
      return apiSuccess({ status: "FINISHED_OR_INVALID" });
    }

    // Verify participant is authorized to evaluate
    const isParticipant = contest.participants.some(p => p.userId === session.userId) || contest.room.hostId === session.userId;
    if (!isParticipant) {
      return apiError("Unauthorized: You are not a participant of this contest", 403);
    }

    const startTime = new Date(contest.startTime);
    const now = new Date();
    const durationMs = contest.durationMinutes * 60 * 1000;
    const endTime = contest.endTime || new Date(startTime.getTime() + durationMs);
    const roomCode = contest.room.code;

    // Check timer expiration
    if (now >= endTime) {
      await finishContest(contest.id);
      return apiSuccess({ status: "FINISHED" });
    }

    const player1 = contest.room.player1 || contest.room.host;
    const player2 = contest.room.player2 || contest.room.guest;
    if (!player1 || !player2) {
       return apiSuccess({ status: "WAITING_FOR_PLAYERS" });
    }

    const existingSubsMap = new Map<number, any>(
      contest.submissions.map((s) => [Number(s.cfSubmissionId), s])
    );

    const [p1Subs, p2Subs] = await Promise.all([
      fetchCFSubmissions(player1.handle),
      fetchCFSubmissions(player2.handle),
    ]);

    const broadcaster = new BroadcastService(roomCode);
    
    let newSubmissionsCount = 0;
    newSubmissionsCount += await processUserSubs(player1, p1Subs, contest, existingSubsMap, broadcaster);
    newSubmissionsCount += await processUserSubs(player2, p2Subs, contest, existingSubsMap, broadcaster);

    // Fetch latest state to return to polling client and finalize if necessary
    const updatedContest = await prisma.contest.findUnique({
      where: { id: contest.id },
      include: {
        room: { include: { host: true, guest: true, player1: true, player2: true } },
        problems: { orderBy: { indexInContest: "asc" } },
        participants: { include: { user: true } },
        submissions: { include: { user: true, problem: true }, orderBy: { timeSubmitted: "desc" } },
      },
    });

    if (!updatedContest) return apiError("Contest not found", 404);

    const standings = calculateStandings(updatedContest, player1, player2);

    let shouldFinish = false;
    if (updatedContest.mode === "LOCKOUT" || updatedContest.mode === "BLITZ") {
      const allLocked = updatedContest.problems.every((p) => p.lockedWinnerId !== null);
      if (allLocked) shouldFinish = true;
    } else if (updatedContest.mode === "CLASSIC") {
      const p1AC = standings.host.acceptedCount;
      const p2AC = standings.guest.acceptedCount;
      const total = updatedContest.problems.length;
      if (p1AC === total && p2AC === total) shouldFinish = true;
    }

    if (standings.host.hasResigned && standings.guest.hasResigned) {
      shouldFinish = true;
    }

    let finalStandings = standings;
    let winnerInfo = null;

    if (shouldFinish) {
      const finishResult = await finishContest(updatedContest.id);
      if (finishResult) {
        finalStandings = finishResult.standings;
        winnerInfo = {
          winnerId: finishResult.winnerId,
          isDraw: finishResult.isDraw,
          winnerHandle: finishResult.winnerId === player1.id ? player1.handle : finishResult.winnerId === player2.id ? player2.handle : null,
          standings: finishResult.standings,
        };
      }
    } else if (newSubmissionsCount > 0) {
      await broadcaster.broadcastScoreboardUpdate(standings);
      await broadcaster.broadcastProblemsUpdate(updatedContest.problems);
    }

    // Refetch the absolute final state one last time if we just finished it
    const finalContestState = shouldFinish ? await prisma.contest.findUnique({
      where: { id: contest.id },
      include: {
        room: { include: { host: true, guest: true, player1: true, player2: true } },
        problems: { orderBy: { indexInContest: "asc" } },
        participants: { include: { user: true } },
        submissions: { include: { user: true, problem: true }, orderBy: { timeSubmitted: "desc" } },
      },
    }) : updatedContest;

    return apiSuccess({
      status: "OK",
      newSubmissions: newSubmissionsCount > 0,
      standings: finalStandings,
      problems: finalContestState?.problems || [],
      submissions: finalContestState?.submissions || [],
      contestStatus: finalContestState?.status,
      winnerInfo,
    });
  } catch (error: any) {
    console.error("Evaluate API Error:", error);
    return apiError("Internal server error", 500);
  }
}
