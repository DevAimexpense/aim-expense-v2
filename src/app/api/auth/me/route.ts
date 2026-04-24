// ===========================================
// GET /api/auth/me
// Return current session info (or 401 if not logged in)
// Used by public pages to check auth status
// ===========================================

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
    }
    return NextResponse.json({
      userId: session.userId,
      lineUserId: session.lineUserId,
      displayName: session.displayName,
      avatarUrl: session.avatarUrl,
      onboardingStep: session.onboardingStep,
    });
  } catch {
    return NextResponse.json({ error: "session_error" }, { status: 401 });
  }
}
