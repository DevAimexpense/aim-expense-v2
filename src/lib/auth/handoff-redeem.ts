// ===========================================
// แลกตั๋ว handoff (?h=...) เป็น session แล้วพาไป URL เดิมที่ "ไม่มีตั๋ว"
// ใช้ใน route ที่เริ่ม Google OAuth (/api/auth/google, /api/auth/google/regrant)
// — ดู lib/auth/handoff.ts
// ===========================================

import type { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { consumeAuthHandoff } from "@/lib/auth/handoff";
import { htmlRedirect, setSessionCookieOnResponse } from "@/lib/auth/session";

/**
 * มี ?h= → แลกเป็น session ของ browser นี้ (Safari/Chrome ที่ LINE เปิดให้) แล้วคืน response
 * ที่พาไป URL เดิมโดยตัด h ออก (ตั๋วไม่ติด Referer ไปถึง Google)
 * ไม่มี h → คืน null ให้ route ทำงานต่อตามปกติ
 * ตั๋วใช้ไม่ได้ → ก็ตัด h แล้วไปต่อ (route จะเจอว่าไม่มี session → /login แบบเดิม)
 */
export async function redeemHandoff(req: NextRequest): Promise<NextResponse | null> {
  const ticket = req.nextUrl.searchParams.get("h");
  if (!ticket) return null;

  const clean = new URL(req.url);
  clean.searchParams.delete("h");
  const res = htmlRedirect(clean.toString());

  const userId = await consumeAuthHandoff(ticket);
  if (!userId) return res;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return res;

  await setSessionCookieOnResponse(res, {
    userId: user.id,
    lineUserId: user.lineUserId,
    displayName: user.lineDisplayName,
    avatarUrl: user.avatarUrl,
    onboardingStep: user.onboardingStep,
    // org ที่ใช้อยู่บนเว็บ (mirror จาก JWT ทุกครั้งที่สลับ org) — regrant ต้องรู้ว่า org ไหน
    activeOrgId: user.activeOrgId ?? null,
  });
  return res;
}
