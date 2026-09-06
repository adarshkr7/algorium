import "server-only";

import crypto from "crypto";
import redis from "./redis";

/**
 * A short lease that lets exactly one worker replica do the work.
 *
 * Both background workers are infinite loops written for a single process. Run
 * two replicas of `worker:eval` and they poll Codeforces for the same contests
 * on the same tick, race each other through the media sweep, and each try to
 * finalise the same expiring duels. `finishContest` survives that — its claim
 * is transactional — but the duplicated Codeforces traffic is exactly what the
 * `MAX_CONCURRENT` cap exists to avoid, and doubling it is a good way to get
 * rate limited during a busy evening.
 *
 * The lease is deliberately soft. If Redis is unreachable every replica
 * considers itself the leader, which is the behaviour this codebase had all
 * along; a duel that stops being evaluated is a worse failure than one that is
 * evaluated twice.
 */

/** Identifies this process for the lifetime of the lock. */
const HOLDER = crypto.randomUUID();

/**
 * Extends the lease only while we still hold it. A plain `PEXPIRE` would let a
 * replica that already lost the lease keep pushing the expiry out, so the
 * holder is compared first.
 */
const RENEW_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('PEXPIRE', KEYS[1], ARGV[2])
else
  return 0
end
`;

const RELEASE_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
else
  return 0
end
`;

let warnedDegraded = false;

export interface Lease {
  /** True when this process may do the work this tick. */
  granted: boolean;
  /** True when the answer is "Redis is down, everyone proceed". */
  degraded: boolean;
}

/**
 * Claims or renews the named lease.
 *
 * Call it every tick with a `ttlMs` comfortably longer than the tick interval,
 * so a leader that is merely slow does not lose the lease to a peer mid-pass.
 */
export async function holdLease(name: string, ttlMs: number): Promise<Lease> {
  const key = `lease:${name}`;

  try {
    const renewed = (await redis.eval(
      RENEW_SCRIPT,
      1,
      key,
      HOLDER,
      String(ttlMs),
    )) as number;
    if (renewed === 1) return { granted: true, degraded: false };

    // Not ours (or expired) — try to take it.
    const taken = await redis.set(key, HOLDER, "PX", ttlMs, "NX");
    return { granted: taken === "OK", degraded: false };
  } catch {
    if (!warnedDegraded) {
      warnedDegraded = true;
      console.warn(
        `[lease] Redis unreachable — running "${name}" without leader ` +
          "election. Safe on a single replica; duplicates work if you run more.",
      );
    }
    return { granted: true, degraded: true };
  }
}

/** Gives the lease up on shutdown so a peer can take over immediately. */
export async function releaseLease(name: string): Promise<void> {
  try {
    await redis.eval(RELEASE_SCRIPT, 1, `lease:${name}`, HOLDER);
  } catch {
    /* the lease expires on its own */
  }
}
