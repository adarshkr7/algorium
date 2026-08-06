import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import {
  fetchCFUserInfo,
  fetchCFUserSubmissionsStrict,
} from "@/lib/codeforces";
import {
  apiError,
  apiSuccess,
  enforceRateLimit,
  handleUnexpected,
  isErrorResponse,
  parseBody,
} from "@/lib/api-utils";
import { LoginVerifySchema } from "@/lib/validation";

/** The compilation error must be recent, so an old one can't be replayed. */
const SUBMISSION_WINDOW_SECONDS = 5 * 60;
const PASSWORD_SETUP_TTL_MS = 15 * 60 * 1000;

/**
 * POST /api/users/login/verify
 * Step 2 — look for a fresh COMPILATION_ERROR on the assigned problem. On
 * success, issue a short-lived token that authorises setting a password.
 */
export async function POST(req: Request) {
  try {
    const limited = enforceRateLimit(
      req,
      15,
      60_000,
      "Too many verification attempts. Wait a moment before retrying.",
    );
    if (limited) return limited;

    const body = await parseBody(req, LoginVerifySchema);
    if (isErrorResponse(body)) return body;

    const handle = body.handle;

    const dbUser = await prisma.user.findUnique({ where: { handle } });
    if (!dbUser?.verificationToken || !dbUser.tokenExpiresAt) {
      return apiError(
        "No pending verification for this handle. Start the login again.",
        409,
        { code: "NO_PENDING_VERIFICATION" },
      );
    }

    if (new Date() > dbUser.tokenExpiresAt) {
      await prisma.user.update({
        where: { handle },
        data: { verificationToken: null, tokenExpiresAt: null },
      });
      return apiError(
        "That verification window expired. Start the login again.",
        410,
        { code: "VERIFICATION_EXPIRED" },
      );
    }

    const target = dbUser.verificationToken.match(/^(\d+)([A-Z]+)$/);
    if (!target) {
      return apiError(
        "Verification is in an unexpected state. Start the login again.",
        409,
        { code: "BAD_TOKEN_FORMAT" },
      );
    }
    const targetContestId = Number(target[1]);
    const targetIndex = target[2];

    let submissions;
    try {
      submissions = await fetchCFUserSubmissionsStrict(handle, 20);
    } catch (error) {
      console.error("[users/login/verify] CF unreachable:", error);
      return apiError(
        "Couldn't reach Codeforces just now. Wait a few seconds and press Verify again.",
        503,
        { code: "CF_UNAVAILABLE" },
      );
    }

    const cutoff = Math.floor(Date.now() / 1000) - SUBMISSION_WINDOW_SECONDS;
    const proven = submissions.some(
      (sub) =>
        sub.verdict === "COMPILATION_ERROR" &&
        sub.problem?.contestId === targetContestId &&
        sub.problem?.index === targetIndex &&
        sub.creationTimeSeconds >= cutoff,
    );

    if (!proven) {
      return apiError(
        `No recent compilation error found on problem ${dbUser.verificationToken}. ` +
          "Submit invalid code to that exact problem, wait for the verdict, then press Verify.",
        403,
        { code: "PROOF_NOT_FOUND" },
      );
    }

    // Refresh the cached CF profile while we're here.
    const cfUser = await fetchCFUserInfo(handle);
    const passwordToken = crypto.randomUUID();

    await prisma.user.update({
      where: { handle },
      data: {
        ...(cfUser
          ? {
              avatar: cfUser.avatar,
              rating: cfUser.rating,
              maxRating: cfUser.maxRating,
              rank: cfUser.rank,
              maxRank: cfUser.maxRank,
            }
          : {}),
        verificationToken: `SET_PASSWORD_${passwordToken}`,
        tokenExpiresAt: new Date(Date.now() + PASSWORD_SETUP_TTL_MS),
      },
    });

    return apiSuccess({ step: "register", passwordToken, handle });
  } catch (error) {
    return handleUnexpected("users/login/verify", error);
  }
}
