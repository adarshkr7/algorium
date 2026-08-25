import { RoomServiceClient } from "livekit-server-sdk";
import { prisma } from "@/lib/prisma";
import { getLiveKitConfig, mediaRoomName } from "@/lib/livekit";
import { BroadcastService, MEDIA_CHANNEL_SUFFIX } from "./broadcast";
import { buildMediaSnapshot } from "./media-broadcast";
import { finishContest } from "./contest-finalizer";
import {
  isCompliant,
  isContestant,
  missingDevices,
  recordMediaState,
} from "./media-policy";

/**
 * Server-side enforcement of a host-mandated camera or microphone.
 *
 * The arena runs its own grace countdown so the offender sees a timer, but
 * that timer lives in their browser — closing the tab kills it. This sweep is
 * what actually enforces the rule, and it runs from the background worker on
 * the same tick as the Codeforces evaluation.
 *
 * Two sources of truth, in order of preference:
 *   1. LiveKit's view of published, unmuted tracks. Authoritative, and the
 *      only thing that catches a muted-but-published camera, which fires no
 *      webhook.
 *   2. Whatever the participants last reported themselves. Used when LiveKit
 *      is not configured, or when its API is briefly unreachable.
 */

/** `TrackSource` from the LiveKit protocol. */
const SOURCE_CAMERA = 1;
const SOURCE_MICROPHONE = 2;

interface ObservedState {
  videoOn: boolean;
  audioOn: boolean;
}

/**
 * Asks LiveKit what each participant is actually publishing.
 *
 * Returns null when it cannot say — the caller then leaves self-reported state
 * alone rather than wrongly marking everyone offline.
 */
async function observeRoom(
  code: string,
): Promise<Map<string, ObservedState> | null> {
  const config = getLiveKitConfig();
  if (!config) return null;

  // The REST API speaks http(s); the signalling URL is ws(s).
  const httpUrl = config.url.replace(/^ws/, "http");
  const client = new RoomServiceClient(httpUrl, config.apiKey, config.apiSecret);

  try {
    const participants = await client.listParticipants(mediaRoomName(code));
    const observed = new Map<string, ObservedState>();

    for (const p of participants) {
      let videoOn = false;
      let audioOn = false;
      for (const track of p.tracks ?? []) {
        // A muted track is still published, so `muted` is the bit that
        // matters — this is the case the webhook cannot see.
        if (track.muted) continue;
        if (track.source === SOURCE_CAMERA) videoOn = true;
        else if (track.source === SOURCE_MICROPHONE) audioOn = true;
      }
      observed.set(p.identity, { videoOn, audioOn });
    }

    return observed;
  } catch {
    // Room not created yet (nobody has joined) or a transient API failure.
    return null;
  }
}

interface EnforcementParticipant {
  userId: string;
  role: string;
  videoOn: boolean;
  audioOn: boolean;
  mediaJoinedAt: Date | null;
  violationSince: Date | null;
  hasResigned: boolean;
  user: { handle: string };
}

interface LiveContest {
  id: string;
  status: string;
  requireVideo: boolean;
  requireAudio: boolean;
  mediaGraceSeconds: number;
  mediaViolationAction: "WARN" | "FORFEIT";
  room: { code: string } | null;
  participants: EnforcementParticipant[];
}

