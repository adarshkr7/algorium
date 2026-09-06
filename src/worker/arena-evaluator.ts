import { prisma } from "../lib/prisma";
import {
  evaluateContest,
  EVALUATION_INCLUDE,
} from "../lib/services/contest-evaluator";
import { sweepMediaCompliance } from "../lib/services/media-enforcer";
import { holdLease, releaseLease } from "../lib/leader-lock";

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

const LEASE_NAME = "arena-evaluator";
/**
 * Long enough that a slow pass does not hand the lease to a peer mid-tick,
 * short enough that a crashed leader is replaced within a few seconds.
 */
const LEASE_TTL_MS = 45_000;

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

/**
 * Enforcement of host-mandated cameras and microphones.
 *
 * Deliberately outside `tick`'s try/catch and not gated on there being any
 * Codeforces work to do: a contest where nobody has submitted anything is
 * exactly the one where somebody might quietly close their camera.
 */
async function mediaTick(): Promise<number> {
  try {
    return await sweepMediaCompliance();
  } catch (error) {
    console.error("[arena-evaluator] media sweep failed:", error);
    return 0;
  }
}

async function run(): Promise<void> {
  console.log("[arena-evaluator] started");

  let wasLeader = false;

  while (running) {
    // Only one replica evaluates. Two would poll Codeforces for the same
    // contests on the same tick, which is precisely the traffic MAX_CONCURRENT
    // exists to bound.
    const lease = await holdLease(LEASE_NAME, LEASE_TTL_MS);
    if (!lease.granted) {
      if (wasLeader) {
        console.log("[arena-evaluator] lease lost; standing by");
        wasLeader = false;
      }
      await sleep(IDLE_INTERVAL_MS);
      continue;
    }
    if (!wasLeader && !lease.degraded) {
      console.log("[arena-evaluator] holding the evaluation lease");
    }
    wasLeader = true;

    let activeCount = 0;
    let mediaCount = 0;
    try {
      activeCount = await tick();
    } catch (error) {
      console.error("[arena-evaluator] loop error:", error);
    }
    mediaCount = await mediaTick();

    // Back off when nothing is live so an idle instance is not hammering the DB.
    const busy = activeCount > 0 || mediaCount > 0;
    await sleep(busy ? POLL_INTERVAL_MS : IDLE_INTERVAL_MS);
  }

  await releaseLease(LEASE_NAME);
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
