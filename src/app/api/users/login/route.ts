import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { fetchCFUserInfo } from "@/lib/codeforces";
import {
  apiError,
  apiSuccess,
  enforceRateLimit,
  handleUnexpected,
  isErrorResponse,
  parseBody,
} from "@/lib/api-utils";
import { LoginInitiateSchema } from "@/lib/validation";

/**
 * Easy problems used for ownership proof. The user submits deliberately broken
 * code and we look for the resulting COMPILATION_ERROR, which only the account
 * owner could have produced.
 */
const VERIFICATION_PROBLEMS = [
  "4A", "71A", "158A", "231A", "282A",
  "50A", "112A", "339A", "281A", "266A",
];

const VERIFICATION_TTL_MS = 5 * 60 * 1000;

function randomProblem(): string {
  return VERIFICATION_PROBLEMS[
    crypto.randomInt(0, VERIFICATION_PROBLEMS.length)
  ];
}

/**
 * POST /api/users/login
 * Step 1 — decide whether this handle logs in with a password or has to prove
 * ownership of the Codeforces account first.
 */
export async function POST(req: Request) {
  try {
    const limited = enforceRateLimit(
      req,
      8,
      60_000,
      "Too many login attempts. Please try again in a minute.",
    );
    if (limited) return limited;

    const body = await parseBody(req, LoginInitiateSchema);
    if (isErrorResponse(body)) return body;

    const handle = body.handle;

    const existing = await prisma.user.findUnique({
      where: { handle },
      select: { handle: true, passwordHash: true },
    });

    if (existing?.passwordHash && !body.forceVerify) {
      return apiSuccess({ step: "password", handle: existing.handle });
    }

    const cfUser = await fetchCFUserInfo(handle);
    if (!cfUser) {
      return apiError(
        `No Codeforces user called "${handle}". Check the spelling and try again.`,
        404,
        { code: "CF_USER_NOT_FOUND" },
      );
    }

    const token = randomProblem();
    const tokenExpiresAt = new Date(Date.now() + VERIFICATION_TTL_MS);

    const profile = {
      avatar: cfUser.avatar,
      rating: cfUser.rating,
      maxRating: cfUser.maxRating,
      rank: cfUser.rank,
      maxRank: cfUser.maxRank,
      verificationToken: token,
      tokenExpiresAt,
    };

    await prisma.user.upsert({
      where: { handle: cfUser.handle },
      update: profile,
      create: { handle: cfUser.handle, ...profile },
    });

    return apiSuccess({
      step: "verify",
      token,
      handle: cfUser.handle,
      expiresAt: tokenExpiresAt.toISOString(),
    });
  } catch (error) {
    return handleUnexpected("users/login", error);
  }
}
