import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { computeElo } from "@/lib/elo";
import {
  calculateStandings,
  determineWinner,
  primaryScore,
  type ParticipantStats,
  type Standings,
} from "./standings";
import {
  BroadcastService,
  type ContestFinishReason,
  type SeriesSnapshot,
} from "./broadcast";
import { PUBLIC_USER_SELECT, ROOM_PLAYERS_INCLUDE } from "./room-service";

export interface FinishResult {
  winnerId: string | null;
  winnerHandle: string | null;
  isDraw: boolean;
  isSolo: boolean;
  reason: ContestFinishReason;
  standings: Standings;
  /** userId -> elo delta applied by this match. Empty for solo runs. */
  eloChanges: Record<string, number>;
  series: SeriesSnapshot | null;
}

export interface FinishOptions {
  reason?: ContestFinishReason;
  resignedUserId?: string | null;
  /** Set false when the caller wants to broadcast itself. */
  broadcast?: boolean;
}

const CONTEST_INCLUDE = {
  room: { include: ROOM_PLAYERS_INCLUDE },
  problems: { orderBy: { indexInContest: "asc" } },
  participants: { include: { user: { select: PUBLIC_USER_SELECT } } },
  submissions: true,
} satisfies Prisma.ContestInclude;

/**
 * Finalises a contest exactly once.
 *
 * Concurrency: the arena evaluate route, the background worker and the leave
 * route can all decide a contest is over at the same moment. The `updateMany`
 * guarded on `status != FINISHED` acts as the optimistic lock — whichever call
 * flips the row wins and everyone else gets `null` back.
 *
 * Side effects (all inside one transaction): participant finals, user W/L/D,
 * Elo, streaks, match history, series score, room status.
 */
