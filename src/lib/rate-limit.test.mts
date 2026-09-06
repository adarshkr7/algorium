import { verdictFrom } from "./rate-limit";

/**
 * The window arithmetic, which decides whether a request is the one that gets
 * refused. The live Redis round trip is not covered here — see the note at the
 * bottom about what still needs a real server.
 */

const NOW = 1_700_000_000_000;

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

console.log("rate-limit / verdictFrom");

check(
  "first request in a window is allowed",
  verdictFrom(1, 60_000, 3, 60_000, NOW),
  { success: true, remaining: 2, reset: NOW + 60_000 },
);

check(
  "the request that exactly reaches the limit is still allowed",
  verdictFrom(3, 40_000, 3, 60_000, NOW),
  { success: true, remaining: 0, reset: NOW + 40_000 },
);

check(
  "the request past the limit is refused",
  verdictFrom(4, 40_000, 3, 60_000, NOW),
  { success: false, remaining: 0, reset: NOW + 40_000 },
);

check(
  "reset comes from the key's real ttl, not the nominal window",
  verdictFrom(2, 12_345, 5, 60_000, NOW).reset,
  NOW + 12_345,
);

// PTTL returns -1 (no expiry set) and -2 (key gone). Neither should follow the
// script, but projecting them as a date would hand the client a Retry-After in
// the past and invite an immediate retry.
check(
  "a missing ttl falls back to a full window rather than the past",
  verdictFrom(4, -1, 3, 60_000, NOW),
  { success: false, remaining: 0, reset: NOW + 60_000 },
);

check(
  "an expired-key ttl also falls back to a full window",
  verdictFrom(4, -2, 3, 60_000, NOW),
  { success: false, remaining: 0, reset: NOW + 60_000 },
);

check(
  "a limit of one refuses the second request",
  verdictFrom(2, 5_000, 1, 60_000, NOW),
  { success: false, remaining: 0, reset: NOW + 5_000 },
);

console.log(`\n${pass} passed, ${fail} failed`);
console.log(
  "\nNot covered here: that the Lua script itself increments and expires\n" +
    "correctly on a real server. Run this suite against a live Redis, or hit\n" +
    "any rate-limited route more times than its limit with REDIS_URL set,\n" +
    "before trusting the shared-counter path in production.",
);

// Importing this module opens the shared Redis client, whose socket would
// otherwise keep the process alive after the assertions are done.
process.exit(fail > 0 ? 1 : 0);
