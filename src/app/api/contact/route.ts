import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const { name, email, subject, message } = await req.json();

    if (!name || !email || !subject || !message) {
      return NextResponse.json({ error: "All fields are required" }, { status: 400 });
    }

    const contactMessage = await prisma.contactMessage.create({
      data: {
        name,
        email,
        subject,
        message,
      },
    });

    return NextResponse.json({ success: true, contactMessage }, { status: 201 });
  } catch (error: any) {
    console.error("Error creating contact message:", error);
    return NextResponse.json({ error: "Failed to submit message", details: error.message }, { status: 500 });
  }
}
