// ===========================================
// GET /api/auth/google
// Initiate Google OAuth — require LINE session first
// ===========================================

import { NextResponse } from "next/server";
import { getGoogleAuthUrl } from "@/lib/google/oauth";
import { getSession } from "@/lib/auth/session";

export async function GET() {
  // Must be logged in via LINE first
  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(
      new URL("/login?error=must_login_first", "http://localhost")
    );
  }

  const authUrl = getGoogleAuthUrl();
  return NextResponse.redirect(authUrl);
}
