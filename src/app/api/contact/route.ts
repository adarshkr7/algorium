import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, apiSuccess } from "@/lib/api-utils";

export async function POST(req: Request) {
  try {
    const { name, email, subject, message } = await req.json();

    if (!name || !email || !subject || !message) {
      return apiError("All fields are required", 400);
    }

    const contactMessage = await prisma.contactMessage.create({
      data: {
        name,
        email,
        subject,
        message,
      },
    });

    return apiSuccess({ success: true, contactMessage }, 201);
  } catch (error: any) {
    console.error("Error creating contact message:", error);
    return apiError("Failed to submit message", 500);
  }
}
