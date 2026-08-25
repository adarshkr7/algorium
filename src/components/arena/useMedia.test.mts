import { collectReportableSuspects } from "./useMedia";
import type { MediaSnapshot } from "@/lib/services/broadcast";

const ME = "me";
const OPP = "opp";
const SUP = "sup";

const snap = (
  userId: string,
  over: Partial<MediaSnapshot> = {},
): MediaSnapshot => ({
  userId,
  handle: userId,
  role: userId === SUP ? "SUPERVISOR" : "PLAYER_1",
  videoOn: true,
  audioOn: true,
  compliant: true,
  violationSince: null,
  ...over,
});

let pass = 0;
let fail = 0;
const check = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${label}${ok ? "" : `  got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
  if (ok) pass++;
  else fail++;
};

const fresh = () => ({
  seen: new Set<string>(),
  suspectSince: new Map<string, number>(),
  reported: new Set<string>(),
});

const run = (
  state: ReturnType<typeof fresh>,
  now: number,
  roster: MediaSnapshot[],
  remotes: { userId: string; videoOn: boolean; audioOn: boolean }[],
  graceMs = 30_000,
) =>
  collectReportableSuspects({
    now,
    userId: ME,
    roster: Object.fromEntries(roster.map((r) => [r.userId, r])),
    remotes,
    ...state,
    requireVideo: true,
    requireAudio: false,
    graceMs,
  }).map((d) => d.userId);

// ── 1. Everyone compliant -> nothing reported, ever.
{
  const s = fresh();
  const r = [snap(ME), snap(OPP)];
  const m = [{ userId: OPP, videoOn: true, audioOn: true }];
  check("compliant: t=0", run(s, 0, r, m), []);
  check("compliant: t=60s", run(s, 60_000, r, m), []);
}

// ── 2. Roster says opponent non-compliant -> reported only after grace.
{
  const s = fresh();
  const r = [snap(ME), snap(OPP, { compliant: false, videoOn: false })];
  const m = [{ userId: OPP, videoOn: false, audioOn: true }];
  check("violation: t=0 starts clock", run(s, 0, r, m), []);
  check("violation: t=29s still inside grace", run(s, 29_000, r, m), []);
  check("violation: t=31s reported", run(s, 31_000, r, m), [OPP]);
  check("violation: t=32s not repeated", run(s, 32_000, r, m), []);
}

// ── 3. Recovery resets the clock; a later lapse is a new incident.
{
  const s = fresh();
  const bad = [snap(ME), snap(OPP, { compliant: false, videoOn: false })];
  const good = [snap(ME), snap(OPP)];
  const mBad = [{ userId: OPP, videoOn: false, audioOn: true }];
  const mGood = [{ userId: OPP, videoOn: true, audioOn: true }];
  run(s, 0, bad, mBad);
  check("recovery: back on at t=10s", run(s, 10_000, good, mGood), []);
  check("recovery: off again at t=20s, clock restarts", run(s, 20_000, bad, mBad), []);
  check("recovery: t=45s still inside new grace", run(s, 45_000, bad, mBad), []);
  check("recovery: t=51s reported as a new incident", run(s, 51_000, bad, mBad), [OPP]);
}

// ── 4. Closed tab: roster still lists them, LiveKit no longer does.
{
  const s = fresh();
  const r = [snap(ME), snap(OPP, { compliant: false, videoOn: false })];
  run(s, 0, r, [{ userId: OPP, videoOn: true, audioOn: true }]); // seen once
  check("closed tab: t=0 vanished, clock starts", run(s, 0, r, []), []);
  check("closed tab: t=31s reported", run(s, 31_000, r, []), [OPP]);
}

// ── 5. A supervisor is never a suspect.
{
  const s = fresh();
  const r = [snap(ME), snap(SUP, { compliant: false, videoOn: false })];
  run(s, 0, r, []);
  check("supervisor exempt at t=60s", run(s, 60_000, r, []), []);
}

// ── 6. I am never my own suspect.
{
  const s = fresh();
  const r = [snap(ME, { compliant: false, videoOn: false })];
  run(s, 0, r, []);
  check("self never reported", run(s, 60_000, r, []), []);
}

// ── 7. Someone who never connected is not treated as absent.
{
  const s = fresh();
  // Not in the roster at all -> unknown, not a suspect.
  check("never-joined ignored", run(s, 60_000, [snap(ME)], []), []);
}

// ── 8. Audio-only policy ignores a dark camera.
{
  const s = fresh();
  const r = [snap(ME), snap(OPP)];
  const m = [{ userId: OPP, videoOn: false, audioOn: true }];
  const audioOnly = () =>
    collectReportableSuspects({
      now: 60_000,
      userId: ME,
      roster: Object.fromEntries(r.map((x) => [x.userId, x])),
      remotes: m,
      ...s,
      requireVideo: false,
      requireAudio: true,
      graceMs: 30_000,
    }).map((d) => d.userId);
  check("audio-only policy ignores camera", audioOnly(), []);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
