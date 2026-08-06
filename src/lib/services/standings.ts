/**
 * Scoring rules for every contest mode.
 *
 * These types are intentionally structural rather than Prisma payload types so
 * the same functions can run against a freshly-fetched contest, a broadcast
 * payload, or the trimmed shape the arena page holds in React state.
 */

export interface StandingsProblem {
  id: string;
  indexInContest: number;
  lockedWinnerId?: string | null;
}

export interface StandingsSubmission {
  userId: string;
  problemId: string;
  verdict: string;
  timeSubmitted: Date | string;
  solveTimeSeconds?: number | null;
}

export interface StandingsParticipant {
  userId: string;
  hasResigned?: boolean;
}

export interface StandingsContest {
  mode: string;
  pointingSystem: string;
  problems?: StandingsProblem[];
  submissions?: StandingsSubmission[];
  participants?: StandingsParticipant[];
}

/**
 * Only the fields the scoreboard actually reads. Deliberately structural and
 * without an index signature so both Prisma `User` rows and the trimmed shape
 * the arena holds in React state satisfy it.
 */
export interface StandingsPlayer {
  id: string;
  handle?: string;
  avatar?: string;
  rating?: number;
  elo?: number;
}

export interface ParticipantStats {
  userId: string | null;
  acceptedCount: number;
  penaltyMinutes: number;
  lockedWon: number;
  wrongSubsBeforeAC: number;
  lastACTime: number;
  points: number;
  hasResigned: boolean;
  user?: StandingsPlayer | null;
}

export interface Standings {
  host: ParticipantStats;
  guest: ParticipantStats;
}

/** Wrong-submission penalty in ICPC scoring. */
export const PENALTY_PER_WRONG_MINUTES = 20;

const EMPTY_STATS: ParticipantStats = {
  userId: null,
  acceptedCount: 0,
  penaltyMinutes: 0,
  lockedWon: 0,
  wrongSubsBeforeAC: 0,
  lastACTime: 0,
  points: 0,
  hasResigned: false,
};

const toMs = (value: Date | string): number => new Date(value).getTime();

const isLockoutStyle = (mode: string) =>
  mode === "LOCKOUT" || mode === "BLITZ";

/** Points awarded for a problem under the POINTS system: 100, 200, 300… */
export function problemPoints(indexInContest: number): number {
  return (indexInContest + 1) * 100;
}

export function calculateStandings(
  contest: StandingsContest,
  p1: StandingsPlayer | null | undefined,
  p2: StandingsPlayer | null | undefined,
): Standings {
  const subs = contest.submissions ?? [];
  const problems = contest.problems ?? [];

  function statsFor(userId: string | null | undefined): ParticipantStats {
    if (!userId) return { ...EMPTY_STATS };

    let acceptedCount = 0;
    let penaltyMinutes = 0;
    let lockedWon = 0;
    let wrongSubsBeforeAC = 0;
    let lastACTime = 0;
    let points = 0;

    for (const prob of problems) {
      const problemSubs = subs
        .filter((s) => s.userId === userId && s.problemId === prob.id)
        .sort((a, b) => toMs(a.timeSubmitted) - toMs(b.timeSubmitted));

      const acSub = problemSubs.find((s) => s.verdict === "OK");

      if (acSub) {
        acceptedCount++;
        const solveSeconds = acSub.solveTimeSeconds ?? 0;
        if (solveSeconds > lastACTime) lastACTime = solveSeconds;

        const acTime = toMs(acSub.timeSubmitted);
        const wrongBefore = problemSubs.filter(
          (s) => toMs(s.timeSubmitted) < acTime && s.verdict !== "OK",
        ).length;

        wrongSubsBeforeAC += wrongBefore;
        penaltyMinutes +=
          Math.floor(solveSeconds / 60) + wrongBefore * PENALTY_PER_WRONG_MINUTES;
      }

      if (isLockoutStyle(contest.mode) && prob.lockedWinnerId === userId) {
        lockedWon++;
      }

      if (contest.pointingSystem === "POINTS") {
        const value = problemPoints(prob.indexInContest);
        if (isLockoutStyle(contest.mode)) {
          if (prob.lockedWinnerId === userId) points += value;
        } else if (acSub) {
          points += value;
        }
      }
    }

    const participant = contest.participants?.find((p) => p.userId === userId);

    return {
      userId,
      acceptedCount,
      penaltyMinutes,
      lockedWon,
      wrongSubsBeforeAC,
      lastACTime,
      points,
      hasResigned: participant?.hasResigned ?? false,
    };
  }

  return {
    host: { ...statsFor(p1?.id), user: p1 ?? null },
    guest: { ...statsFor(p2?.id), user: p2 ?? null },
  };
}

