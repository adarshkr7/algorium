import {
  apiSuccess,
  handleUnexpected,
  isErrorResponse,
  requireAuth,
} from "@/lib/api-utils";
import { findActiveRoomForUser } from "@/lib/services/room-service";

export const dynamic = "force-dynamic";

/**
 * GET /api/users/active-room
 * Powers the "you have a duel in progress" banner in the navbar.
 */
export async function GET(req: Request) {
  try {
    const session = await requireAuth(req);
    if (isErrorResponse(session)) return session;

    const room = await findActiveRoomForUser(session.userId);
    return apiSuccess({ room });
  } catch (error) {
    return handleUnexpected("users/active-room", error, req);
  }
}
