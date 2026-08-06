import { prisma } from "../lib/prisma";
import {
  evaluateContest,
  EVALUATION_INCLUDE,
} from "../lib/services/contest-evaluator";

/**
 * Background engine that keeps live contests in sync with Codeforces.
 *
 * All of the scoring/finishing logic lives in `evaluateContest`, shared with
 * the on-demand evaluate API route, so the two can no longer drift apart.
 */

const POLL_INTERVAL_MS = 5_000;
const IDLE_INTERVAL_MS = 15_000;
/** Cap concurrent contest passes so a busy night can't exhaust CF rate limits. */
const MAX_CONCURRENT = 4;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let running = true;

async function processInBatches<T>(
  items: T[],
  size: number,
  fn: (item: T) => Promise<unknown>,
): Promise<void> {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(fn));
  }
}

async function tick(): Promise<number> {
  const activeContests = await prisma.contest.findMany({
    where: { status: "IN_PROGRESS" },
    include: EVALUATION_INCLUDE,
  });

  if (activeContests.length === 0) return 0;

  await processInBatches(activeContests, MAX_CONCURRENT, async (contest) => {
    try {
      await evaluateContest(contest);
    } catch (error) {
      console.error(
        `[arena-evaluator] contest ${contest.id} failed:`,
        error instanceof Error ? error.message : error,
      );
    }
  });

  return activeContests.length;
}

async function run(): Promise<void> {
  console.log("[arena-evaluator] started");

  while (running) {
    let activeCount = 0;
    try {
      activeCount = await tick();
    } catch (error) {
      console.error("[arena-evaluator] loop error:", error);
    }
    // Back off when nothing is live so an idle instance is not hammering the DB.
    await sleep(activeCount > 0 ? POLL_INTERVAL_MS : IDLE_INTERVAL_MS);
  }

  await prisma.$disconnect();
  console.log("[arena-evaluator] stopped");
}

function shutdown(signal: string) {
  console.log(`[arena-evaluator] ${signal} received, finishing current pass…`);
  running = false;
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

run().catch((error) => {
  console.error("[arena-evaluator] fatal:", error);
  process.exit(1);
});
