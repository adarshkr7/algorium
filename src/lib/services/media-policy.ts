import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * The rules behind a host-mandated camera or microphone.
 *
 * The API route, the lobby start guard and the enforcement sweep all need the
 * same answers to "does this contest require media?" and "is this person
 * compliant?", so those live here rather than being re-derived in each caller.
 */

/** Roles that actually compete. A SUPERVISOR watches, so is never required. */
const CONTESTANT_ROLES = ["HOST", "GUEST", "PLAYER_1", "PLAYER_2"] as const;

export type MediaEventKind =
  | "VIDEO_ON"
  | "VIDEO_OFF"
  | "AUDIO_ON"
  | "AUDIO_OFF"
  | "JOINED"
  | "LEFT"
  | "WARNED"
  | "FORFEITED";

export interface MediaPolicy {
  requireVideo: boolean;
  requireAudio: boolean;
  graceSeconds: number;
  action: "WARN" | "FORFEIT";
}

export interface MediaState {
  videoOn: boolean;
  audioOn: boolean;
}

export function isContestant(role: string): boolean {
  return (CONTESTANT_ROLES as readonly string[]).includes(role);
}

/** True when the host asked for either device. */
export function mediaRequired(policy: {
  requireVideo: boolean;
  requireAudio: boolean;
}): boolean {
  return policy.requireVideo || policy.requireAudio;
}

/**
 * Whether one participant satisfies the policy right now. Supervisors always
 * pass — they are proctoring, not competing.
 */
export function isCompliant(
  policy: { requireVideo: boolean; requireAudio: boolean },
  participant: { role: string; videoOn: boolean; audioOn: boolean },
): boolean {
  if (!isContestant(participant.role)) return true;
  if (policy.requireVideo && !participant.videoOn) return false;
  if (policy.requireAudio && !participant.audioOn) return false;
  return true;
}

/** "camera", "microphone" or "camera and microphone" — for user-facing copy. */
export function describeRequirement(policy: {
  requireVideo: boolean;
  requireAudio: boolean;
}): string {
  if (policy.requireVideo && policy.requireAudio) {
    return "camera and microphone";
  }
  if (policy.requireVideo) return "camera";
  if (policy.requireAudio) return "microphone";
  return "";
}

/** The specific devices this participant is missing, for a precise message. */
export function missingDevices(
  policy: { requireVideo: boolean; requireAudio: boolean },
  participant: { videoOn: boolean; audioOn: boolean },
): string[] {
  const missing: string[] = [];
  if (policy.requireVideo && !participant.videoOn) missing.push("camera");
  if (policy.requireAudio && !participant.audioOn) missing.push("microphone");
  return missing;
}

export async function logMediaEvent(
  tx: Prisma.TransactionClient,
  contestId: string,
  userId: string,
  kind: MediaEventKind,
  source: "client" | "server",
): Promise<void> {
  await tx.mediaEvent.create({
    data: { contestId, userId, kind, source },
  });
}

/**
 * Applies a reported device state to a participant and writes the audit trail.
 *
 * The violation clock only runs during a live contest — in the lobby a camera
 * that is off is simply "not ready yet", which the start guard handles, and
 * opening violations there would fill the log with noise before anyone has
 * done anything wrong.
 */
export async function recordMediaState(args: {
  contestId: string;
  contestStatus: string;
  policy: { requireVideo: boolean; requireAudio: boolean };
  userId: string;
  role: string;
  previous: {
    videoOn: boolean;
    audioOn: boolean;
    mediaJoinedAt: Date | null;
    violationSince: Date | null;
  };
  next: MediaState;
  source: "client" | "server";
}): Promise<{ compliant: boolean; violationOpened: boolean }> {
  const { contestId, contestStatus, policy, userId, role, previous, next } =
    args;

  const compliant = isCompliant(policy, {
    role,
    videoOn: next.videoOn,
    audioOn: next.audioOn,
  });
  const live = contestStatus === "IN_PROGRESS";
  const wasViolating = previous.violationSince !== null;
  const violationOpened = live && !compliant && !wasViolating;

  const data: Prisma.ParticipantUpdateInput = {
    videoOn: next.videoOn,
    audioOn: next.audioOn,
  };

  if (!previous.mediaJoinedAt && (next.videoOn || next.audioOn)) {
    data.mediaJoinedAt = new Date();
  }

  if (!live || compliant) {
    // Clearing on a non-live contest keeps a lobby reconnect from carrying a
    // stale clock into the contest once it starts.
    data.violationSince = null;
  } else if (violationOpened) {
    data.violationSince = new Date();
    data.mediaViolationCount = { increment: 1 };
  }

  await prisma.$transaction(async (tx) => {
    await tx.participant.update({
      where: { contestId_userId: { contestId, userId } },
      data,
    });

    const transitions: MediaEventKind[] = [];
    if (next.videoOn !== previous.videoOn) {
      transitions.push(next.videoOn ? "VIDEO_ON" : "VIDEO_OFF");
    }
    if (next.audioOn !== previous.audioOn) {
      transitions.push(next.audioOn ? "AUDIO_ON" : "AUDIO_OFF");
    }
    if (!previous.mediaJoinedAt && (next.videoOn || next.audioOn)) {
      transitions.unshift("JOINED");
    }

    for (const kind of transitions) {
      await logMediaEvent(tx, contestId, userId, kind, args.source);
    }
  });

  return { compliant, violationOpened };
}
