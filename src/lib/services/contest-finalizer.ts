import { prisma } from "@/lib/prisma";
import { calculateStandings, determineWinner, type Standings } from "./standings";

export async function finishContest(contestId: string): Promise<{ winnerId: string | null, isDraw: boolean, standings: Standings } | null> {
  // Idempotency guard - we must ONLY process contests that are not FINISHED
  const existing = await prisma.contest.findUnique({ 
    where: { id: contestId }, 
    include: {
      room: { include: { host: true, guest: true, player1: true, player2: true } },
      problems: { orderBy: { indexInContest: "asc" } },
      participants: { include: { user: true } },
      submissions: true,
    }
  });

  if (!existing || existing.status === "FINISHED") return null;

  const player1 = existing.room.player1 || existing.room.host;
  const player2 = existing.room.player2 || existing.room.guest;
  if (!player1 || !player2) return null;

  // Use an updateMany to ensure optimistic locking - only updates if status is not FINISHED
  const result = await prisma.contest.updateMany({
    where: { id: contestId, status: { not: "FINISHED" } },
    data: { status: "FINISHED", endTime: new Date() },
  });

  if (result.count === 0) {
    // Another request already finished the contest in the meantime
    return null;
  }

  // Calculate final standings using the complete data
  const standings = calculateStandings(existing, player1, player2);
  const winnerId = determineWinner(existing, standings);
  const isDraw = winnerId === null;
  
  const p1S = standings.host;
  const p2S = standings.guest;
  
  const getScore = (s: any) => existing.pointingSystem === "POINTS" ? s.points : ((existing.mode === "LOCKOUT" || existing.mode === "BLITZ") ? s.lockedWon : s.acceptedCount);

  // Wrap all final writes in a transaction
  await prisma.$transaction([
    prisma.room.update({
      where: { id: existing.room.id },
      data: { status: "FINISHED" },
    }),
    
    prisma.participant.updateMany({
      where: { contestId, userId: player1.id },
      data: { score: getScore(p1S), penalty: p1S.penaltyMinutes, acceptedCount: p1S.acceptedCount, isWinner: winnerId === player1.id },
    }),
    
    prisma.participant.updateMany({
      where: { contestId, userId: player2.id },
      data: { score: getScore(p2S), penalty: p2S.penaltyMinutes, acceptedCount: p2S.acceptedCount, isWinner: winnerId === player2.id },
    }),
    
    // User stats
    ...(isDraw 
      ? [
          prisma.user.update({ where: { id: player1.id }, data: { draws: { increment: 1 } } }),
          prisma.user.update({ where: { id: player2.id }, data: { draws: { increment: 1 } } })
        ] 
      : [
          prisma.user.update({ where: { id: winnerId! }, data: { wins: { increment: 1 } } }),
          prisma.user.update({ where: { id: winnerId === player1.id ? player2.id : player1.id }, data: { losses: { increment: 1 } } })
        ]
    ),
    
    // Match History
    prisma.matchHistory.create({
      data: { 
        userId: player1.id, 
        roomCode: existing.room.code, 
        opponentHandle: player2.handle, 
        mode: existing.mode, 
        result: isDraw ? "DRAW" : (winnerId === player1.id ? "WIN" : "LOSS"), 
        userScore: getScore(p1S), 
        opponentScore: getScore(p2S), 
        duration: existing.startTime ? Math.floor((new Date().getTime() - new Date(existing.startTime).getTime()) / 1000) : 0
      },
    }),
    prisma.matchHistory.create({
      data: { 
        userId: player2.id, 
        roomCode: existing.room.code, 
        opponentHandle: player1.handle, 
        mode: existing.mode, 
        result: isDraw ? "DRAW" : (winnerId === player2.id ? "WIN" : "LOSS"), 
        userScore: getScore(p2S), 
        opponentScore: getScore(p1S), 
        duration: existing.startTime ? Math.floor((new Date().getTime() - new Date(existing.startTime).getTime()) / 1000) : 0
      },
    })
  ]);

  return {
    winnerId,
    isDraw,
    standings
  };
}
