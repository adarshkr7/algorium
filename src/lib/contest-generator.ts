import "server-only";
import {
  fetchCFProblemSet,
  fetchCFUserSolvedKeys,
  type CFProblem,
} from "./codeforces";

export type TagMatchMode = "ANY" | "ALL";

export interface GenerateContestOptions {
  name: string;
  mode: "BLITZ" | "CLASSIC" | "LOCKOUT";
  problemCount: number;
  durationMinutes: number;
  minRating: number;
  maxRating: number;
  allowedTags: string[];
  excludedTags: string[];
  /** ANY = at least one allowed tag, ALL = every allowed tag. */
  tagMatchMode?: TagMatchMode;
  /** Exact per-problem ratings. When present, overrides min/max. */
  ratings?: number[];
  seed?: string;
  hostHandle: string;
  guestHandle?: string;
}

export interface GeneratedProblem {
  problemKey: string; // e.g. "1800-A"
  name: string;
  rating: number;
  tags: string[];
  indexInContest: number;
}

/** Deterministic PRNG so a given seed always yields the same problem set. */
function seededRandom(seedStr: string) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 16777619);
  }
  return function next() {
    h += h << 13;
    h ^= h >>> 7;
    h += h << 3;
    h ^= h >>> 17;
    return ((h += h << 5) >>> 0) / 4294967296;
  };
}

