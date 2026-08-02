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
  verdict?: string; // "OK", "WRONG_ANSWER", "TIME_LIMIT_EXCEEDED", etc.
  passedTestCount: number;
}

/**
 * Fetches Codeforces user profile information for one or more handles.
 */
export async function fetchCFUserInfo(handle: string): Promise<CFUser | null> {
  try {
    const res = await fetch(
      `https://codeforces.com/api/user.info?handles=${encodeURIComponent(handle)}`,
      { cache: "no-store" }
    );
    const data = await res.json();
    if (data.status !== "OK" || !data.result || data.result.length === 0) {
      return null;
    }
    const user = data.result[0];
    return {
      handle: user.handle,
      avatar: user.avatar || user.titlePhoto || "https://codeforces.org/s/0/images/user-alt.png",
      rating: user.rating || 0,
      maxRating: user.maxRating || 0,
      rank: user.rank || "unrated",
      maxRank: user.maxRank || "unrated",
    };
  } catch (error) {
    console.error("Error fetching CF user info:", error);
    return null;
  }
}

/**
 * Fetches recent submissions for a Codeforces user handle.
 */
export async function fetchCFUserSubmissions(
  handle: string,
  count = 5000
): Promise<CFSubmission[]> {
  try {
    const res = await fetch(
      `https://codeforces.com/api/user.status?handle=${encodeURIComponent(handle)}&from=1&count=${count}`,
      { cache: "no-store" }
    );
    const data = await res.json();
    if (data.status !== "OK" || !data.result) {
      return [];
    }
    return data.result as CFSubmission[];
  } catch (error) {
    console.error(`Error fetching CF user status for ${handle}:`, error);
    return [];
  }
}

/**
 * Fetches solved problem keys ("contestId-INDEX") for a Codeforces user handle.
 * Robustly normalizes keys to ensure case-insensitive matching.
 */
export async function fetchCFUserSolvedKeys(handle: string): Promise<Set<string>> {
  if (!handle || !handle.trim()) return new Set<string>();
  const submissions = await fetchCFUserSubmissions(handle.trim(), 5000);
  const solved = new Set<string>();

  for (const sub of submissions) {
    if (sub.verdict === "OK" && sub.problem) {
      const contestId = sub.problem.contestId || sub.contestId;
      const index = sub.problem.index;
      if (contestId && index) {
        const key = `${contestId}-${String(index).trim().toUpperCase()}`;
        solved.add(key);
      }
    }
  }

  return solved;
}

/**
 * Fetches full Codeforces problemset.
 */
export async function fetchCFProblemSet(): Promise<CFProblem[]> {
  try {
    const res = await fetch("https://codeforces.com/api/problemset.problems", {
      next: { revalidate: 1800 },
    });
    const data = await res.json();
    if (data.status !== "OK" || !data.result || !data.result.problems) {
      return [];
    }
    return data.result.problems as CFProblem[];
  } catch (error) {
    console.error("Error fetching CF problem set:", error);
    return [];
  }
}
