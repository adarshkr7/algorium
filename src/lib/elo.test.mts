import {
  computeElo,
  eloTier,
  expectedScore,
  kFactor,
  ELO_FLOOR,
  ELO_TIERS,
  STARTING_ELO,
} from "./elo";

let pass = 0;
let fail = 0;
const check = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(
    `${ok ? "  ok  " : "  FAIL"}  ${label}${ok ? "" : `  got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`,
  );
  if (ok) pass++;
  else fail++;
};
const near = (label: string, got: number, want: number, tol = 1e-9) => {
  const ok = Math.abs(got - want) <= tol;
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${label}${ok ? "" : `  got ${got} want ~${want}`}`);
  if (ok) pass++;
  else fail++;
};

console.log("elo");

near("equal ratings are an even match", expectedScore(1200, 1200), 0.5);
near("400 points ahead is a 10:1 favourite", expectedScore(1600, 1200), 10 / 11, 1e-12);
check(
  "expectations are symmetric",
  Number((expectedScore(1500, 1300) + expectedScore(1300, 1500)).toFixed(12)),
  1,
);

check("provisional accounts swing hardest", kFactor(1200, 0), 48);
check("and stop being provisional at ten games", kFactor(1200, 10), 32);
check("mid ratings move less", kFactor(1500, 50), 24);
check("high ratings move least", kFactor(2000, 50), 16);

{
  // Even match, decided: the winner gains exactly what the loser drops.
  const r = computeElo(1200, 1200, 1, 50, 50);
  check("an even win is +16 / -16 at K=32", [r.deltaA, r.deltaB], [16, -16]);
  check("deltas cancel", r.deltaA + r.deltaB, 0);
  check("new ratings follow the deltas", [r.newA, r.newB], [1216, 1184]);
}

{
  const r = computeElo(1200, 1200, 0.5, 50, 50);
  check("an even draw moves nobody", [r.deltaA, r.deltaB], [0, 0]);
}

{
  // Beating a much stronger opponent should pay more than beating a peer.
  const upset = computeElo(1200, 1600, 1, 50, 50);
  const expected = computeElo(1200, 1200, 1, 50, 50);
  check(
    "an upset pays more than an even win",
    upset.deltaA > expected.deltaA,
    true,
  );
}

{
  // Losing to someone far weaker should cost more than losing to a peer.
  const collapse = computeElo(1600, 1200, 0, 50, 50);
  const ordinary = computeElo(1600, 1600, 0, 50, 50);
  check(
    "losing to a weaker player costs more",
    collapse.deltaA < ordinary.deltaA,
    true,
  );
}

{
  // A provisional player and an established one move by different amounts for
  // the same result, which is the whole point of the K-factor.
  const r = computeElo(1200, 1200, 1, 0, 200);
  check("the provisional side moves further", Math.abs(r.deltaA) > Math.abs(r.deltaB), true);
  check("so the deltas no longer cancel", r.deltaA + r.deltaB !== 0, true);
}

{
  // Losing a match you were never expected to win costs nothing: the expected
  // score is ~0, so there is no rating to surrender.
  const r = computeElo(120, 2400, 0, 50, 50);
  check("a hopeless loss is free", r.deltaA, 0);
  check("and leaves the rating alone", r.newA, 120);
}

{
  // The floor must hold, and the reported delta must match what was actually
  // applied — otherwise MatchHistory.eloChange disagrees with the rating it
  // produced, and a profile's history stops adding up to its rating.
  // Raw drop here is -25, from 120, which the floor clips to -20.
  const r = computeElo(120, 100, 0, 0, 50);
  check("a loss cannot push a rating below the floor", r.newA, ELO_FLOOR);
  check(
    "and the delta reports the distance actually fallen, not the raw one",
    r.deltaA,
    ELO_FLOOR - 120,
  );
  check("delta always equals new minus old", r.newA - 120, r.deltaA);
}

check("new accounts start as Challenger", eloTier(STARTING_ELO).name, "Challenger");
check("the floor is Rookie", eloTier(ELO_FLOOR).name, "Rookie");
check("2200 is Grandmaster", eloTier(2200).name, "Grandmaster");
check("1899 is still Expert", eloTier(1899).name, "Expert");
check(
  "tiers are listed high to low, which is what makes lookup work",
  ELO_TIERS.every((t, i) => i === 0 || ELO_TIERS[i - 1].min > t.min),
  true,
);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
