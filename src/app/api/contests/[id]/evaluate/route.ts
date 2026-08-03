import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase client for broadcasting events
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

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

// Standings calculator (host = p1, guest = p2)
function calculateStandings(contest: any, p1: any, p2: any) {
  const subs = contest.submissions || [];
  const problems = contest.problems || [];

  function getPlayerStats(userId: string | null) {
    if (!userId) return { userId: null, acceptedCount: 0, penaltyMinutes: 0, lockedWon: 0, wrongSubsBeforeAC: 0, lastACTime: 0, hasResigned: false };
    let acceptedCount = 0;
    let penaltyMinutes = 0;
    let lockedWon = 0;
    let wrongSubsBeforeAC = 0;
    let lastACTime = 0;

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

      if (contest.mode === "BLITZ" && prob.lockedWinnerId === userId) {
        lockedWon++;
      }
    }

    const participant = contest.participants?.find((p: any) => p.userId === userId);
    const hasResigned = participant?.hasResigned || false;

    return { userId, acceptedCount, penaltyMinutes, lockedWon, wrongSubsBeforeAC, lastACTime, hasResigned };
  }

  const p1Stats = getPlayerStats(p1?.id);
  const p2Stats = getPlayerStats(p2?.id);

  return {
    host: { ...p1Stats, user: p1 },
    guest: { ...p2Stats, user: p2 },
  };
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: contestId } = await params;
    
    // Using a transaction-like approach or single fetches
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
      return NextResponse.json({ status: "FINISHED_OR_INVALID" });
    }

    const startTime = new Date(contest.startTime);
    const now = new Date();
    const durationMs = contest.durationMinutes * 60 * 1000;
    const endTime = contest.endTime || new Date(startTime.getTime() + durationMs);
    const roomCode = contest.room.code;

    // Check timer expiration
    if (now >= endTime) {
      await finishContest(contest, roomCode);
      return NextResponse.json({ status: "FINISHED" });
    }

    const player1 = contest.room.player1 || contest.room.host;
    const player2 = contest.room.player2 || contest.room.guest;
    if (!player1 || !player2) {
       return NextResponse.json({ status: "WAITING_FOR_PLAYERS" });
    }

    // Map existing submissions by cfSubmissionId -> submission object
    const existingSubsMap = new Map<number, any>(
      contest.submissions.map((s) => [Number(s.cfSubmissionId), s])
    );

    const [p1Subs, p2Subs] = await Promise.all([
      fetchCFSubmissions(player1.handle),
      fetchCFSubmissions(player2.handle),
    ]);

    let newSubmissionsCount = 0;
    const channel = supabase.channel(`room-${roomCode}`);

    // Process submissions for a given user
    async function processUserSubs(user: any, subs: any[]) {
      if (!user || !subs) return;
      for (const sub of subs) {
        if (!sub.id) continue;

        const subTime = new Date(sub.creationTimeSeconds * 1000);
        if (subTime < startTime || subTime > endTime) continue;

        if (!sub.problem || !sub.problem.contestId || !sub.problem.index) continue;
        const formattedIndex = String(sub.problem.index).trim().toUpperCase();
        const key = `${sub.problem.contestId}-${formattedIndex}`;
        const targetProblem = contest!.problems.find((p) => p.problemKey === key);

        if (!targetProblem) continue;

        const solveTimeSec = Math.max(0, Math.floor((subTime.getTime() - startTime.getTime()) / 1000));
        const subVerdict = sub.verdict || "TESTING";

        const existingSub = existingSubsMap.get(sub.id);

        if (existingSub) {
          // If the submission is currently TESTING in DB, but CF has a finalized/updated verdict
          if (existingSub.verdict === "TESTING" && subVerdict !== "TESTING") {
            const updatedSub = await prisma.submission.update({
              where: { id: existingSub.id },
              data: {
                verdict: subVerdict,
                passedTestCount: sub.passedTestCount || 0,
                solveTimeSeconds: subVerdict === "OK" ? solveTimeSec : null,
              },
              include: { user: true, problem: true },
            });

            existingSubsMap.set(sub.id, updatedSub);
            newSubmissionsCount++;

            // Broadcast updated submission
            await channel.send({
              type: 'broadcast',
              event: 'new-recent-action',
              payload: {
                type: "SUBMISSION",
                action: { ...updatedSub, cfSubmissionId: updatedSub.cfSubmissionId.toString() },
              },
            });

            // Blitz Mode Lock Logic
            if (contest!.mode === "BLITZ" && subVerdict === "OK") {
              const currentUnlocked = contest!.problems.find((p) => !p.lockedWinnerId);
              if (currentUnlocked && currentUnlocked.id === targetProblem.id) {
                await prisma.problem.update({
                  where: { id: targetProblem.id },
                  data: { lockedWinnerId: user.id },
                });
                targetProblem.lockedWinnerId = user.id;

                await channel.send({
                  type: 'broadcast',
                  event: 'blitz-problem-locked',
                  payload: {
                    lockedProblemId: targetProblem.id,
                    winnerHandle: user.handle,
                    winnerId: user.id,
                    nextIndex: targetProblem.indexInContest + 1,
                  },
                });
              }
            }
          }
          // Already recorded and verdict hasn't changed from a final verdict
          continue;
        }

        // Save brand new submission
        const createdSub = await prisma.submission.create({
          data: {
            contestId: contest!.id,
            problemId: targetProblem.id,
            userId: user.id,
            cfSubmissionId: BigInt(sub.id),
            verdict: subVerdict,
            passedTestCount: sub.passedTestCount || 0,
            timeSubmitted: subTime,
            solveTimeSeconds: subVerdict === "OK" ? solveTimeSec : null,
          },
          include: { user: true, problem: true },
        });

        existingSubsMap.set(sub.id, createdSub);
        newSubmissionsCount++;

        // Broadcast to Supabase
        await channel.send({
          type: 'broadcast',
          event: 'new-recent-action',
          payload: {
            type: "SUBMISSION",
            action: { ...createdSub, cfSubmissionId: createdSub.cfSubmissionId.toString() },
          },
        });

        // Blitz Mode Lock Logic
        if (contest!.mode === "BLITZ" && subVerdict === "OK") {
          const currentUnlocked = contest!.problems.find((p) => !p.lockedWinnerId);
          if (currentUnlocked && currentUnlocked.id === targetProblem.id) {
            await prisma.problem.update({
              where: { id: targetProblem.id },
              data: { lockedWinnerId: user.id },
            });
            targetProblem.lockedWinnerId = user.id;

            await channel.send({
              type: 'broadcast',
              event: 'blitz-problem-locked',
              payload: {
                lockedProblemId: targetProblem.id,
                winnerHandle: user.handle,
                winnerId: user.id,
                nextIndex: targetProblem.indexInContest + 1,
              },
            });
          }
        }
      }
    }

    await processUserSubs(player1, p1Subs);
    await processUserSubs(player2, p2Subs);

    // Fetch latest state to return to polling client
    const updatedContest = await prisma.contest.findUnique({
      where: { id: contest.id },
      include: {
        room: { include: { host: true, guest: true, player1: true, player2: true } },
        problems: { orderBy: { indexInContest: "asc" } },
        participants: { include: { user: true } },
        submissions: { include: { user: true, problem: true }, orderBy: { timeSubmitted: "desc" } },
      },
    });

    const standings = calculateStandings(updatedContest, player1, player2);

    if (updatedContest!.mode === "BLITZ") {
      const allLocked = updatedContest!.problems.every((p) => p.lockedWinnerId !== null);
      if (allLocked) await finishContest(updatedContest, roomCode);
    } else if (updatedContest!.mode === "CLASSIC") {
      // Keep the classic win condition aligned with the latest contest snapshot.
      const p1AC = standings.host.acceptedCount;
      const p2AC = standings.guest.acceptedCount;
      const total = updatedContest!.problems.length;
      if (p1AC === total && p2AC === total) await finishContest(updatedContest, roomCode);
    }

    // Check if both users have resigned
    if (standings.host.hasResigned && standings.guest.hasResigned) {
      await finishContest(updatedContest, roomCode);
    }

    if (newSubmissionsCount > 0) {
      await channel.send({
        type: 'broadcast',
        event: 'scoreboard-update',
        payload: { standings },
      });

      await channel.send({
        type: 'broadcast',
        event: 'problems-update',
        payload: { problems: updatedContest!.problems },
      });
    }

    // Refetch in case status was updated by finishContest
    const finalContestState = await prisma.contest.findUnique({
      where: { id: contest.id },
      include: {
        room: { include: { host: true, guest: true, player1: true, player2: true } },
        problems: { orderBy: { indexInContest: "asc" } },
        participants: { include: { user: true } },
        submissions: { include: { user: true, problem: true }, orderBy: { timeSubmitted: "desc" } },
      },
    });

    const finalStandings = calculateStandings(finalContestState, player1, player2);
    let winnerInfo = null;

    if (finalContestState?.status === "FINISHED") {
      const p1 = finalContestState.room.player1 || finalContestState.room.host;
      const p2 = finalContestState.room.player2 || finalContestState.room.guest;
      const p1S = finalStandings.host;
      const p2S = finalStandings.guest;
      let winnerId = null;

      if (finalContestState.mode === "BLITZ") {
        if (p1S.lockedWon > p2S.lockedWon) winnerId = p1?.id;
        else if (p2S.lockedWon > p1S.lockedWon) winnerId = p2?.id;
      } else {
        if (p1S.acceptedCount > p2S.acceptedCount) winnerId = p1?.id;
        else if (p2S.acceptedCount > p1S.acceptedCount) winnerId = p2?.id;
      }

      winnerInfo = {
        winnerId,
        isDraw: winnerId === null,
        winnerHandle: winnerId === p1?.id ? p1?.handle : winnerId === p2?.id ? p2?.handle : null,
        standings: finalStandings,
      };
    }

    return NextResponse.json({
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
    return NextResponse.json({ error: error?.message || "Internal server error" }, { status: 500 });
  }
}

