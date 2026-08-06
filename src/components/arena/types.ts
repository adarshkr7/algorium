import type { Standings } from "@/lib/services/standings";

export interface ArenaPlayer {
  id: string;
  handle: string;
  avatar: string;
  rating: number;
  elo: number;
}

export interface ArenaProblem {
  id: string;
  problemKey: string;
  name: string;
  rating: number;
  tags: string[];
  indexInContest: number;
  lockedWinnerId: string | null;
}

export interface ArenaSubmission {
  id: string;
  userId: string;
  problemId: string;
  verdict: string;
  passedTestCount: number;
  timeSubmitted: string;
  solveTimeSeconds: number | null;
  cfSubmissionId?: string;
  user?: { handle: string; avatar?: string } | null;
  problem?: { name: string } | null;
}

export interface ArenaSeries {
  id: string;
  bestOf: number;
  player1Id: string;
  player2Id: string | null;
  player1Wins: number;
  player2Wins: number;
  status: string;
  winnerId: string | null;
}

export interface ArenaContest {
  id: string;
  name: string;
  mode: string;
  pointingSystem: string;
  problemCount: number;
  durationMinutes: number;
  startTime: string | null;
  endTime: string | null;
  status: string;
  isSolo: boolean;
  problems: ArenaProblem[];
  submissions: ArenaSubmission[];
}

export interface ArenaRoom {
  id: string;
  code: string;
  status: string;
  hostId: string;
  hostingType: string;
  gameNumber: number;
  host: ArenaPlayer;
  guest: ArenaPlayer | null;
  player1: ArenaPlayer | null;
  player2: ArenaPlayer | null;
  series: ArenaSeries | null;
  contest: ArenaContest | null;
}

export interface WinnerInfo {
  winnerId: string | null;
  winnerHandle: string | null;
  isDraw: boolean;
  reason?: string;
  resignedUserId?: string | null;
  standings?: Standings | null;
  eloChanges?: Record<string, number>;
  series?: ArenaSeries | null;
}

export interface RematchInvite {
  code: string;
  createdByHandle: string;
  gameNumber: number;
}
