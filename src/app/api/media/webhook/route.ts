import { prisma } from "@/lib/prisma";
import { getWebhookReceiver } from "@/lib/livekit";
import { recordMediaState } from "@/lib/services/media-policy";
import { broadcastMediaState } from "@/lib/services/media-broadcast";

/**
 * POST /api/media/webhook — LiveKit server callbacks.
 *
 * This is the fast path for the states a client cannot be trusted to report:
 * closing the tab, revoking camera permission, or unpublishing a track all
 * arrive here from LiveKit rather than from the person doing them.
 *
 * It does not see mutes — LiveKit fires no webhook when a published track is
 * muted, because the track stays published. The worker sweep reconciles that
 * by reading the room's real track state on every tick.
 *
 * Signature verification is mandatory: this endpoint is unauthenticated by
 * design, so an unverified body would let anyone mark any player compliant.
 */

/** `TrackSource` from the LiveKit protocol: 1 = CAMERA, 2 = MICROPHONE. */
const SOURCE_CAMERA = 1;
const SOURCE_MICROPHONE = 2;

export async function POST(req: Request) {
  const receiver = getWebhookReceiver();
  if (!receiver) {
    // Nothing configured — quietly accept so LiveKit doesn't retry forever if
    // a stale webhook URL outlives the credentials.
    return new Response(null, { status: 204 });
  }

  let event;
  try {
    const raw = await req.text();
    const auth = req.headers.get("Authorization") ?? "";
    event = await receiver.receive(raw, auth);
  } catch (error) {
    console.error("[media/webhook] signature rejected", error);
    return new Response("Invalid signature", { status: 401 });
  }

  try {
    const roomName = event.room?.name;
    const identity = event.participant?.identity;
    if (!roomName || !identity) return new Response(null, { status: 204 });

    // Room names are `room-XXXXXX`; anything else isn't ours.
    const code = roomName.startsWith("room-") ? roomName.slice(5) : null;
    if (!code || code.length !== 6) return new Response(null, { status: 204 });

    const room = await prisma.room.findUnique({
      where: { code },
      select: {
        contest: {
          select: {
            id: true,
            status: true,
            requireVideo: true,
            requireAudio: true,
          },
        },
      },
    });
    if (!room?.contest) return new Response(null, { status: 204 });
    const contest = room.contest;

    const participant = await prisma.participant.findUnique({
      where: { contestId_userId: { contestId: contest.id, userId: identity } },
      select: {
        role: true,
        videoOn: true,
        audioOn: true,
        mediaJoinedAt: true,
        violationSince: true,
      },
    });
    if (!participant) return new Response(null, { status: 204 });

    const next = { videoOn: participant.videoOn, audioOn: participant.audioOn };

    switch (event.event) {
      case "track_published":
      case "track_unpublished": {
        const on = event.event === "track_published";
        const source = event.track?.source;
        if (source === SOURCE_CAMERA) next.videoOn = on;
        else if (source === SOURCE_MICROPHONE) next.audioOn = on;
        else return new Response(null, { status: 204 });
        break;
      }
      case "participant_left":
        next.videoOn = false;
        next.audioOn = false;
        break;
      default:
        return new Response(null, { status: 204 });
    }

    if (
      next.videoOn === participant.videoOn &&
      next.audioOn === participant.audioOn
    ) {
      return new Response(null, { status: 204 });
    }

    await recordMediaState({
      contestId: contest.id,
      contestStatus: contest.status,
      policy: contest,
      userId: identity,
      role: participant.role,
      previous: participant,
      next,
      source: "server",
    });

    await broadcastMediaState(code, contest.id);

    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("[media/webhook] handler failed", error);
    // A 500 makes LiveKit retry, which is what we want for a transient fault.
    return new Response("Internal error", { status: 500 });
  }
}
