import { prisma } from "@/lib/prisma";
import {
  BroadcastService,
  MEDIA_CHANNEL_SUFFIX,
  type MediaSnapshot,
} from "./broadcast";
import { isCompliant } from "./media-policy";

/**
 * Reads the current media roster for a contest and pushes it to the room.
 *
 * The whole roster goes out in one message rather than a per-participant
 * delta: a duel has at most three people in it, so the payload is tiny, and a
 * full snapshot means a client that missed an event self-heals on the next one
 * instead of drifting.
 */
export async function buildMediaSnapshot(
  contestId: string,
): Promise<MediaSnapshot[]> {
  const contest = await prisma.contest.findUnique({
    where: { id: contestId },
    select: {
      requireVideo: true,
      requireAudio: true,
      participants: {
        select: {
          userId: true,
          role: true,
          videoOn: true,
          audioOn: true,
          violationSince: true,
          user: { select: { handle: true } },
        },
      },
    },
  });
  if (!contest) return [];

  return contest.participants.map((p) => ({
    userId: p.userId,
    handle: p.user.handle,
    role: p.role,
    videoOn: p.videoOn,
    audioOn: p.audioOn,
    compliant: isCompliant(contest, p),
    violationSince: p.violationSince?.toISOString() ?? null,
  }));
}

export async function broadcastMediaState(
  code: string,
  contestId: string,
): Promise<void> {
  const participants = await buildMediaSnapshot(contestId);
  if (participants.length === 0) return;

  const service = new BroadcastService(code, MEDIA_CHANNEL_SUFFIX);
  try {
    await service.broadcastMediaState(participants);
  } finally {
    await service.dispose();
  }
}
