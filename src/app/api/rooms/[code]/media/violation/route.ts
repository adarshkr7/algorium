import {
  apiError,
  apiSuccess,
  enforceRateLimit,
  handleUnexpected,
  isErrorResponse,
  requireAuth,
} from "@/lib/api-utils";
import { enforceRoomMedia } from "@/lib/services/media-enforcer";

/**
 * POST /api/rooms/[code]/media/violation
 *
 * "My grace period just ran out — check this room now."
 *
 * The body is empty on purpose. The client never gets to say who is in
 * violation, only that the room is worth re-checking; the decision is made
 * server-side from LiveKit and the database. That keeps a modified client from
 * framing an opponent, and keeps an offender from escaping by simply never
 * calling this — the worker sweep reaches the same conclusion within a tick.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const limited = enforceRateLimit(req, 20, 60_000);
    if (limited) return limited;

    const session = await requireAuth(req);
    if (isErrorResponse(session)) return session;

    const { code: rawCode } = await params;
    if (!rawCode || rawCode.length !== 6) {
      return apiError("Invalid room code", 400, { code: "INVALID_CODE" });
    }

    const acted = await enforceRoomMedia(rawCode.toUpperCase());
    return apiSuccess({ acted });
  } catch (error) {
    return handleUnexpected("rooms/[code]/media/violation", error);
  }
}