/** Reconciles one contest against LiveKit, then escalates expired violations. */
export async function enforceContestMedia(
  contest: LiveContest,
): Promise<boolean> {
  const code = contest.room?.code;
  if (!code) return false;

  let changed = false;

  // ── 1. Reconcile against what LiveKit actually sees ─────────────────────
  const observed = await observeRoom(code);
  if (observed) {
    for (const p of contest.participants) {
      if (p.hasResigned) continue;
      // Someone absent from the room is publishing nothing.
      const next = observed.get(p.userId) ?? { videoOn: false, audioOn: false };
      if (next.videoOn === p.videoOn && next.audioOn === p.audioOn) continue;

      await recordMediaState({
        contestId: contest.id,
        contestStatus: contest.status,
        policy: contest,
        userId: p.userId,
        role: p.role,
        previous: p,
        next,
        source: "server",
      });

      // Mirror onto the in-memory row so the escalation pass below sees the
      // state this tick rather than the state we loaded with.
      p.videoOn = next.videoOn;
      p.audioOn = next.audioOn;
      p.violationSince = isCompliant(contest, p)
        ? null
        : (p.violationSince ?? new Date());
      changed = true;
    }
  }

  // ── 2. Escalate anything past its grace period ──────────────────────────
  const now = Date.now();
  const graceMs = contest.mediaGraceSeconds * 1000;

  for (const p of contest.participants) {
    if (p.hasResigned || !isContestant(p.role)) continue;
    if (!p.violationSince) continue;
    if (now - p.violationSince.getTime() < graceMs) continue;

    const missing = missingDevices(contest, p);
    if (missing.length === 0) continue;

    if (contest.mediaViolationAction === "FORFEIT") {
      await forfeit(contest, code, p, missing);
      // The contest is over; nothing further to reconcile.
      return true;
    }

    // WARN: once per incident, not once per tick. A WARNED event logged after
    // the violation opened means this one has already been announced.
    const alreadyWarned = await prisma.mediaEvent.findFirst({
      where: {
        contestId: contest.id,
        userId: p.userId,
        kind: "WARNED",
        at: { gte: p.violationSince },
      },
      select: { id: true },
    });
    if (alreadyWarned) continue;

    await prisma.mediaEvent.create({
      data: {
        contestId: contest.id,
        userId: p.userId,
        kind: "WARNED",
        source: "server",
      },
    });

    await withBroadcast(code, (service) =>
      service.broadcastMediaViolation({
        userId: p.userId,
        handle: p.user.handle,
        missing,
        action: "WARN",
        enforced: true,
      }),
    );
    changed = true;
  }

  if (changed) {
    const participants = await buildMediaSnapshot(contest.id);
    await withBroadcast(code, (service) =>
      service.broadcastMediaState(participants),
    );
  }

  return changed;
}

async function forfeit(
  contest: LiveContest,
  code: string,
  participant: EnforcementParticipant,
  missing: string[],
): Promise<void> {
  // Mark the resignation first so `finishContest` awards the win correctly,
  // exactly as the leave route does.
  await prisma.participant.updateMany({
    where: { contestId: contest.id, userId: participant.userId, hasResigned: false },
    data: { hasResigned: true },
  });

  await prisma.mediaEvent.create({
    data: {
      contestId: contest.id,
      userId: participant.userId,
      kind: "FORFEITED",
      source: "server",
    },
  });

  // Announced before the contest-finished payload lands, so the arena can
  // explain why the screen just changed.
  await withBroadcast(code, (service) =>
    service.broadcastMediaViolation({
      userId: participant.userId,
      handle: participant.user.handle,
      missing,
      action: "FORFEIT",
      enforced: true,
    }),
  );

  // finishContest broadcasts contest-finished itself.
  await finishContest(contest.id, {
    reason: "media_violation",
    resignedUserId: participant.userId,
  });
}

/** Every BroadcastService opens a socket, so it always has to be released. */
async function withBroadcast(
  code: string,
  fn: (service: BroadcastService) => Promise<void>,
): Promise<void> {
  const service = new BroadcastService(code, MEDIA_CHANNEL_SUFFIX);
  try {
    await fn(service);
  } finally {
    await service.dispose();
  }
}

const ENFORCEMENT_SELECT = {
  id: true,
  status: true,
  requireVideo: true,
  requireAudio: true,
  mediaGraceSeconds: true,
  mediaViolationAction: true,
  room: { select: { code: true } },
  participants: {
    select: {
      userId: true,
      role: true,
      videoOn: true,
      audioOn: true,
      mediaJoinedAt: true,
      violationSince: true,
      hasResigned: true,
      user: { select: { handle: true } },
    },
  },
} as const;

/**
 * Runs the sweep for a single room, on demand.
 *
 * The arena calls this the moment its own countdown expires so the outcome is
 * immediate rather than up to one worker tick late. It deliberately takes no
 * input beyond the room: the caller says "check this room now", never "this
 * person is in violation". Whether anyone actually is gets decided here, from
 * LiveKit and the database, so a client can neither frame an opponent nor talk
 * its way out of its own violation by staying silent.
 */
export async function enforceRoomMedia(code: string): Promise<boolean> {
  const contest = await prisma.contest.findFirst({
    where: {
      status: "IN_PROGRESS",
      room: { code: code.toUpperCase() },
      OR: [{ requireVideo: true }, { requireAudio: true }],
    },
    select: ENFORCEMENT_SELECT,
  });
  if (!contest) return false;

  return enforceContestMedia(contest);
}

/** One pass over every live contest that requires a camera or microphone. */
export async function sweepMediaCompliance(): Promise<number> {
  const contests = await prisma.contest.findMany({
    where: {
      status: "IN_PROGRESS",
      OR: [{ requireVideo: true }, { requireAudio: true }],
    },
    select: ENFORCEMENT_SELECT,
  });

  for (const contest of contests) {
    try {
      await enforceContestMedia(contest);
    } catch (error) {
      console.error(
        `[media-enforcer] contest ${contest.id} failed:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  return contests.length;
}
