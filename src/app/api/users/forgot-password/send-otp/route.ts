import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import nodemailer from "nodemailer";

export async function POST(req: Request) {
  try {
    const { handleOrEmail } = await req.json();

    if (!handleOrEmail) {
      return NextResponse.json({ error: "Handle or email is required" }, { status: 400 });
    }

    // Find the user by handle or email
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

    if (!user.email) {
      return NextResponse.json({ error: "No email associated with this account" }, { status: 400 });
    }

    // Generate a 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Set expiry to 10 minutes from now
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    // Save OTP to user's verificationToken
    await prisma.user.update({
      where: { id: user.id },
      data: {
        verificationToken: otp,
        tokenExpiresAt: expiresAt,
      },
    });

    // Configure Nodemailer transporter
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    // Send email
    const mailOptions = {
      from: `"Algorium" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: "Password Reset OTP - Algorium",
      text: `Your OTP for resetting your Algorium password is: ${otp}\nThis OTP is valid for 10 minutes.`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Algorium Password Reset</h2>
          <p>Hello ${user.handle},</p>
          <p>You requested to reset your password. Use the following OTP to proceed:</p>
          <div style="background: #f4f4f5; padding: 16px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 4px; border-radius: 8px; margin: 24px 0;">
            ${otp}
          </div>
          <p>This OTP will expire in 10 minutes. If you did not request this, please ignore this email.</p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);

    return NextResponse.json({ success: true, message: "OTP sent successfully" }, { status: 200 });
  } catch (error: any) {
    console.error("Error sending OTP:", error);
    return NextResponse.json({ error: "Failed to send OTP", details: error.message }, { status: 500 });
  }
}