async function finishContest(contest: any, roomCode: string) {
  const existing = await prisma.contest.findUnique({ where: { id: contest.id }, select: { status: true } });
  if (!existing || existing.status === "FINISHED") return;

  const player1 = contest.room.player1 || contest.room.host;
  const player2 = contest.room.player2 || contest.room.guest;
  if (!player1 || !player2) return;

  const standings = calculateStandings(contest, player1, player2);
  const p1S = standings.host;
  const p2S = standings.guest;

  let winnerId = null;

  if (contest.mode === "BLITZ") {
    if (p1S.lockedWon > p2S.lockedWon) winnerId = player1.id;
    else if (p2S.lockedWon > p1S.lockedWon) winnerId = player2.id;
    else {
      if (p1S.wrongSubsBeforeAC < p2S.wrongSubsBeforeAC) winnerId = player1.id;
      else if (p2S.wrongSubsBeforeAC < p1S.wrongSubsBeforeAC) winnerId = player2.id;
      else {
        if (p1S.lastACTime > 0 && p1S.lastACTime < p2S.lastACTime) winnerId = player1.id;
        else if (p2S.lastACTime > 0 && p2S.lastACTime < p1S.lastACTime) winnerId = player2.id;
      }
    }
  } else {
    // CLASSIC
    if (p1S.acceptedCount > p2S.acceptedCount) winnerId = player1.id;
    else if (p2S.acceptedCount > p1S.acceptedCount) winnerId = player2.id;
    else {
      if (p1S.penaltyMinutes < p2S.penaltyMinutes) winnerId = player1.id;
      else if (p2S.penaltyMinutes < p1S.penaltyMinutes) winnerId = player2.id;
      else {
        if (p1S.lastACTime > 0 && p1S.lastACTime < p2S.lastACTime) winnerId = player1.id;
        else if (p2S.lastACTime > 0 && p2S.lastACTime < p1S.lastACTime) winnerId = player2.id;
      }
    }
  }

  await prisma.contest.update({
    where: { id: contest.id },
    data: { status: "FINISHED", endTime: new Date() },
  });

  await prisma.room.update({
    where: { id: contest.room.id },
    data: { status: "FINISHED" },
  });

  const isDraw = winnerId === null;

  await prisma.participant.updateMany({
    where: { contestId: contest.id, userId: player1.id },
    data: { score: contest.mode === "BLITZ" ? p1S.lockedWon : p1S.acceptedCount, penalty: p1S.penaltyMinutes, acceptedCount: p1S.acceptedCount, isWinner: winnerId === player1.id },
  });

  await prisma.participant.updateMany({
    where: { contestId: contest.id, userId: player2.id },
    data: { score: contest.mode === "BLITZ" ? p2S.lockedWon : p2S.acceptedCount, penalty: p2S.penaltyMinutes, acceptedCount: p2S.acceptedCount, isWinner: winnerId === player2.id },
  });

  if (isDraw) {
    await prisma.user.update({ where: { id: player1.id }, data: { draws: { increment: 1 } } });
    await prisma.user.update({ where: { id: player2.id }, data: { draws: { increment: 1 } } });
  } else {
    const loserId = winnerId === player1.id ? player2.id : player1.id;
    await prisma.user.update({ where: { id: winnerId }, data: { wins: { increment: 1 } } });
    await prisma.user.update({ where: { id: loserId }, data: { losses: { increment: 1 } } });
  }

  const duration = Math.floor((new Date().getTime() - new Date(contest.startTime).getTime()) / 1000);

  await prisma.matchHistory.create({
    data: { userId: player1.id, roomCode: contest.room.code, opponentHandle: player2.handle, mode: contest.mode, result: isDraw ? "DRAW" : winnerId === player1.id ? "WIN" : "LOSS", userScore: contest.mode === "BLITZ" ? p1S.lockedWon : p1S.acceptedCount, opponentScore: contest.mode === "BLITZ" ? p2S.lockedWon : p2S.acceptedCount, duration },
  });

  await prisma.matchHistory.create({
    data: { userId: player2.id, roomCode: contest.room.code, opponentHandle: player1.handle, mode: contest.mode, result: isDraw ? "DRAW" : winnerId === player2.id ? "WIN" : "LOSS", userScore: contest.mode === "BLITZ" ? p2S.lockedWon : p2S.acceptedCount, opponentScore: contest.mode === "BLITZ" ? p1S.lockedWon : p1S.acceptedCount, duration },
  });

  const channel = supabase.channel(`room-${roomCode}`);
  await channel.send({
    type: 'broadcast',
    event: 'contest-finished',
    payload: {
      winnerId,
      isDraw,
      winnerHandle: winnerId === player1.id ? player1.handle : winnerId === player2.id ? player2.handle : null,
      standings,
    }
  });
}
