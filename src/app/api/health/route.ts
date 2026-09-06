import { prisma } from "@/lib/prisma";
import redis from "@/lib/redis";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/health — for load balancers, uptime checks and container probes.
 *
 * Postgres is the only hard dependency: without it nothing works, so a failure
 * there is a 503 and the instance should be taken out of rotation. Redis is
 * reported but never fails the check — the cache degrades to Codeforces calls
 * and the rate limiter to per-process counters, which is worse but not down.
 *
 * Deliberately terse. A health endpoint is unauthenticated by nature, so it
 * says whether things work, not what or where they are.
 */

const TIMEOUT_MS = 2_000;

type Status = "ok" | "degraded" | "down";

async function withTimeout<T>(work: Promise<T>, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out after ${TIMEOUT_MS}ms`)),
          TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function checkDatabase(): Promise<Status> {
  try {
    await withTimeout(prisma.$queryRaw`SELECT 1`, "database");
    return "ok";
  } catch (error) {
    log.error("database check failed", error, { scope: "api:health" });
    return "down";
  }
}

async function checkRedis(): Promise<Status> {
  try {
    await withTimeout(redis.ping(), "redis");
    return "ok";
  } catch {
    // Not logged: Redis being down already logs once from the client, and a
    // health check every few seconds would drown everything else.
    return "degraded";
  }
}

export async function GET() {
  const started = Date.now();

  const [database, cache] = await Promise.all([checkDatabase(), checkRedis()]);
  const healthy = database === "ok";

  return Response.json(
    {
      status: healthy ? (cache === "ok" ? "ok" : "degraded") : "down",
      checks: { database, cache },
      uptimeSeconds: Math.floor(process.uptime()),
      latencyMs: Date.now() - started,
    },
    {
      status: healthy ? 200 : 503,
      headers: { "Cache-Control": "no-store, max-age=0" },
    },
  );
}
