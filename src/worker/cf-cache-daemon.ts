import { prisma } from "../lib/prisma";
import { fetchCFUserSolvedKeys } from "../lib/codeforces";
import { hasCachedUserSubmissions } from "../lib/redis";
import { holdLease, releaseLease } from "../lib/leader-lock";

/**
 * Warms the Redis cache of solved-problem keys so contest generation does not
 * have to wait on the Codeforces API.
 *
 * Improvements over the naive version:
 *  - syncs recently active users first, so the people about to start a duel
 *    have a warm cache
 *  - skips handles whose cache entry is still valid
 *  - honours SIGINT/SIGTERM instead of being killed mid-request
 */

const CYCLE_INTERVAL_MS = 30 * 60 * 1000;
const REQUEST_SPACING_MS = 2_000;
const ACTIVE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
/** Upper bound on API calls per cycle, to stay well inside CF rate limits. */
const MAX_SYNCS_PER_CYCLE = 200;

const LEASE_NAME = "cf-cache-daemon";
/** Covers a whole sync cycle, which paces itself at one request every 2s. */
const LEASE_TTL_MS = MAX_SYNCS_PER_CYCLE * REQUEST_SPACING_MS + 60_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let running = true;

async function syncCycle(): Promise<void> {
  const activeSince = new Date(Date.now() - ACTIVE_WINDOW_MS);

  const users = await prisma.user.findMany({
    where: { handle: { not: "" } },
    select: { handle: true, lastSeenAt: true },
    orderBy: { lastSeenAt: "desc" },
    take: MAX_SYNCS_PER_CYCLE,
  });

  const recentlyActive = users.filter((u) => u.lastSeenAt >= activeSince);
  const queue = recentlyActive.length > 0 ? recentlyActive : users;

  console.log(`[cf-cache] cycle start — ${queue.length} candidate handle(s)`);

  let synced = 0;
  let skipped = 0;

  for (const user of queue) {
    if (!running) break;
    if (!user.handle) continue;

    // A warm entry means nothing to do — saves an API round trip per user.
    if (await hasCachedUserSubmissions(user.handle)) {
      skipped++;
      continue;
    }

    try {
      await fetchCFUserSolvedKeys(user.handle);
      synced++;
    } catch (error) {
      console.error(`[cf-cache] failed for ${user.handle}:`, error);
    }

    await sleep(REQUEST_SPACING_MS);
  }

  console.log(`[cf-cache] cycle done — synced ${synced}, skipped ${skipped}`);
}

async function run(): Promise<void> {
  console.log("[cf-cache] started");

  while (running) {
    // One replica warms the cache. Two would double this daemon's Codeforces
    // traffic to rebuild caches the other has already written.
    const lease = await holdLease(LEASE_NAME, LEASE_TTL_MS);
    if (!lease.granted) {
      await sleep(60_000);
      continue;
    }

    try {
      await syncCycle();
    } catch (error) {
      console.error("[cf-cache] cycle error:", error);
    }

    // Sleep in short slices so shutdown is responsive.
    const wakeAt = Date.now() + CYCLE_INTERVAL_MS;
    while (running && Date.now() < wakeAt) {
      await sleep(1_000);
    }
  }

  await releaseLease(LEASE_NAME);
  await prisma.$disconnect();
  console.log("[cf-cache] stopped");
}

function shutdown(signal: string) {
  console.log(`[cf-cache] ${signal} received, winding down…`);
  running = false;
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

run().catch((error) => {
  console.error("[cf-cache] fatal:", error);
  process.exit(1);
});
