import { ContestMode, PointingSystem, ParticipantRole } from "@prisma/client";

export interface ParticipantStats {
  userId: string | null;
  acceptedCount: number;
  penaltyMinutes: number;
  lockedWon: number;
  wrongSubsBeforeAC: number;
  lastACTime: number;
  points: number;
  hasResigned: boolean;
  user?: any;
}

export interface Standings {
  host: ParticipantStats;
  guest: ParticipantStats;
}

export function calculateStandings(contest: any, p1: any, p2: any): Standings {
  const subs = contest.submissions || [];
  const problems = contest.problems || [];

  function getPlayerStats(userId: string | null): ParticipantStats {
    if (!userId) return { userId: null, acceptedCount: 0, penaltyMinutes: 0, lockedWon: 0, wrongSubsBeforeAC: 0, lastACTime: 0, points: 0, hasResigned: false };
    
    let acceptedCount = 0;
    let penaltyMinutes = 0;
    let lockedWon = 0;
    let wrongSubsBeforeAC = 0;
    let lastACTime = 0;
    let points = 0;

    for (const prob of problems) {
      const userProbSubs = subs
        .filter((s: any) => s.userId === userId && s.problemId === prob.id)
        .sort((a: any, b: any) => new Date(a.timeSubmitted).getTime() - new Date(b.timeSubmitted).getTime());

      const acSub = userProbSubs.find((s: any) => s.verdict === "OK");

      if (acSub) {
        acceptedCount++;
        if ((acSub.solveTimeSeconds || 0) > lastACTime) {
          lastACTime = acSub.solveTimeSeconds || 0;
        }

        const wrongBefore = userProbSubs.filter(
          (s: any) => new Date(s.timeSubmitted).getTime() < new Date(acSub.timeSubmitted).getTime() && s.verdict !== "OK"
        ).length;

        wrongSubsBeforeAC += wrongBefore;
        const solveTimeMin = Math.floor((acSub.solveTimeSeconds || 0) / 60);
        penaltyMinutes += solveTimeMin + wrongBefore * 20;
      }

      if ((contest.mode === "LOCKOUT" || contest.mode === "BLITZ") && prob.lockedWinnerId === userId) {
        lockedWon++;
      }
      
      if (contest.pointingSystem === "POINTS") {
        const probPoints = (prob.indexInContest + 1) * 100;
        if (contest.mode === "LOCKOUT" || contest.mode === "BLITZ") {
          if (prob.lockedWinnerId === userId) points += probPoints;
        } else {
          if (acSub) points += probPoints;
        }
      }
    }

    const participant = contest.participants?.find((p: any) => p.userId === userId);
    const hasResigned = participant?.hasResigned || false;

    return { userId, acceptedCount, penaltyMinutes, lockedWon, wrongSubsBeforeAC, lastACTime, points, hasResigned };
  }

  const p1Stats = getPlayerStats(p1?.id);
  const p2Stats = getPlayerStats(p2?.id);

  return {
    host: { ...p1Stats, user: p1 },
    guest: { ...p2Stats, user: p2 },
  };
}

export function determineWinner(contest: any, standings: Standings): string | null {
  const p1S = standings.host;
  const p2S = standings.guest;
  const p1Id = p1S.userId;
  const p2Id = p2S.userId;
  
  if (!p1Id || !p2Id) return null;

  if (p1S.hasResigned && p2S.hasResigned) return null;
  if (p1S.hasResigned) return p2Id;
  if (p2S.hasResigned) return p1Id;

  if (contest.pointingSystem === "POINTS") {
    if (p1S.points > p2S.points) return p1Id;
    if (p2S.points > p1S.points) return p2Id;
    if (p1S.penaltyMinutes < p2S.penaltyMinutes) return p1Id;
    if (p2S.penaltyMinutes < p1S.penaltyMinutes) return p2Id;
    if (p1S.lastACTime > 0 && (p2S.lastACTime === 0 || p1S.lastACTime < p2S.lastACTime)) return p1Id;
    if (p2S.lastACTime > 0 && (p1S.lastACTime === 0 || p2S.lastACTime < p1S.lastACTime)) return p2Id;
    return null; // draw
  } 
  
  if (contest.mode === "LOCKOUT" || contest.mode === "BLITZ") {
    if (p1S.lockedWon > p2S.lockedWon) return p1Id;
    if (p2S.lockedWon > p1S.lockedWon) return p2Id;
    if (p1S.wrongSubsBeforeAC < p2S.wrongSubsBeforeAC) return p1Id;
    if (p2S.wrongSubsBeforeAC < p1S.wrongSubsBeforeAC) return p2Id;
    if (p1S.lastACTime > 0 && (p2S.lastACTime === 0 || p1S.lastACTime < p2S.lastACTime)) return p1Id;
    if (p2S.lastACTime > 0 && (p1S.lastACTime === 0 || p2S.lastACTime < p1S.lastACTime)) return p2Id;
    return null;
  }
  
  // CLASSIC
  if (p1S.acceptedCount > p2S.acceptedCount) return p1Id;
  if (p2S.acceptedCount > p1S.acceptedCount) return p2Id;
  if (p1S.penaltyMinutes < p2S.penaltyMinutes) return p1Id;
  if (p2S.penaltyMinutes < p1S.penaltyMinutes) return p2Id;
  if (p1S.lastACTime > 0 && (p2S.lastACTime === 0 || p1S.lastACTime < p2S.lastACTime)) return p1Id;
  if (p2S.lastACTime > 0 && (p1S.lastACTime === 0 || p2S.lastACTime < p1S.lastACTime)) return p2Id;
  return null;
}

