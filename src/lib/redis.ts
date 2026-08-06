import Redis from "ioredis";

/**
 * Redis is an optional accelerator, not a hard dependency: every helper here
 * degrades to "cache miss" if the server is unreachable, so the app still runs
 * (just with more Codeforces API traffic) when Redis is down.
 */

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
const CACHE_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

let warnedAboutConnection = false;

const globalForRedis = globalThis as unknown as { redis?: Redis };

const redis =
  globalForRedis.redis ??
  new Redis(redisUrl, {
    maxRetriesPerRequest: 2,
    enableOfflineQueue: false,
    lazyConnect: false,
    retryStrategy(times) {
      if (times > 5) return null; // stop retrying; helpers will just miss
      return Math.min(times * 200, 3_000);
    },
  });

if (process.env.NODE_ENV !== "production") globalForRedis.redis = redis;

redis.on("error", (err: Error) => {
  // Log the first failure only — a down Redis otherwise floods the console
  // with one line per reconnect attempt.
  if (!warnedAboutConnection) {
    warnedAboutConnection = true;
    console.warn(
      `[redis] unavailable (${err.message}). Falling back to direct Codeforces calls.`,
    );
  }
});

redis.on("ready", () => {
  warnedAboutConnection = false;
});

export default redis;

const solvedKey = (handle: string) => `cf:solved:${handle.toLowerCase()}`;

/** Returns the cached solved-problem keys, or null on a miss. */
export async function getCachedUserSubmissions(
  handle: string,
): Promise<Set<string> | null> {
  try {
    const members = await redis.smembers(solvedKey(handle));
    if (!members || members.length === 0) return null;
    return new Set(members);
  } catch {
    return null;
  }
}

/** Cheap existence check used by the cache daemon to skip warm handles. */
export async function hasCachedUserSubmissions(
  handle: string,
): Promise<boolean> {
  try {
    return (await redis.exists(solvedKey(handle))) === 1;
  } catch {
    return false;
  }
}

/** Replaces the cached set for a handle. No-op when the set is empty. */
export async function cacheUserSubmissions(
  handle: string,
  problemKeys: Set<string>,
): Promise<void> {
  if (problemKeys.size === 0) return;

  try {
    const key = solvedKey(handle);
    const pipeline = redis.pipeline();
    pipeline.del(key);

    // SADD has an argument limit; chunk large histories.
    const keys = Array.from(problemKeys);
    for (let i = 0; i < keys.length; i += 1000) {
      pipeline.sadd(key, ...keys.slice(i, i + 1000));
    }

    pipeline.expire(key, CACHE_TTL_SECONDS);
    await pipeline.exec();
  } catch {
    /* cache write failures are non-fatal */
  }
}

/** Drops a handle's cache — call after a user solves problems mid-session. */
export async function invalidateUserSubmissions(handle: string): Promise<void> {
  try {
    await redis.del(solvedKey(handle));
  } catch {
    /* ignore */
  }
}
