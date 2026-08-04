import "server-only";
import { NextRequest } from "next/server";

interface RateLimitStore {
  count: number;
  resetTime: number;
}

const store = new Map<string, RateLimitStore>();

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of store.entries()) {
    if (now > value.resetTime) {
      store.delete(key);
    }
  }
}, 5 * 60 * 1000);

export function rateLimit(req: NextRequest | Request, limit: number, windowMs: number) {
  // Try to get IP from headers
  const headersList = req.headers;
  const ip = headersList.get("x-forwarded-for") || headersList.get("x-real-ip") || "unknown";
  
  // Use a combination of path and IP for the key
  const url = new URL(req.url);
  const key = `${url.pathname}-${ip}`;

  const now = Date.now();
  let record = store.get(key);

  if (!record || now > record.resetTime) {
    record = {
      count: 1,
      resetTime: now + windowMs,
    };
    store.set(key, record);
    return { success: true, remaining: limit - 1, reset: record.resetTime };
  }

  record.count++;
  store.set(key, record);

  if (record.count > limit) {
    return { success: false, remaining: 0, reset: record.resetTime };
  }

  return { success: true, remaining: limit - record.count, reset: record.resetTime };
}
