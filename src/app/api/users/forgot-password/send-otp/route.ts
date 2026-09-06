import crypto from "crypto";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";
import {
  apiSuccess,
  enforceRateLimit,
  handleUnexpected,
  isErrorResponse,
  parseBody,
} from "@/lib/api-utils";
import { SendOtpSchema } from "@/lib/validation";

const OTP_TTL_MS = 10 * 60 * 1000;
const BCRYPT_ROUNDS = 10;

/** Masks an address for the UI: adarshjijh@gmail.com -> a•••••••h@gmail.com */
function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "your email";
  const visible = local.length <= 2 ? local[0] : `${local[0]}…${local.at(-1)}`;
  return `${visible}@${domain}`;
}

function buildTransport() {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return null;
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });
}

/**
 * POST /api/users/forgot-password/send-otp
 *
 * Always answers 200, whether or not the account exists — otherwise this is a
 * free "does this handle have an account?" oracle. The response includes a
 * masked destination when there is one, so a legitimate user still gets useful
 * feedback.
 */
export async function POST(req: Request) {
  try {
    const limited = await enforceRateLimit(
      req,
      3,
      60_000,
      "Too many code requests. Please wait a minute.",
    );
    if (limited) return limited;

    const body = await parseBody(req, SendOtpSchema);
    if (isErrorResponse(body)) return body;

    const identifier = body.handleOrEmail;

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { handle: { equals: identifier, mode: "insensitive" } },
          { email: { equals: identifier, mode: "insensitive" } },
        ],
      },
      select: { id: true, handle: true, email: true },
    });

    const genericResponse = apiSuccess({
      success: true,
      message:
        "If that account exists and has an email on file, a code is on its way.",
      sentTo: user?.email ? maskEmail(user.email) : null,
      handle: user?.handle ?? null,
    });

    if (!user?.email) return genericResponse;

    const transport = buildTransport();
    if (!transport) {
      console.error(
        "[forgot-password] EMAIL_USER / EMAIL_PASS are not configured.",
      );
      return genericResponse;
    }

    const otp = crypto.randomInt(100000, 1000000).toString();

    // Stored hashed: a six-digit code is only 10^6 wide, so anything that can
    // read the row can use the code. The plaintext exists only in the email.
    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetOtpHash: await bcrypt.hash(otp, BCRYPT_ROUNDS),
        resetOtpExpiresAt: new Date(Date.now() + OTP_TTL_MS),
        resetOtpAttempts: 0,
      },
    });

    try {
      await transport.sendMail({
        from: `"Algorium" <${process.env.EMAIL_USER}>`,
        to: user.email,
        subject: "Your Algorium password reset code",
        text:
          `Your Algorium password reset code is ${otp}.\n` +
          `It expires in 10 minutes. If you didn't request this, ignore this email.`,
        html: `
          <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;color:#18181B">
            <h2 style="margin:0 0 12px">Algorium password reset</h2>
            <p style="margin:0 0 16px">Hi ${user.handle}, use this code to set a new password:</p>
            <div style="background:#F4F4F5;padding:18px;text-align:center;font-size:28px;font-weight:700;letter-spacing:6px;border-radius:10px;margin:20px 0">
              ${otp}
            </div>
            <p style="color:#71717A;font-size:13px;margin:0">
              This code expires in 10 minutes. If you didn't request it, you can safely ignore this email.
            </p>
          </div>
        `,
      });
    } catch (error) {
      console.error("[forgot-password] send failed:", error);
    }

    return genericResponse;
  } catch (error) {
    return handleUnexpected("users/forgot-password/send-otp", error);
  }
}
