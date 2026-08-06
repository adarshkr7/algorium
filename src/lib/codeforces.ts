import "server-only";
import { getCachedUserSubmissions, cacheUserSubmissions } from "./redis";

const CF_API = "https://codeforces.com/api";
const DEFAULT_TIMEOUT_MS = 12_000;

export interface CFUser {
  handle: string;
  avatar: string;
  rating: number;
  maxRating: number;
  rank: string;
  maxRank: string;
}

export interface CFProblem {
  contestId: number;
  index: string;
  name: string;
  type?: string;
  rating?: number;
  tags: string[];
}

export interface CFSubmission {
  id: number;
  contestId?: number;
  creationTimeSeconds: number;
  problem: {
    contestId?: number;
    index: string;
    name: string;
    rating?: number;
    tags?: string[];
  };
  verdict?: string; // "OK", "WRONG_ANSWER", "TIME_LIMIT_EXCEEDED", …
  passedTestCount: number;
}

interface CFEnvelope<T> {
  status: "OK" | "FAILED";
  result?: T;
  comment?: string;
}

export class CodeforcesError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "CodeforcesError";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Calls the Codeforces API with a timeout and bounded retries.
 *
 * The public API is flaky under load and answers 403/503 during contests, so
 * every call site previously had its own half-hearted try/catch. This gives
 * all of them the same behaviour: two retries with backoff, then a typed error.
 */
async function cfRequest<T>(
  path: string,
  init: RequestInit & { retries?: number } = {},
): Promise<T> {
  const { retries = 2, ...requestInit } = init;
  let lastError: Error = new CodeforcesError("Unknown Codeforces error", true);

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
      const res = await fetch(`${CF_API}${path}`, {
        ...requestInit,
        signal: controller.signal,
      });

      // 4xx other than 429 will not succeed on retry.
      if (!res.ok && res.status !== 429 && res.status < 500) {
        const body = (await res.json().catch(() => null)) as CFEnvelope<T> | null;
        throw new CodeforcesError(
          body?.comment || `Codeforces returned ${res.status}`,
          false,
        );
      }

      if (!res.ok) {
        throw new CodeforcesError(`Codeforces returned ${res.status}`, true);
      }

      const data = (await res.json()) as CFEnvelope<T>;
      if (data.status !== "OK" || data.result === undefined) {
        throw new CodeforcesError(
          data.comment || "Codeforces request failed",
          false,
        );
      }

      return data.result;
    } catch (error) {
      lastError =
        error instanceof Error ? error : new Error("Codeforces request failed");

      const retryable =
        !(error instanceof CodeforcesError) || error.retryable;

      if (!retryable || attempt === retries) break;
      await sleep(400 * 2 ** attempt);
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError;
}

/** Fetches a Codeforces profile. Returns null when the handle does not exist. */
export async function fetchCFUserInfo(handle: string): Promise<CFUser | null> {
  try {
    const result = await cfRequest<CFUser[]>(
      `/user.info?handles=${encodeURIComponent(handle)}`,
      { cache: "no-store" },
    );
    const user = result?.[0];
    if (!user) return null;

    return {
      handle: user.handle,
      avatar:
        user.avatar ||
        (user as unknown as { titlePhoto?: string }).titlePhoto ||
        "https://codeforces.org/s/0/images/user-alt.png",
      rating: user.rating || 0,
      maxRating: user.maxRating || 0,
      rank: user.rank || "unrated",
      maxRank: user.maxRank || "unrated",
    };
  } catch (error) {
    console.error(`[cf] user.info failed for ${handle}:`, error);
    return null;
  }
}

/** Fetches recent submissions for a handle. Returns [] on failure. */
export async function fetchCFUserSubmissions(
  handle: string,
  count = 200,
): Promise<CFSubmission[]> {
  if (!handle) return [];
  try {
    return await cfRequest<CFSubmission[]>(
      `/user.status?handle=${encodeURIComponent(handle)}&from=1&count=${count}`,
      { cache: "no-store" },
    );
  } catch (error) {
    console.error(`[cf] user.status failed for ${handle}:`, error);
    return [];
  }
}

/**
 * Fetches recent submissions and throws on failure, so login verification can
 * tell the user "Codeforces is unreachable" instead of "no submission found".
 */
export async function fetchCFUserSubmissionsStrict(
  handle: string,
  count = 20,
): Promise<CFSubmission[]> {
  return cfRequest<CFSubmission[]>(
    `/user.status?handle=${encodeURIComponent(handle)}&from=1&count=${count}`,
    { cache: "no-store" },
  );
}

/**
 * Solved problem keys ("contestId-INDEX") for a handle.
 * Checks Redis first; on a miss, pulls from the API and caches in background.
 */
export async function fetchCFUserSolvedKeys(
  handle: string,
): Promise<Set<string>> {
  const cleanHandle = handle?.trim();
  if (!cleanHandle) return new Set<string>();

  const cached = await getCachedUserSubmissions(cleanHandle);
  if (cached) return cached;

  const submissions = await fetchCFUserSubmissions(cleanHandle, 5000);
  const solved = new Set<string>();

  for (const sub of submissions) {
    if (sub.verdict !== "OK" || !sub.problem) continue;
    const contestId = sub.problem.contestId ?? sub.contestId;
    const index = sub.problem.index;
    if (contestId && index) {
      solved.add(`${contestId}-${String(index).trim().toUpperCase()}`);
    }
  }

  void cacheUserSubmissions(cleanHandle, solved).catch(() => {});

  return solved;
}

let problemSetCache: { at: number; problems: CFProblem[] } | null = null;
const PROBLEMSET_TTL_MS = 30 * 60 * 1000;

/**
 * Full Codeforces problemset, memoised in-process for 30 minutes.
 * The payload is ~10k problems, so re-fetching it for every room creation was
 * both slow and a good way to get rate limited.
 */
export async function fetchCFProblemSet(): Promise<CFProblem[]> {
  if (problemSetCache && Date.now() - problemSetCache.at < PROBLEMSET_TTL_MS) {
    return problemSetCache.problems;
  }

  try {
    const result = await cfRequest<{ problems: CFProblem[] }>(
      "/problemset.problems",
      { next: { revalidate: 1800 } } as RequestInit,
    );
    const problems = result?.problems ?? [];
    if (problems.length > 0) {
      problemSetCache = { at: Date.now(), problems };
    }
    return problems;
  } catch (error) {
    console.error("[cf] problemset.problems failed:", error);
    // Serve a stale cache rather than failing room creation outright.
    return problemSetCache?.problems ?? [];
  }
}
