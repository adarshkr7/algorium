import { prisma } from "@/lib/prisma";
import {
  apiSuccess,
  enforceRateLimit,
  handleUnexpected,
  isErrorResponse,
  parseBody,
} from "@/lib/api-utils";
import { ContactSchema } from "@/lib/validation";

/**
 * POST /api/contact
 *
 * Rate limited and validated — this endpoint was previously unauthenticated,
 * unvalidated and unthrottled, i.e. an open door to the database.
 * The stored row is not echoed back.
 */
export async function POST(req: Request) {
  try {
    const limited = await enforceRateLimit(
      req,
      3,
      10 * 60_000,
      "You've sent a few messages already. Please wait a little while.",
    );
    if (limited) return limited;

    const body = await parseBody(req, ContactSchema);
    if (isErrorResponse(body)) return body;

    await prisma.contactMessage.create({
      data: {
        name: body.name,
        email: body.email,
        subject: body.subject,
        message: body.message,
      },
    });

    return apiSuccess(
      { success: true, message: "Thanks — we'll get back to you." },
      201,
    );
  } catch (error) {
    return handleUnexpected("contact", error);
  }
}