function shuffleArray<T>(array: T[], randomFn: () => number): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(randomFn() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Ambiguous characters (0/O, 1/I) are excluded so codes are easy to read out. */
export function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

const problemKeyOf = (p: CFProblem) =>
  `${p.contestId}-${String(p.index).trim().toUpperCase()}`;

/**
 * Selects problems matching the contest configuration.
 *
 * Hard rules:
 *  - official problems only (contestId < 10000)
 *  - no interactive or *special problems (they can't be judged fairly here)
 *  - neither player may have an accepted submission for it already
 *  - older problems (contestId <= 1500) are preferred when there are enough,
 *    since recent problems are more likely to have been seen in practice
 */
export function filterAndSelectProblems(
  allProblems: CFProblem[],
  solvedKeysHost: Set<string>,
  solvedKeysGuest: Set<string>,
  options: GenerateContestOptions,
): GeneratedProblem[] {
  const {
    problemCount,
    minRating,
    maxRating,
    allowedTags,
    excludedTags,
    tagMatchMode = "ANY",
    ratings,
    seed,
  } = options;

  const randomFn = seed ? seededRandom(seed) : Math.random;
  const takenKeys = new Set<string>();

  const isEligible = (
    prob: CFProblem,
    checkRating: boolean,
    targetRating?: number,
  ): boolean => {
    if (!prob.contestId || !prob.index || !prob.name) return false;
    if (prob.contestId >= 10000) return false;

    const key = problemKeyOf(prob);
    if (takenKeys.has(key)) return false;

    const tags = prob.tags ?? [];
    if (
      tags.includes("*special") ||
      tags.includes("interactive") ||
      prob.name.toLowerCase().includes("interactive")
    ) {
      return false;
    }

    const rating = prob.rating ?? 1200;
    if (checkRating) {
      if (targetRating !== undefined) {
        if (rating !== targetRating) return false;
      } else if (rating < minRating || rating > maxRating) {
        return false;
      }
    }

    if (excludedTags.length > 0 && excludedTags.some((t) => tags.includes(t))) {
      return false;
    }

    if (allowedTags.length > 0) {
      const matches =
        tagMatchMode === "ALL"
          ? allowedTags.every((t) => tags.includes(t))
          : allowedTags.some((t) => tags.includes(t));
      if (!matches) return false;
    }

    // Neither contestant may have solved it before.
    if (solvedKeysHost.has(key) || solvedKeysGuest.has(key)) return false;

    return true;
  };

  const preferOlder = (candidates: CFProblem[], needed: number) => {
    const older = candidates.filter((p) => p.contestId <= 1500);
    const pool = older.length >= needed ? older : candidates;
    return shuffleArray(pool, randomFn);
  };

  const toGenerated = (
    problems: CFProblem[],
    sortByRating: boolean,
  ): GeneratedProblem[] => {
    const list = sortByRating
      ? [...problems].sort((a, b) => (a.rating ?? 0) - (b.rating ?? 0))
      : problems;

    return list.map((prob, idx) => ({
      problemKey: problemKeyOf(prob),
      name: prob.name,
      rating: prob.rating ?? 1200,
      tags: prob.tags ?? [],
      indexInContest: idx,
    }));
  };

  // ── Exact-ratings mode: one problem per requested rating ────────────────
  if (ratings && ratings.length > 0) {
    const picked: CFProblem[] = [];

    for (const target of ratings) {
      let candidates = allProblems.filter((p) => isEligible(p, true, target));

      // Widen to ±100 if that exact rating has nothing left.
      if (candidates.length === 0) {
        candidates = allProblems.filter(
          (p) =>
            isEligible(p, false) &&
            Math.abs((p.rating ?? 1200) - target) <= 100,
        );
      }
      // Last resort: ±200.
      if (candidates.length === 0) {
        candidates = allProblems.filter(
          (p) =>
            isEligible(p, false) &&
            Math.abs((p.rating ?? 1200) - target) <= 200,
        );
      }

      const shuffled = preferOlder(candidates, 1);
      if (shuffled.length > 0) {
        picked.push(shuffled[0]);
        takenKeys.add(problemKeyOf(shuffled[0]));
      }
    }

    return toGenerated(picked, false);
  }

  // ── Range mode ───────────────────────────────────────────────────────────
  const eligible = allProblems.filter((p) => isEligible(p, true));
  const selected = preferOlder(eligible, problemCount).slice(0, problemCount);
  selected.forEach((p) => takenKeys.add(problemKeyOf(p)));

  return toGenerated(selected, true);
}

/**
 * Fetches everything needed and produces the problem set, progressively
 * relaxing constraints rather than failing outright:
 *   1. exactly as configured
 *   2. drop the tag filters
 *   3. widen the rating window by ±400
 */
export async function generateContest(
  options: GenerateContestOptions,
): Promise<GeneratedProblem[]> {
  const [allProblems, hostSolved, guestSolved] = await Promise.all([
    fetchCFProblemSet(),
    fetchCFUserSolvedKeys(options.hostHandle),
    options.guestHandle
      ? fetchCFUserSolvedKeys(options.guestHandle)
      : Promise.resolve(new Set<string>()),
  ]);

  if (allProblems.length === 0) return [];

  const attempts: GenerateContestOptions[] = [
    options,
    { ...options, allowedTags: [], excludedTags: [] },
    {
      ...options,
      allowedTags: [],
      excludedTags: [],
      minRating: Math.max(800, options.minRating - 400),
      maxRating: Math.min(3500, options.maxRating + 400),
    },
  ];

  let best: GeneratedProblem[] = [];

  for (const attempt of attempts) {
    const problems = filterAndSelectProblems(
      allProblems,
      hostSolved,
      guestSolved,
      attempt,
    );
    if (problems.length > best.length) best = problems;
    if (best.length >= options.problemCount) break;
  }

  return best.slice(0, options.problemCount);
}

/**
 * Re-checks the generated set once the second player joins. If either player
 * has already solved one of the problems, the whole set is regenerated using
 * both histories.
 */
export async function verifyAndReplaceSolvedProblems(
  existingProblems: GeneratedProblem[],
  hostHandle: string,
  guestHandle: string,
  options: GenerateContestOptions,
): Promise<GeneratedProblem[]> {
  const [hostSolved, guestSolved] = await Promise.all([
    fetchCFUserSolvedKeys(hostHandle),
    fetchCFUserSolvedKeys(guestHandle),
  ]);

  const stale = existingProblems.some(
    (p) => hostSolved.has(p.problemKey) || guestSolved.has(p.problemKey),
  );
  if (!stale) return existingProblems;

  return generateContest({ ...options, hostHandle, guestHandle });
}
