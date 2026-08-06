import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fetchCFUserSubmissions } from "@/lib/codeforces";
import { BroadcastService } from "./broadcast";
import { finishContest, type FinishResult } from "./contest-finalizer";
import { processUserSubs } from "./submission-processor";
import { calculateStandings, determineWinner, type Standings } from "./standings";

/**
 * One shared evaluation pass, used by both the background worker and the
 * POST /api/contests/[id]/evaluate route. Previously each held its own near
 * identical copy of this logic and they had already drifted apart — the worker
 * called the broadcast helper with the wrong argument shape, and the route
 * never broadcast a finish at all.
 */

export const EVALUATION_INCLUDE = {
  room: {
    include: { host: true, guest: true, player1: true, player2: true, series: true },
  },
  problems: { orderBy: { indexInContest: "asc" } },
  participants: { include: { user: true } },
  submissions: { include: { user: true, problem: true } },
} satisfies Prisma.ContestInclude;

export type EvaluableContest = Prisma.ContestGetPayload<{
  include: typeof EVALUATION_INCLUDE;
}>;

export type EvaluationStatus =
  | "OK"
  | "FINISHED"
  | "NOT_STARTED"
  | "WAITING_FOR_PLAYERS"
  | "NOT_FOUND";

export interface EvaluationResult {
  status: EvaluationStatus;
  newSubmissions: number;
  standings: Standings | null;
  contest: EvaluableContest | null;
  finish: FinishResult | null;
}

/** How many recent CF submissions to pull per player per pass. */
const CF_SUBMISSION_WINDOW = 200;

function contestEndTime(contest: {
  startTime: Date | null;
  endTime: Date | null;
  durationMinutes: number;
}): Date | null {
  if (!contest.startTime) return null;
  return (
    contest.endTime ??
    new Date(contest.startTime.getTime() + contest.durationMinutes * 60 * 1000)
  );
}

/** True when the contest's own completion condition has been met. */
export function shouldAutoFinish(
  contest: Pick<EvaluableContest, "mode" | "problems" | "isSolo">,
  standings: Standings,
): boolean {
  const total = contest.problems.length;
  if (total === 0) return false;

  if (contest.mode === "LOCKOUT" || contest.mode === "BLITZ") {
    if (contest.problems.every((p) => p.lockedWinnerId !== null)) return true;
  } else if (contest.mode === "CLASSIC") {
    if (contest.isSolo) {
      if (standings.host.acceptedCount === total) return true;
    } else if (
      standings.host.acceptedCount === total &&
      standings.guest.acceptedCount === total
    ) {
      return true;
    }
  }

  // Both players quit.
  if (!contest.isSolo && standings.host.hasResigned && standings.guest.hasResigned) {
    return true;
  }

  return false;
}

export async function evaluateContest(
  contestOrId: string | EvaluableContest,
): Promise<EvaluationResult> {
  const contest =
    typeof contestOrId === "string"
      ? await prisma.contest.findUnique({
          where: { id: contestOrId },
          include: EVALUATION_INCLUDE,
        })
      : contestOrId;

  const empty: EvaluationResult = {
    status: "NOT_FOUND",
    newSubmissions: 0,
    standings: null,
    contest: null,
    finish: null,
  };

  if (!contest) return empty;
  if (contest.status === "FINISHED" || contest.status === "CANCELLED") {
    const player1 = contest.room.player1 ?? contest.room.host;
    const player2 = contest.room.player2 ?? contest.room.guest;
    const standings = calculateStandings(contest, player1, player2 ?? null);
    const winnerParticipant = contest.participants.find((p) => p.isWinner);
    const winnerId =
      winnerParticipant?.userId ??
      (!contest.isSolo ? determineWinner(contest, standings) : null);
    const winnerHandle =
      winnerId === player1?.id
        ? player1?.handle
        : winnerId === player2?.id
          ? player2?.handle
          : null;
    const isDraw = !contest.isSolo && !winnerId;

    const finish: FinishResult = {
      winnerId,
      winnerHandle,
      isDraw,
      isSolo: contest.isSolo,
      reason: "all_solved",
      standings,
      eloChanges: {},
      series: contest.room.series
        ? {
            id: contest.room.series.id,
            bestOf: contest.room.series.bestOf,
            player1Id: contest.room.series.player1Id,
            player2Id: contest.room.series.player2Id,
            player1Wins: contest.room.series.player1Wins,
            player2Wins: contest.room.series.player2Wins,
            status: contest.room.series.status,
            winnerId: contest.room.series.winnerId,
          }
        : null,
    };

    return { ...empty, status: "FINISHED", contest, standings, finish };
  }
  if (!contest.startTime) {
    return { ...empty, status: "NOT_STARTED", contest };
  }

  const player1 = contest.room.player1 ?? contest.room.host;
  const player2 = contest.room.player2 ?? contest.room.guest;

  if (!contest.isSolo && (!player1 || !player2)) {
    return { ...empty, status: "WAITING_FOR_PLAYERS", contest };
  }

  // ── Timer expiry ─────────────────────────────────────────────────────────
  const endTime = contestEndTime(contest);
  if (endTime && new Date() >= endTime) {
    const finish = await finishContest(contest.id, { reason: "time_expired" });
    return {
      status: "FINISHED",
      newSubmissions: 0,
      standings: finish?.standings ?? null,
      contest,
      finish,
    };
  }

  // ── Pull and ingest submissions ──────────────────────────────────────────
  const broadcaster = new BroadcastService(contest.room.code);

  const existingSubs = new Map<number, { id: string; verdict: string }>(
    contest.submissions.map((s) => [
      Number(s.cfSubmissionId),
      { id: s.id, verdict: s.verdict },
    ]),
  );

  const [p1Subs, p2Subs] = await Promise.all([
    player1
      ? fetchCFUserSubmissions(player1.handle, CF_SUBMISSION_WINDOW)
      : Promise.resolve([]),
    player2 && !contest.isSolo
      ? fetchCFUserSubmissions(player2.handle, CF_SUBMISSION_WINDOW)
      : Promise.resolve([]),
  ]);

  let newSubmissions = 0;
  newSubmissions += await processUserSubs(
    player1,
    p1Subs,
    contest,
    existingSubs,
    broadcaster,
  );
  if (!contest.isSolo) {
    newSubmissions += await processUserSubs(
      player2,
      p2Subs,
      contest,
      existingSubs,
      broadcaster,
    );
  }

  // ── Recompute from fresh state ───────────────────────────────────────────
  const updated =
    newSubmissions > 0
      ? await prisma.contest.findUnique({
          where: { id: contest.id },
          include: EVALUATION_INCLUDE,
        })
      : contest;

  if (!updated) return { ...empty, contest };

  const standings = calculateStandings(updated, player1, player2 ?? null);

  if (shouldAutoFinish(updated, standings)) {
    const finish = await finishContest(updated.id, { reason: "all_solved" });
    return {
      status: "FINISHED",
      newSubmissions,
      standings: finish?.standings ?? standings,
      contest: updated,
      finish,
    };
  }

  if (newSubmissions > 0) {
    await broadcaster.broadcastScoreboardUpdate(standings);
    await broadcaster.broadcastProblemsUpdate(updated.problems);
  }

  return {
    status: "OK",
    newSubmissions,
    standings,
    contest: updated,
    finish: null,
  };
}
