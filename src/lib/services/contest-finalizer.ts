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
 * Prisma's interactive transactions time out after 5s by default. This one is
 * a dozen sequential round trips to a pooled Postgres, which is comfortably
 * inside that locally and uncomfortably close to it on a cold connection.
 */
const TX_OPTIONS = { maxWait: 10_000, timeout: 20_000 } as const;

/** The rating and streak columns a finalisation reads and then writes back. */
const RATING_FIELDS = {
  elo: true,
  peakElo: true,
  wins: true,
  losses: true,
  draws: true,
  currentStreak: true,
  bestStreak: true,
} as const;

type RatingSnapshot = {
  [K in keyof typeof RATING_FIELDS]: number;
};

/** Prisma's client as seen inside an interactive transaction. */
type Tx = Omit<
  typeof prisma,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

/**
 * Flips the contest to FINISHED, once. Returns false when someone else got
 * there first, which is the caller's signal to bow out.
 */
async function claimContest(tx: Tx, contestId: string): Promise<boolean> {
  const claimed = await tx.contest.updateMany({
    where: { id: contestId, status: { not: "FINISHED" } },
    data: { status: "FINISHED", endTime: new Date() },
  });
  return claimed.count > 0;
}

/**
 * Writes one player's result, guarded on the rating we based it on.
 *
 * The new Elo is an absolute number computed from `seen`, so a concurrent
 * finalisation that moved the same player's rating would be silently
 * overwritten. Matching on the old value turns that into zero rows updated,
 * and the throw rolls the transaction back so the contest is retried rather
 * than half-recorded.
 */
async function applyRating(
  tx: Tx,
  args: {
    userId: string;
    seen: RatingSnapshot;
    won: boolean;
    lost: boolean;
    drew: boolean;
    newElo: number;
  },
): Promise<void> {
  const { userId, seen, won, lost, drew, newElo } = args;
  const nextStreak = won ? seen.currentStreak + 1 : lost ? 0 : seen.currentStreak;

  const written = await tx.user.updateMany({
    where: { id: userId, elo: seen.elo, wins: seen.wins, losses: seen.losses },
    data: {
      wins: won ? { increment: 1 } : undefined,
      losses: lost ? { increment: 1 } : undefined,
      draws: drew ? { increment: 1 } : undefined,
      elo: newElo,
      peakElo: Math.max(seen.peakElo, newElo),
      currentStreak: nextStreak,
      bestStreak: Math.max(seen.bestStreak, nextStreak),
    },
  });

  if (written.count === 0) {
    throw new Error(
      `[finishContest] rating for ${userId} changed mid-finalisation; rolling back`,
    );
  }
}

