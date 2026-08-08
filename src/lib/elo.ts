/**
 * Algorium duel rating.
 *
 * Standard Elo with a rating-dependent K-factor so new accounts converge fast
 * and established players move slowly. Ratings are clamped at a floor of 100
 * so a losing streak can never push someone to an absurd number.
 */

export const STARTING_ELO = 1200;
export const ELO_FLOOR = 100;

/** Provisional players (few games) swing harder. */
export function kFactor(elo: number, gamesPlayed: number): number {
  if (gamesPlayed < 10) return 48;
  if (elo < 1400) return 32;
  if (elo < 1900) return 24;
  return 16;
}

/** Probability that `a` beats `b`. */
export function expectedScore(a: number, b: number): number {
  return 1 / (1 + Math.pow(10, (b - a) / 400));
}

export interface EloOutcome {
  /** Delta applied to player A. B receives the mirrored delta. */
  deltaA: number;
  deltaB: number;
  newA: number;
  newB: number;
}

/**
 * @param scoreA 1 = A won, 0 = A lost, 0.5 = draw.
 */
export function computeElo(
  eloA: number,
  eloB: number,
  scoreA: 0 | 0.5 | 1,
  gamesA: number,
  gamesB: number,
): EloOutcome {
  const expA = expectedScore(eloA, eloB);
  const expB = 1 - expA;

  const deltaA = Math.round(kFactor(eloA, gamesA) * (scoreA - expA));
  const deltaB = Math.round(kFactor(eloB, gamesB) * (1 - scoreA - expB));

  const newA = Math.max(ELO_FLOOR, eloA + deltaA);
  const newB = Math.max(ELO_FLOOR, eloB + deltaB);

  return {
    deltaA: newA - eloA,
    deltaB: newB - eloB,
    newA,
    newB,
  };
}

export interface EloTier {
  name: string;
  min: number;
  className: string;
}

/**
 * Cosmetic tiers shown on the standings page and profiles.
 *
 * The palette is monochrome, so rank is expressed as a descending
 * contrast/weight ramp — the higher the tier, the brighter and heavier it
 * renders. Keep the steps in order; that ordering *is* the hierarchy.
 */
export const ELO_TIERS: EloTier[] = [
  { name: "Grandmaster", min: 2200, className: "text-white font-extrabold" },
  { name: "Master", min: 1900, className: "text-neutral-200 font-bold" },
  { name: "Expert", min: 1600, className: "text-neutral-300 font-bold" },
  { name: "Specialist", min: 1400, className: "text-neutral-400 font-semibold" },
  { name: "Challenger", min: 1200, className: "text-neutral-500 font-semibold" },
  { name: "Rookie", min: 0, className: "text-neutral-600 font-medium" },
];

export function eloTier(elo: number): EloTier {
  return ELO_TIERS.find((t) => elo >= t.min) ?? ELO_TIERS[ELO_TIERS.length - 1];
}
