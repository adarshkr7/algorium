import "server-only";

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  reset: number;
}

interface Bucket {
  count: number;
  resetTime: number;
}

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
  return `${pathname}::${ip}`;
}

/**
 * Fixed-window in-memory rate limiter.
 *
 * NOTE: state lives in the process, so on a multi-instance deployment each
 * instance keeps its own counters. For a single Next.js node this is fine;
 * move the buckets into Redis (already a dependency) if you scale out.
 */
export function rateLimit(
  req: Request,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const key = clientKey(req);
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
