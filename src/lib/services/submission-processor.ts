import { prisma } from "@/lib/prisma";
import { BroadcastService } from "./broadcast";

export async function processUserSubs(
  user: any,
  subs: any[],
  contest: any,
  existingSubsMap: Map<number, any>,
  broadcaster: BroadcastService
): Promise<number> {
  if (!user || !subs) return 0;
  
  let newSubmissionsCount = 0;
  const startTime = new Date(contest.startTime);
  const durationMs = contest.durationMinutes * 60 * 1000;
  const endTime = contest.endTime || new Date(startTime.getTime() + durationMs);

  for (const sub of subs) {
    if (!sub.id) continue;

    const subTime = new Date(sub.creationTimeSeconds * 1000);
    if (subTime < startTime || subTime > endTime) continue;

    if (!sub.problem || !sub.problem.contestId || !sub.problem.index) continue;
    const formattedIndex = String(sub.problem.index).trim().toUpperCase();
    const key = `${sub.problem.contestId}-${formattedIndex}`;
    const targetProblem = contest.problems.find((p: any) => p.problemKey === key);

    if (!targetProblem) continue;

    const solveTimeSec = Math.max(0, Math.floor((subTime.getTime() - startTime.getTime()) / 1000));
    const subVerdict = sub.verdict || "TESTING";

    const existingSub = existingSubsMap.get(sub.id);

    if (existingSub) {
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

        await broadcaster.broadcastSubmission(updatedSub);
        await processLockoutLogic(contest, targetProblem, subVerdict, user, broadcaster);
      }
      continue;
    }

    const createdSub = await prisma.submission.create({
      data: {
        contestId: contest.id,
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

    await broadcaster.broadcastSubmission(createdSub);
    await processLockoutLogic(contest, targetProblem, subVerdict, user, broadcaster);
  }

  return newSubmissionsCount;
}

async function processLockoutLogic(contest: any, targetProblem: any, subVerdict: string, user: any, broadcaster: BroadcastService) {
  if ((contest.mode === "LOCKOUT" || contest.mode === "BLITZ") && subVerdict === "OK") {
    const currentUnlocked = contest.mode === "BLITZ" ? contest.problems.find((p: any) => !p.lockedWinnerId) : null;
    
    const canLock = contest.mode === "BLITZ" 
      ? (currentUnlocked && currentUnlocked.id === targetProblem.id)
      : !targetProblem.lockedWinnerId;

    if (canLock) {
      await prisma.problem.update({
        where: { id: targetProblem.id },
        data: { lockedWinnerId: user.id },
      });
      targetProblem.lockedWinnerId = user.id;

      await broadcaster.broadcastProblemLocked(
        contest.mode,
        targetProblem.id,
        user.handle,
        user.id,
        targetProblem.indexInContest + 1
      );
    }
  }
}
