import { prisma } from "@/lib/prisma";
import { apiError, apiSuccess, handleUnexpected } from "@/lib/api-utils";
import {
  getSessionFromRequest,
  PUBLIC_USER_FIELDS,
  touchLastSeen,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

/** GET /api/users/me — the signed-in user, or 401. */
export async function GET(req: Request) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) {
      return apiError("Not authenticated", 401, { code: "UNAUTHENTICATED" });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: PUBLIC_USER_FIELDS,
    });

    if (!user) {
      return apiError("User not found", 404, { code: "USER_NOT_FOUND" });
    }

    // Fire and forget — keeps the CF cache daemon focused on active players.
    touchLastSeen(user.id);

    return apiSuccess({ user });
  } catch (error) {
    return handleUnexpected("users/me", error, req);
  }
}
