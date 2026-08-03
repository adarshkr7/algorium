import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function POST(req: Request) {
  try {
    const { handleOrEmail, otp, newPassword } = await req.json();

    if (!handleOrEmail || !otp || !newPassword) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (newPassword.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }

    // Find user
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { handle: { equals: handleOrEmail, mode: "insensitive" } },
          { email: { equals: handleOrEmail, mode: "insensitive" } }
        ]
      }
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Validate OTP
    if (!user.verificationToken || user.verificationToken !== otp) {
      return NextResponse.json({ error: "Invalid OTP" }, { status: 400 });
    }

    // Validate Expiry
    if (!user.tokenExpiresAt || user.tokenExpiresAt < new Date()) {
      return NextResponse.json({ error: "OTP has expired" }, { status: 400 });
    }

    // Hash the new password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    // Update the user password and clear the OTP fields
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        verificationToken: null,
        tokenExpiresAt: null,
      },
    });

    return NextResponse.json({ success: true, message: "Password updated successfully" }, { status: 200 });
  } catch (error: any) {
    console.error("Error resetting password:", error);
    return NextResponse.json({ error: "Failed to reset password", details: error.message }, { status: 500 });
  }
}
