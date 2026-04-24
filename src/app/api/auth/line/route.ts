// ===========================================
// GET /api/auth/line
// Initiate LINE Login OAuth flow
// ===========================================

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { generateState, generateNonce, getLineAuthUrl } from "@/lib/line/oauth";
import { setOAuthState } from "@/lib/auth/session";

export async function GET(req: NextRequest) {
  const state = generateState();
  const nonce = generateNonce();

  // Store state + nonce in cookie for verification in callback
  await setOAuthState({
    state,
    nonce,
    provider: "line",
  });

  // Store "next" URL (e.g. /invite/{token}) in cookie for post-login redirect
  const next = req.nextUrl.searchParams.get("next");
  if (next && next.startsWith("/")) {
    const cookieStore = await cookies();
    cookieStore.set("oauth_next", next, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600, // 10 minutes
      path: "/",
    });
  }

  // Note: ถ้า next=/invite/... → ไม่ใช้ bot_prompt=aggressive
  // เพราะ user ที่ถูกเชิญไม่จำเป็นต้อง add LINE OA (เค้าเป็นสมาชิก org อื่น)
  const isInviteFlow = next?.startsWith("/invite/");
  const authUrl = getLineAuthUrl({
    state,
    nonce,
    ...(isInviteFlow ? {} : { botPrompt: "aggressive" as const }),
  });

  return NextResponse.redirect(authUrl);
}
