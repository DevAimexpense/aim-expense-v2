// ===========================================
// GET /api/auth/google
// Initiate Google OAuth — require LINE session first
// ===========================================

import { NextRequest, NextResponse } from "next/server";
import { getGoogleAuthUrl } from "@/lib/google/oauth";
import { getSession } from "@/lib/auth/session";
import { redeemHandoff } from "@/lib/auth/handoff-redeem";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  // มากับตั๋วจาก browser ของ LINE (ลิงก์มี openExternalBrowser=1 → LINE เปิด Safari/Chrome)
  // → แลกเป็น session ที่นี่ ผู้ใช้ไม่ต้องล็อกอินซ้ำ (ดู lib/auth/handoff.ts)
  const redeemed = await redeemHandoff(req);
  if (redeemed) return redeemed;

  // Must be logged in via LINE first
  const session = await getSession();
  if (!session) {
    // Use the real request origin (aimexpense.com in prod) — never hardcode
    // localhost, or the redirect breaks the login flow on production.
    return NextResponse.redirect(
      new URL("/login?error=must_login_first", req.url)
    );
  }

  // เคยเชื่อมไว้แล้ว = "เชื่อมใหม่" → บอก Google ว่าบัญชีไหน กันเลือกผิดบัญชีจนเข้าชีตเดิมไม่ได้
  // (เสี่ยงบนมือถือ: Safari/Chrome อาจล็อกอิน Google ไว้คนละบัญชี) — แบบเดียวกับ aim-hr
  const existing = await prisma.googleConnection.findUnique({
    where: { userId: session.userId },
    select: { googleEmail: true },
  });
  const authUrl = getGoogleAuthUrl(existing?.googleEmail);
  return NextResponse.redirect(authUrl);
}
