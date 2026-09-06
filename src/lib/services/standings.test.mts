import {
  calculateStandings,
  compareStats,
  determineWinner,
  primaryScore,
  problemPoints,
  PENALTY_PER_WRONG_MINUTES,
  type StandingsContest,
  type StandingsSubmission,
} from "./standings";

/**
 * Scoring is what decides who won a duel and, through `finishContest`, what
 * happens to both players' ratings. It is also pure, so it is the cheapest
 * thing in the codebase to pin down.
 */

const P1 = { id: "p1", handle: "alice" };
const P2 = { id: "p2", handle: "bob" };

const problems = [
  { id: "A", indexInContest: 0 },
  { id: "B", indexInContest: 1 },
  { id: "C", indexInContest: 2 },
];

/** `at` is minutes from the contest start. */
const sub = (
  userId: string,
  problemId: string,
  verdict: string,
  at: number,
): StandingsSubmission => ({
  userId,
  problemId,
  verdict,
  timeSubmitted: new Date(Date.UTC(2026, 0, 1, 0, at)).toISOString(),
  solveTimeSeconds: verdict === "OK" ? at * 60 : null,
});

const contest = (
  over: Partial<StandingsContest> = {},
  submissions: StandingsSubmission[] = [],
): StandingsContest => ({
  mode: "CLASSIC",
  pointingSystem: "ICPC",
  problems,
  submissions,
  participants: [{ userId: "p1" }, { userId: "p2" }],
  ...over,
});

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

console.log("standings / scoring");

check("points ramp 100, 200, 300 by index", [0, 1, 2].map(problemPoints), [
  100, 200, 300,
]);

{
  const c = contest({}, [sub("p1", "A", "OK", 10)]);
  const s = calculateStandings(c, P1, P2);
  check("one clean solve at 10 minutes costs 10 penalty", s.host.penaltyMinutes, 10);
  check("and counts as one accepted", s.host.acceptedCount, 1);
  check("the opponent scores nothing", s.guest.acceptedCount, 0);
}

{
  // Two rejects, then an accept: 20 minutes of solve time plus 2 x 20 penalty.
  const c = contest({}, [
    sub("p1", "A", "WRONG_ANSWER", 5),
    sub("p1", "A", "TIME_LIMIT_EXCEEDED", 12),
    sub("p1", "A", "OK", 20),
  ]);
  const s = calculateStandings(c, P1, P2);
  check(
    "wrong answers before the AC each add the penalty",
    s.host.penaltyMinutes,
    20 + 2 * PENALTY_PER_WRONG_MINUTES,
  );
  check("and are counted", s.host.wrongSubsBeforeAC, 2);
}

{
  // A reject *after* the accept is not the contestant's problem.
  const c = contest({}, [
    sub("p1", "A", "OK", 10),
    sub("p1", "A", "WRONG_ANSWER", 30),
  ]);
  const s = calculateStandings(c, P1, P2);
  check("a wrong answer after the AC is not penalised", s.host.penaltyMinutes, 10);
  check("and is not counted", s.host.wrongSubsBeforeAC, 0);
}

{
  const c = contest({ mode: "LOCKOUT", problems: [
    { id: "A", indexInContest: 0, lockedWinnerId: "p1" },
    { id: "B", indexInContest: 1, lockedWinnerId: "p2" },
    { id: "C", indexInContest: 2, lockedWinnerId: "p1" },
  ] });
  const s = calculateStandings(c, P1, P2);
  check("lockout counts problems claimed, not solved", [s.host.lockedWon, s.guest.lockedWon], [2, 1]);
  check("primary score follows the mode", primaryScore(c, s.host), 2);
  check("winner is whoever locked more", determineWinner(c, s), "p1");
}

{
  const c = contest({ pointingSystem: "POINTS" }, [
    sub("p1", "A", "OK", 5),
    sub("p2", "C", "OK", 5),
  ]);
  const s = calculateStandings(c, P1, P2);
  check("points scale with problem index", [s.host.points, s.guest.points], [100, 300]);
  check("the harder problem wins it", determineWinner(c, s), "p2");
}

{
  // Same solve count; penalty is the tie-break.
  const c = contest({}, [
    sub("p1", "A", "WRONG_ANSWER", 1),
    sub("p1", "A", "OK", 10),
    sub("p2", "A", "OK", 12),
  ]);
  const s = calculateStandings(c, P1, P2);
  check("equal solves fall through to penalty", determineWinner(c, s), "p2");
}

{
  const c = contest({}, [sub("p1", "A", "OK", 10), sub("p2", "B", "OK", 10)]);
  const s = calculateStandings(c, P1, P2);
  check("identical performances are a draw", determineWinner(c, s), null);
}

{
  const c = contest(
    { participants: [{ userId: "p1", hasResigned: true }, { userId: "p2" }] },
    [sub("p1", "A", "OK", 1), sub("p1", "B", "OK", 2), sub("p1", "C", "OK", 3)],
  );
  const s = calculateStandings(c, P1, P2);
  check("resigning loses the duel however well you were doing", determineWinner(c, s), "p2");
}

{
  const c = contest({
    participants: [
      { userId: "p1", hasResigned: true },
      { userId: "p2", hasResigned: true },
    ],
  });
  const s = calculateStandings(c, P1, P2);
  check("both resigning is a draw", determineWinner(c, s), null);
}

{
  // A solo run, or a room the opponent never joined.
  const c = contest({}, [sub("p1", "A", "OK", 5)]);
  const s = calculateStandings(c, P1, null);
  check("a missing opponent yields no winner", determineWinner(c, s), null);
  check("and empty stats rather than a crash", s.guest.acceptedCount, 0);
}

{
  const c = contest();
  const a = { ...calculateStandings(c, P1, P2).host, acceptedCount: 3, penaltyMinutes: 90 };
  const b = { ...calculateStandings(c, P1, P2).guest, acceptedCount: 3, penaltyMinutes: 40 };
  check("the comparator agrees with the winner rules", Math.sign(compareStats(c, a, b)), 1);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
