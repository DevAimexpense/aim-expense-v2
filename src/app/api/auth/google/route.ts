// ===========================================
// GET /api/auth/google
// Initiate Google OAuth — require LINE session first
// ===========================================

import { NextRequest, NextResponse } from "next/server";
import { getGoogleAuthUrl } from "@/lib/google/oauth";
import { getSession } from "@/lib/auth/session";

export async function GET(req: NextRequest) {
  // Must be logged in via LINE first
  const session = await getSession();
  if (!session) {
    // Use the real request origin (aimexpense.com in prod) — never hardcode
    // localhost, or the redirect breaks the login flow on production.
    return NextResponse.redirect(
      new URL("/login?error=must_login_first", req.url)
    );
  }

  const authUrl = getGoogleAuthUrl();
  return NextResponse.redirect(authUrl);
}
