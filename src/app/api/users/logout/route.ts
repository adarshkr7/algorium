import { NextResponse } from "next/server";
import { createClearSessionCookieHeader } from "@/lib/auth";

/** POST /api/users/logout — clears the session cookie. */
export async function POST() {
  const response = NextResponse.json({ success: true });
  response.headers.set("Set-Cookie", createClearSessionCookieHeader());
  return response;
}
