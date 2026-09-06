import { prisma } from "@/lib/prisma";
import type { CFSubmission } from "@/lib/codeforces";
import { BroadcastService } from "./broadcast";
import { PUBLIC_USER_SELECT } from "./room-service";

interface ProcessableUser {
  id: string;
  handle: string;
}

interface ProcessableProblem {
  id: string;
  problemKey: string;
  indexInContest: number;
  lockedWinnerId: string | null;
}

interface ProcessableContest {
  id: string;
  mode: string;
  startTime: Date | string | null;
  endTime: Date | string | null;
  durationMinutes: number;
  problems: ProcessableProblem[];
}

/** Normalises a Codeforces submission into our "1800-A" problem key. */
function submissionProblemKey(sub: CFSubmission): string | null {
  const contestId = sub.problem?.contestId ?? sub.contestId;
  const index = sub.problem?.index;
  if (!contestId || !index) return null;
  return `${contestId}-${String(index).trim().toUpperCase()}`;
}

/**
 * Ingests a player's recent Codeforces submissions into the contest.
 *
 * Only submissions created inside the contest window and matching one of the
 * contest problems are stored. Writes are idempotent via the
 * `@@unique([contestId, cfSubmissionId])` constraint, because the evaluate API
 * route and the background worker frequently process the same submission at
 * the same time — that race previously produced duplicate rows, which inflated
 * penalty counts.
 *
 * @returns number of rows created or transitioned out of TESTING.
 */
export async function processUserSubs(
  user: ProcessableUser | null | undefined,
  subs: CFSubmission[] | null | undefined,
  contest: ProcessableContest,
  existingSubsMap: Map<number, { id: string; verdict: string }>,
  broadcaster: BroadcastService,
): Promise<number> {
  if (!user || !subs?.length || !contest.startTime) return 0;

  const startTime = new Date(contest.startTime);
  const endTime = contest.endTime
    ? new Date(contest.endTime)
    : new Date(startTime.getTime() + contest.durationMinutes * 60 * 1000);

  let changed = 0;

  for (const sub of subs) {
    if (!sub?.id) continue;

    const submittedAt = new Date(sub.creationTimeSeconds * 1000);
    if (submittedAt < startTime || submittedAt > endTime) continue;

    const key = submissionProblemKey(sub);
    if (!key) continue;

    const problem = contest.problems.find((p) => p.problemKey === key);
    if (!problem) continue;

    const verdict = sub.verdict || "TESTING";
    const solveTimeSeconds = Math.max(
      0,
      Math.floor((submittedAt.getTime() - startTime.getTime()) / 1000),
    );

    const existing = existingSubsMap.get(sub.id);

    // Already stored with a final verdict — nothing to do.
    if (existing && !(existing.verdict === "TESTING" && verdict !== "TESTING")) {
      continue;
    }

    const record = await prisma.submission.upsert({
      where: {
        contestId_cfSubmissionId: {
          contestId: contest.id,
          cfSubmissionId: BigInt(sub.id),
        },
      },
      create: {
        contestId: contest.id,
        problemId: problem.id,
        userId: user.id,
        cfSubmissionId: BigInt(sub.id),
        verdict,
        passedTestCount: sub.passedTestCount || 0,
        timeSubmitted: submittedAt,
        solveTimeSeconds: verdict === "OK" ? solveTimeSeconds : null,
      },
      update: {
        verdict,
        passedTestCount: sub.passedTestCount || 0,
        solveTimeSeconds: verdict === "OK" ? solveTimeSeconds : null,
      },
      include: { user: { select: PUBLIC_USER_SELECT }, problem: true },
    });

    existingSubsMap.set(sub.id, { id: record.id, verdict: record.verdict });
    changed++;

    await broadcaster.broadcastSubmission(record);
    await applyLockout(contest, problem, verdict, user, broadcaster);
  }

  return changed;
}

/**
 * LOCKOUT: first accepted solution claims the problem.
 * BLITZ: same, but only the current (first unlocked) problem can be claimed,
 * which is what makes it a linear race.
 */
async function applyLockout(
  contest: ProcessableContest,
  problem: ProcessableProblem,
  verdict: string,
  user: ProcessableUser,
  broadcaster: BroadcastService,
): Promise<void> {
  if (verdict !== "OK") return;
  if (contest.mode !== "LOCKOUT" && contest.mode !== "BLITZ") return;

  if (contest.mode === "BLITZ") {
    const current = contest.problems.find((p) => !p.lockedWinnerId);
    if (!current || current.id !== problem.id) return;
  } else if (problem.lockedWinnerId) {
    return;
  }

  // Conditional update doubles as a lock: only the first writer succeeds.
  const claimed = await prisma.problem.updateMany({
    where: { id: problem.id, lockedWinnerId: null },
    data: { lockedWinnerId: user.id },
  });
  if (claimed.count === 0) return;

  problem.lockedWinnerId = user.id;

  await broadcaster.broadcastProblemLocked(
    contest.mode,
    problem.id,
    user.handle,
    user.id,
    problem.indexInContest + 1,
  );
}