/**
 * Finalises a contest exactly once.
 *
 * Concurrency: the arena evaluate route, the background worker and the leave
 * route can all decide a contest is over at the same moment. `claimContest`
 * runs inside the transaction as the optimistic lock — whichever call flips
 * the row wins, everyone else gets `null`, and a failure anywhere in the
 * writes rolls the claim back with them.
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

  const standings = calculateStandings(existing, player1, player2 ?? null);
  const durationSeconds = existing.startTime
    ? Math.floor((Date.now() - new Date(existing.startTime).getTime()) / 1000)
    : 0;

  // ── Solo practice: no winner, no rating, no history ──────────────────────
  if (existing.isSolo || !player2) {
    const done = await prisma.$transaction(async (tx) => {
      if (!(await claimContest(tx, contestId))) return false;

      await tx.room.update({
        where: { id: existing.room.id },
        data: { status: "FINISHED" },
      });
      await tx.participant.updateMany({
        where: { contestId, userId: player1.id },
        data: {
          score: primaryScore(existing, standings.host),
          penalty: standings.host.penaltyMinutes,
          acceptedCount: standings.host.acceptedCount,
        },
      });
      return true;
    }, TX_OPTIONS);

    if (!done) return null;

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

  const p1Won = winnerId === player1.id;
  const p2Won = winnerId === player2.id;
  const scoreA: 0 | 0.5 | 1 = isDraw ? 0.5 : p1Won ? 1 : 0;

  const activeSeries = existing.room.series;
  let series: SeriesSnapshot | null = null;

  /**
   * Everything below commits together or not at all.
   *
   * The status claim used to sit outside the transaction: it flipped the
   * contest to FINISHED, and only then did the writes run. A failure in those
   * writes left a contest marked finished with no Elo, no match history and a
   * room stuck IN_PROGRESS — and because every entry point short-circuits on
   * FINISHED, nothing could ever retry it. Claiming inside the transaction
   * means a failure rolls the claim back too and the next pass tries again.
   */
  const outcome = await prisma.$transaction(async (tx) => {
    if (!(await claimContest(tx, contestId))) return null;

    // Re-read the ratings now that the row is claimed. The copies on `existing`
    // came from a read taken before the claim, so using them would write a
    // rating computed from a snapshot that may already be stale.
    const [freshP1, freshP2] = await Promise.all([
      tx.user.findUnique({ where: { id: player1.id }, select: RATING_FIELDS }),
      tx.user.findUnique({ where: { id: player2.id }, select: RATING_FIELDS }),
    ]);
    if (!freshP1 || !freshP2) return null;

    const elo = computeElo(
      freshP1.elo,
      freshP2.elo,
      scoreA,
      freshP1.wins + freshP1.losses + freshP1.draws,
      freshP2.wins + freshP2.losses + freshP2.draws,
    );

    await tx.room.update({
      where: { id: existing.room.id },
      data: { status: "FINISHED" },
    });

    await tx.participant.updateMany({
      where: { contestId, userId: player1.id },
      data: {
        score: p1Score,
        penalty: standings.host.penaltyMinutes,
        acceptedCount: standings.host.acceptedCount,
        isWinner: p1Won,
      },
    });
    await tx.participant.updateMany({
      where: { contestId, userId: player2.id },
      data: {
        score: p2Score,
        penalty: standings.guest.penaltyMinutes,
        acceptedCount: standings.guest.acceptedCount,
        isWinner: p2Won,
      },
    });

    // `elo` is an absolute value derived from the row we just read, so guard
    // the write on that row being unchanged. If another finalisation moved the
    // rating in between, this updates nothing, and throwing rolls the whole
    // transaction back rather than silently discarding the other result.
    await applyRating(tx, {
      userId: player1.id,
      seen: freshP1,
      won: p1Won,
      lost: p2Won,
      drew: isDraw,
      newElo: elo.newA,
    });
    await applyRating(tx, {
      userId: player2.id,
      seen: freshP2,
      won: p2Won,
      lost: p1Won,
      drew: isDraw,
      newElo: elo.newB,
    });

    await tx.matchHistory.createMany({
      data: [
        {
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
        {
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
      ],
    });

    // ── Best-of series bookkeeping ─────────────────────────────────────────
    if (activeSeries && activeSeries.status === "IN_PROGRESS") {
      // The series stores its own player1/player2, which may be swapped
      // relative to this room, so resolve by user id rather than position.
      const seriesP1Won = winnerId === activeSeries.player1Id;
      const seriesP2Won = winnerId === activeSeries.player2Id;

      const nextP1 = activeSeries.player1Wins + (seriesP1Won ? 1 : 0);
      const nextP2 = activeSeries.player2Wins + (seriesP2Won ? 1 : 0);
      const nextDraws = activeSeries.draws + (isDraw ? 1 : 0);

      const needed = Math.floor(activeSeries.bestOf / 2) + 1;
      const gamesPlayed = nextP1 + nextP2 + nextDraws;
      const decided =
        nextP1 >= needed ||
        nextP2 >= needed ||
        gamesPlayed >= activeSeries.bestOf;

      const seriesWinnerId =
        nextP1 > nextP2
          ? activeSeries.player1Id
          : nextP2 > nextP1
            ? activeSeries.player2Id
            : null;

      await tx.matchSeries.update({
        where: { id: activeSeries.id },
        data: {
          player1Wins: nextP1,
          player2Wins: nextP2,
          draws: nextDraws,
          status: decided ? "FINISHED" : "IN_PROGRESS",
          winnerId: decided ? seriesWinnerId : null,
        },
      });

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

    return { deltaA: elo.deltaA, deltaB: elo.deltaB };
  }, TX_OPTIONS);

  if (!outcome) return null;

  const result: FinishResult = {
    winnerId,
    winnerHandle,
    isDraw,
    isSolo: false,
    reason,
    standings,
    eloChanges: {
      [player1.id]: outcome.deltaA,
      [player2.id]: outcome.deltaB,
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