/**
 * Returns the winning userId, or null for a draw.
 * Tie-breaks, in order: primary score → penalty → earliest final AC.
 */
export function determineWinner(
  contest: StandingsContest,
  standings: Standings,
): string | null {
  const a = standings.host;
  const b = standings.guest;
  const aId = a.userId;
  const bId = b.userId;

  if (!aId || !bId) return null;

  // Resignation short-circuits everything else.
  if (a.hasResigned && b.hasResigned) return null;
  if (a.hasResigned) return bId;
  if (b.hasResigned) return aId;

  const byLastAC = (): string | null => {
    if (a.lastACTime > 0 && (b.lastACTime === 0 || a.lastACTime < b.lastACTime)) {
      return aId;
    }
    if (b.lastACTime > 0 && (a.lastACTime === 0 || b.lastACTime < a.lastACTime)) {
      return bId;
    }
    return null;
  };

  if (contest.pointingSystem === "POINTS") {
    if (a.points !== b.points) return a.points > b.points ? aId : bId;
    if (a.penaltyMinutes !== b.penaltyMinutes) {
      return a.penaltyMinutes < b.penaltyMinutes ? aId : bId;
    }
    return byLastAC();
  }

  if (isLockoutStyle(contest.mode)) {
    if (a.lockedWon !== b.lockedWon) return a.lockedWon > b.lockedWon ? aId : bId;
    if (a.wrongSubsBeforeAC !== b.wrongSubsBeforeAC) {
      return a.wrongSubsBeforeAC < b.wrongSubsBeforeAC ? aId : bId;
    }
    return byLastAC();
  }

  // CLASSIC
  if (a.acceptedCount !== b.acceptedCount) {
    return a.acceptedCount > b.acceptedCount ? aId : bId;
  }
  if (a.penaltyMinutes !== b.penaltyMinutes) {
    return a.penaltyMinutes < b.penaltyMinutes ? aId : bId;
  }
  return byLastAC();
}

/** The headline number shown for a player, given the contest configuration. */
export function primaryScore(
  contest: Pick<StandingsContest, "mode" | "pointingSystem">,
  stats: ParticipantStats | null | undefined,
): number {
  if (!stats) return 0;
  if (contest.pointingSystem === "POINTS") return stats.points;
  if (isLockoutStyle(contest.mode)) return stats.lockedWon;
  return stats.acceptedCount;
}

/** Human label for the primary score, e.g. "3 Solved" / "2 Locked". */
export function primaryScoreLabel(
  contest: Pick<StandingsContest, "mode" | "pointingSystem">,
): string {
  if (contest.pointingSystem === "POINTS") return "Points";
  if (isLockoutStyle(contest.mode)) return "Locked";
  return "Solved";
}

/** Sort comparator matching `determineWinner`, for leaderboard rows. */
export function compareStats(
  contest: Pick<StandingsContest, "mode" | "pointingSystem">,
  a: ParticipantStats | null | undefined,
  b: ParticipantStats | null | undefined,
): number {
  const sa = primaryScore(contest, a);
  const sb = primaryScore(contest, b);
  if (sa !== sb) return sb - sa;
  return (a?.penaltyMinutes ?? 0) - (b?.penaltyMinutes ?? 0);
}