export async function finishContest(
  contestId: string,
  options: FinishOptions = {},
): Promise<FinishResult | null> {
  const { reason = "manual", resignedUserId = null, broadcast = true } = options;

  const existing = await prisma.contest.findUnique({
    where: { id: contestId },
    include: CONTEST_INCLUDE,
  });

  if (!existing || existing.status === "FINISHED") return null;

  const player1 = existing.room.player1 ?? existing.room.host;
  const player2 = existing.room.player2 ?? existing.room.guest;

  // A solo practice run has no opponent; everything below that compares two
  // players is skipped.
  if (!existing.isSolo && (!player1 || !player2)) return null;
  if (!player1) return null;

  // ── Optimistic lock ──────────────────────────────────────────────────────
  const claimed = await prisma.contest.updateMany({
    where: { id: contestId, status: { not: "FINISHED" } },
    data: { status: "FINISHED", endTime: new Date() },
  });
  if (claimed.count === 0) return null;

  const standings = calculateStandings(existing, player1, player2 ?? null);
  const durationSeconds = existing.startTime
    ? Math.floor((Date.now() - new Date(existing.startTime).getTime()) / 1000)
    : 0;

  // ── Solo practice: no winner, no rating, no history ──────────────────────
  if (existing.isSolo || !player2) {
    await prisma.$transaction([
      prisma.room.update({
        where: { id: existing.room.id },
        data: { status: "FINISHED" },
      }),
      prisma.participant.updateMany({
        where: { contestId, userId: player1.id },
        data: {
          score: primaryScore(existing, standings.host),
          penalty: standings.host.penaltyMinutes,
          acceptedCount: standings.host.acceptedCount,
        },
      }),
    ]);

    const result: FinishResult = {
      winnerId: null,
      winnerHandle: null,
      isDraw: false,
      isSolo: true,
      reason,
      standings,
      eloChanges: {},
      series: null,
    };

    if (broadcast) await emitFinished(existing.room.code, result, resignedUserId);
    return result;
  }

  // ── Head to head ─────────────────────────────────────────────────────────
  const winnerId = determineWinner(existing, standings);
  const isDraw = winnerId === null;
  const winnerHandle =
    winnerId === player1.id
      ? player1.handle
      : winnerId === player2.id
        ? player2.handle
        : null;

  const scoreFor = (stats: ParticipantStats) => primaryScore(existing, stats);
  const p1Score = scoreFor(standings.host);
  const p2Score = scoreFor(standings.guest);

  const gamesP1 = player1.wins + player1.losses + player1.draws;
  const gamesP2 = player2.wins + player2.losses + player2.draws;
  const scoreA: 0 | 0.5 | 1 = isDraw ? 0.5 : winnerId === player1.id ? 1 : 0;

  const elo = computeElo(player1.elo, player2.elo, scoreA, gamesP1, gamesP2);

  const p1Won = winnerId === player1.id;
  const p2Won = winnerId === player2.id;

  const writes: Prisma.PrismaPromise<unknown>[] = [
    prisma.room.update({
      where: { id: existing.room.id },
      data: { status: "FINISHED" },
    }),

    prisma.participant.updateMany({
      where: { contestId, userId: player1.id },
      data: {
        score: p1Score,
        penalty: standings.host.penaltyMinutes,
        acceptedCount: standings.host.acceptedCount,
        isWinner: p1Won,
      },
    }),
    prisma.participant.updateMany({
      where: { contestId, userId: player2.id },
      data: {
        score: p2Score,
        penalty: standings.guest.penaltyMinutes,
        acceptedCount: standings.guest.acceptedCount,
        isWinner: p2Won,
      },
    }),

    prisma.user.update({
      where: { id: player1.id },
      data: {
        wins: p1Won ? { increment: 1 } : undefined,
        losses: p2Won ? { increment: 1 } : undefined,
        draws: isDraw ? { increment: 1 } : undefined,
        elo: elo.newA,
        peakElo: Math.max(player1.peakElo, elo.newA),
        currentStreak: p1Won ? player1.currentStreak + 1 : p2Won ? 0 : player1.currentStreak,
        bestStreak: p1Won
          ? Math.max(player1.bestStreak, player1.currentStreak + 1)
          : player1.bestStreak,
      },
    }),
    prisma.user.update({
      where: { id: player2.id },
      data: {
        wins: p2Won ? { increment: 1 } : undefined,
        losses: p1Won ? { increment: 1 } : undefined,
        draws: isDraw ? { increment: 1 } : undefined,
        elo: elo.newB,
        peakElo: Math.max(player2.peakElo, elo.newB),
        currentStreak: p2Won ? player2.currentStreak + 1 : p1Won ? 0 : player2.currentStreak,
        bestStreak: p2Won
          ? Math.max(player2.bestStreak, player2.currentStreak + 1)
          : player2.bestStreak,
      },
    }),

    prisma.matchHistory.create({
      data: {
        userId: player1.id,
        roomCode: existing.room.code,
        opponentHandle: player2.handle,
        mode: existing.mode,
        result: isDraw ? "DRAW" : p1Won ? "WIN" : "LOSS",
        userScore: p1Score,
        opponentScore: p2Score,
        duration: durationSeconds,
        eloChange: elo.deltaA,
        eloAfter: elo.newA,
      },
    }),
    prisma.matchHistory.create({
      data: {
        userId: player2.id,
        roomCode: existing.room.code,
        opponentHandle: player1.handle,
        mode: existing.mode,
        result: isDraw ? "DRAW" : p2Won ? "WIN" : "LOSS",
        userScore: p2Score,
        opponentScore: p1Score,
        duration: durationSeconds,
        eloChange: elo.deltaB,
        eloAfter: elo.newB,
      },
    }),
  ];

  // ── Best-of series bookkeeping ───────────────────────────────────────────
  let series: SeriesSnapshot | null = null;
  const activeSeries = existing.room.series;

  if (activeSeries && activeSeries.status === "IN_PROGRESS") {
    // The series stores its own player1/player2, which may be swapped relative
    // to this room, so resolve by user id rather than position.
    const seriesP1Won = winnerId === activeSeries.player1Id;
    const seriesP2Won = winnerId === activeSeries.player2Id;

    const nextP1 = activeSeries.player1Wins + (seriesP1Won ? 1 : 0);
    const nextP2 = activeSeries.player2Wins + (seriesP2Won ? 1 : 0);
    const nextDraws = activeSeries.draws + (isDraw ? 1 : 0);

    const needed = Math.floor(activeSeries.bestOf / 2) + 1;
    const gamesPlayed = nextP1 + nextP2 + nextDraws;
    const decided =
      nextP1 >= needed || nextP2 >= needed || gamesPlayed >= activeSeries.bestOf;

    const seriesWinnerId =
      nextP1 > nextP2
        ? activeSeries.player1Id
        : nextP2 > nextP1
          ? activeSeries.player2Id
          : null;

    writes.push(
      prisma.matchSeries.update({
        where: { id: activeSeries.id },
        data: {
          player1Wins: nextP1,
          player2Wins: nextP2,
          draws: nextDraws,
          status: decided ? "FINISHED" : "IN_PROGRESS",
          winnerId: decided ? seriesWinnerId : null,
        },
      }),
    );

    series = {
      id: activeSeries.id,
      bestOf: activeSeries.bestOf,
      player1Id: activeSeries.player1Id,
      player2Id: activeSeries.player2Id,
      player1Wins: nextP1,
      player2Wins: nextP2,
      status: decided ? "FINISHED" : "IN_PROGRESS",
      winnerId: decided ? seriesWinnerId : null,
    };
  }

  await prisma.$transaction(writes);

  const result: FinishResult = {
    winnerId,
    winnerHandle,
    isDraw,
    isSolo: false,
    reason,
    standings,
    eloChanges: {
      [player1.id]: elo.deltaA,
      [player2.id]: elo.deltaB,
    },
    series,
  };

  if (broadcast) await emitFinished(existing.room.code, result, resignedUserId);

  return result;
}

/**
 * Previously nothing broadcast the finish: the leave route assumed
 * `finishContest` did it, and `finishContest` assumed the caller would. The
 * opponent's arena therefore never learned the contest had ended.
 */
async function emitFinished(
  roomCode: string,
  result: FinishResult,
  resignedUserId: string | null,
): Promise<void> {
  try {
    const broadcaster = new BroadcastService(roomCode);
    await broadcaster.broadcastContestFinished({
      winnerId: result.winnerId,
      winnerHandle: result.winnerHandle,
      isDraw: result.isDraw,
      reason: result.reason,
      resignedUserId,
      standings: result.standings,
      eloChanges: result.eloChanges,
      series: result.series,
    });
  } catch (error) {
    console.error("[finishContest] broadcast failed", error);
  }
}
