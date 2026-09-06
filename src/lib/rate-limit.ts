import "server-only";

import redis from "./redis";

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  reset: number;
}

interface Bucket {
  count: number;
  resetTime: number;
}

/**
 * Fallback store, used only when Redis is unreachable.
 *
 * State here lives in one process, so on a multi-instance deployment each
 * instance keeps its own counters and the effective limit is
 * `limit x instances`. That is a degradation, not the design — see the note on
 * `rateLimit` below.
 */
const store = new Map<string, Bucket>();

// Sweep expired buckets so the map cannot grow unbounded. `unref` keeps the
// timer from holding the process open (matters for the standalone workers).
const sweeper = setInterval(
  () => {
    const now = Date.now();
    for (const [key, bucket] of store.entries()) {
      if (now > bucket.resetTime) store.delete(key);
    }
  },
  5 * 60 * 1000,
);
if (sweeper && typeof sweeper === "object" && "unref" in sweeper) {
  (sweeper as { unref: () => void }).unref();
}

function clientKey(req: Request): string {
  const headers = req.headers;
  // x-forwarded-for can be a comma separated chain; the first entry is the client.
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip =
    forwarded ||
    headers.get("x-real-ip") ||
    headers.get("cf-connecting-ip") ||
    "unknown";
  const { pathname } = new URL(req.url);
  return `ratelimit:${pathname}::${ip}`;
}

/**
 * Fixed window in one round trip: increment, and set the TTL on the first hit
 * of a window. Doing both in a script keeps a crash between the two commands
 * from leaving an immortal key that locks a client out forever.
 *
 * Returns [count, ttlMillis].
 */
const WINDOW_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
return {current, ttl}
`;

function memoryLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const bucket = store.get(key);

  if (!bucket || now > bucket.resetTime) {
    const fresh: Bucket = { count: 1, resetTime: now + windowMs };
    store.set(key, fresh);
    return { success: true, remaining: limit - 1, reset: fresh.resetTime };
  }

  bucket.count += 1;

  if (bucket.count > limit) {
    return { success: false, remaining: 0, reset: bucket.resetTime };
  }

  return {
    success: true,
    remaining: limit - bucket.count,
    reset: bucket.resetTime,
  };
}

/**
 * Fixed-window rate limiter, shared across instances via Redis.
 *
 * This is the only thing standing between the auth endpoints and offline-speed
 * guessing: the password-reset OTP is six digits, and sign-in accepts any
 * handle. An in-process counter gave no protection at all on serverless or
 * behind more than one node, because each cold start began with an empty map.
 *
 * When Redis is down the in-process buckets take over rather than failing the
 * request — a weakened limit is better than a dead login page — and the
 * degradation is logged once by the Redis client itself.
 */
export async function rateLimit(
  req: Request,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const key = clientKey(req);

  try {
    const [count, ttl] = (await redis.eval(
      WINDOW_SCRIPT,
      1,
      key,
      String(windowMs),
    )) as [number, number];

    return verdictFrom(count, ttl, limit, windowMs);
  } catch {
    return memoryLimit(key, limit, windowMs);
  }
}

/**
 * Turns the script's `[count, ttl]` into a verdict.
 *
 * Split out from `rateLimit` so the arithmetic can be tested without a live
 * Redis — getting the boundary wrong by one either lets an extra guess through
 * on every window or rejects a request the user was entitled to.
 */
export function verdictFrom(
  count: number,
  ttlMs: number,
  limit: number,
  windowMs: number,
  now: number = Date.now(),
): RateLimitResult {
  // PTTL answers -1 for a key with no expiry and -2 when it is already gone;
  // neither should happen after the script, but don't project them as a date.
  const reset = now + (ttlMs > 0 ? ttlMs : windowMs);

  if (count > limit) return { success: false, remaining: 0, reset };
  return { success: true, remaining: limit - count, reset };
}
