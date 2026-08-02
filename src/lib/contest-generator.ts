import {
  fetchCFProblemSet,
  fetchCFUserSolvedKeys,
  CFProblem,
} from "./codeforces";

export interface GenerateContestOptions {
  name: string;
  mode: "BLITZ" | "CLASSIC";
  problemCount: number;
  durationMinutes: number;
  minRating: number;
  maxRating: number;
  allowedTags: string[];
  excludedTags: string[];
  ratings?: number[]; // NEW: array of exact ratings
  seed?: string;
  hostHandle: string;
  guestHandle?: string;
  preferOldProblems?: boolean;
}

export interface GeneratedProblem {
  problemKey: string; // e.g. "1800-A"
  name: string;
  rating: number;
  tags: string[];
  indexInContest: number;
}

/**
 * Seeded PRNG for reproducible problem selection when a seed is supplied.
 */
function seededRandom(seedStr: string) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 16777619);
  }
  return function () {
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

/**
 * Generates a unique 6-character room code consisting of uppercase letters and digits.
 */
export function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Selects problems for a contest based on parameters and player submission histories.
 * Enforces:
 * - Only official Codeforces problems (contestId < 10000)
 * - Prefers OLDER problems (contestId <= 1500 or sorting by contestId ascending/classic)
 * - Strict verification that NEITHER player has solved the problem before (verdict === OK)
 */
export function filterAndSelectProblems(
  allProblems: CFProblem[],
  solvedKeysHost: Set<string>,
  solvedKeysGuest: Set<string>,
  options: GenerateContestOptions
): GeneratedProblem[] {
  const {
    problemCount,
    minRating,
    maxRating,
    allowedTags,
    excludedTags,
    ratings,
    seed,
  } = options;

  const randomFn = seed ? seededRandom(seed) : Math.random;
  const seenKeys = new Set<string>();

  const isValidCandidate = (prob: CFProblem, checkRating: boolean, targetRating?: number) => {
    if (!prob.contestId || !prob.index || !prob.name) return false;
    if (prob.contestId >= 10000) return false;

    const formattedIndex = String(prob.index).trim().toUpperCase();
    const key = `${prob.contestId}-${formattedIndex}`;
    
    if (seenKeys.has(key)) return false;
    
    const tags = prob.tags || [];
    if (
      tags.includes("*special") ||
      tags.includes("interactive") ||
      prob.name.toLowerCase().includes("interactive")
    ) return false;
    
    const rating = prob.rating || 1200;

    if (checkRating) {
      if (targetRating !== undefined) {
         if (rating !== targetRating) return false;
      } else {
         if (rating < minRating || rating > maxRating) return false;
      }
    }

    if (excludedTags.length > 0) {
      if (excludedTags.some((exTag) => tags.includes(exTag))) return false;
    }

    if (allowedTags.length > 0) {
      if (!allowedTags.some((alTag) => tags.includes(alTag))) return false;
    }

    // 7. VERIFICATION: Neither player has solved this problem before!
    if (solvedKeysHost.has(key) || solvedKeysGuest.has(key)) return false;

    return true;
  };

  const getBestCandidates = (candidates: CFProblem[], neededCount: number) => {
    const oldCandidates = candidates.filter((p) => p.contestId <= 1500);
    const poolToUse = oldCandidates.length >= neededCount ? oldCandidates : candidates;
    return shuffleArray(poolToUse, randomFn);
  };

  if (ratings && ratings.length > 0) {
    const selectedProblems: CFProblem[] = [];
    
    for (const targetRating of ratings) {
        let candidates = allProblems.filter((p) => isValidCandidate(p, true, targetRating));
        
        // If not found, fallback to targetRating ± 100
        if (candidates.length === 0) {
           candidates = allProblems.filter((p) => isValidCandidate(p, false));
           candidates = candidates.filter(p => {
               const r = p.rating || 1200;
               return Math.abs(r - targetRating) <= 100;
           });
        }

        const shuffled = getBestCandidates(candidates, 1);
        if (shuffled.length > 0) {
            const picked = shuffled[0];
            selectedProblems.push(picked);
            seenKeys.add(`${picked.contestId}-${String(picked.index).trim().toUpperCase()}`);
        }
    }
    
    return selectedProblems.map((prob, idx) => ({
      problemKey: `${prob.contestId}-${String(prob.index).trim().toUpperCase()}`,
      name: prob.name,
      rating: prob.rating || 1200,
      tags: prob.tags || [],
      indexInContest: idx,
    }));
  }

  // RANGE MODE
  const validCandidates = allProblems.filter(p => isValidCandidate(p, true));
  const shuffled = getBestCandidates(validCandidates, problemCount);
  const selected = shuffled.slice(0, problemCount);
  selected.sort((a, b) => (a.rating || 0) - (b.rating || 0));

  return selected.map((prob, idx) => ({
    problemKey: `${prob.contestId}-${String(prob.index).trim().toUpperCase()}`,
    name: prob.name,
    rating: prob.rating || 1200,
    tags: prob.tags || [],
    indexInContest: idx,
  }));
}

/**
 * Main helper to fetch data and generate contest problems.
 */
export async function generateContest(
  options: GenerateContestOptions
): Promise<GeneratedProblem[]> {
  const [allProblems, hostSolved, guestSolved] = await Promise.all([
    fetchCFProblemSet(),
    fetchCFUserSolvedKeys(options.hostHandle),
    options.guestHandle ? fetchCFUserSolvedKeys(options.guestHandle) : Promise.resolve(new Set<string>()),
  ]);

  let problems = filterAndSelectProblems(allProblems, hostSolved, guestSolved, options);

  // Fallback if tag constraints were too restrictive
  if (problems.length < options.problemCount) {
    console.warn("Fewer problems found than requested; relaxing tag constraints.");
    const fallbackOptions = { ...options, allowedTags: [], excludedTags: [] };
    problems = filterAndSelectProblems(allProblems, hostSolved, guestSolved, fallbackOptions);
  }

  return problems.slice(0, options.problemCount);
}

/**
 * Re-verifies problems when guest joins. If any problem was already solved by host or guest,
 * replaces it with a fresh unsolved problem.
 */
export async function verifyAndReplaceSolvedProblems(
  existingProblems: GeneratedProblem[],
  hostHandle: string,
  guestHandle: string,
  options: GenerateContestOptions
): Promise<GeneratedProblem[]> {
  const [hostSolved, guestSolved] = await Promise.all([
    fetchCFUserSolvedKeys(hostHandle),
    fetchCFUserSolvedKeys(guestHandle),
  ]);

  const hasSolvedProblem = existingProblems.some(
    (p) => hostSolved.has(p.problemKey) || guestSolved.has(p.problemKey)
  );

  if (!hasSolvedProblem) {
    return existingProblems;
  }

  // Regenerate clean problem set using both solved histories
  return generateContest({
    ...options,
    hostHandle,
    guestHandle,
  });
}
