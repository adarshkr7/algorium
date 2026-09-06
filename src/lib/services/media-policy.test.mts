import {
  describeRequirement,
  isCompliant,
  isContestant,
  mediaRequired,
  missingDevices,
} from "./media-policy";

/**
 * These four predicates decide whether the host can start a proctored contest
 * and, under a FORFEIT policy, whether someone loses one. Only the pure ones
 * are covered here — `recordMediaState` writes to the database and belongs in
 * an integration test.
 */

const OFF = { videoOn: false, audioOn: false };
const ON = { videoOn: true, audioOn: true };

const BOTH = { requireVideo: true, requireAudio: true };
const VIDEO = { requireVideo: true, requireAudio: false };
const AUDIO = { requireVideo: false, requireAudio: true };
const NEITHER = { requireVideo: false, requireAudio: false };

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

console.log("media-policy");

check("the four seats that compete are contestants",
  ["HOST", "GUEST", "PLAYER_1", "PLAYER_2"].map(isContestant), [true, true, true, true]);
check("a supervisor is not", isContestant("SUPERVISOR"), false);
check("nor is anything unrecognised", isContestant("SPECTATOR"), false);

check("either toggle makes a room proctored",
  [mediaRequired(BOTH), mediaRequired(VIDEO), mediaRequired(AUDIO)], [true, true, true]);
check("neither toggle does not", mediaRequired(NEITHER), false);

// The important asymmetry: a supervisor with everything off still passes, or
// a proctored room could never be started.
check("a supervisor is compliant with their camera off",
  isCompliant(BOTH, { role: "SUPERVISOR", ...OFF }), true);
check("a contestant is not",
  isCompliant(BOTH, { role: "PLAYER_1", ...OFF }), false);

check("a camera-only room ignores the microphone",
  isCompliant(VIDEO, { role: "HOST", videoOn: true, audioOn: false }), true);
check("a mic-only room ignores the camera",
  isCompliant(AUDIO, { role: "HOST", videoOn: false, audioOn: true }), true);
check("a both room needs both",
  isCompliant(BOTH, { role: "HOST", videoOn: true, audioOn: false }), false);
check("an unproctored room is always satisfied",
  isCompliant(NEITHER, { role: "GUEST", ...OFF }), true);
check("everything on passes",
  isCompliant(BOTH, { role: "GUEST", ...ON }), true);

check("both missing are both named", missingDevices(BOTH, OFF), ["camera", "microphone"]);
check("only what the policy asked for is named", missingDevices(VIDEO, OFF), ["camera"]);
check("a mic-only policy names the mic", missingDevices(AUDIO, OFF), ["microphone"]);
check("nothing missing is an empty list", missingDevices(BOTH, ON), []);
check("an unproctored room never lists anything", missingDevices(NEITHER, OFF), []);

check("copy for both", describeRequirement(BOTH), "camera and microphone");
check("copy for video", describeRequirement(VIDEO), "camera");
check("copy for audio", describeRequirement(AUDIO), "microphone");
check("copy for neither is empty", describeRequirement(NEITHER), "");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
