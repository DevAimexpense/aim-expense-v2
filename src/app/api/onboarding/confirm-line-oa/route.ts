// ===========================================
// POST /api/onboarding/confirm-line-oa
// Mark user as having added LINE OA → advance onboarding step
// (ในอนาคตจะ verify จาก webhook event "follow" — ตอนนี้เชื่อ user ไปก่อน)
// ===========================================

import { NextResponse } from "next/server";
import { getSession, setSessionCookie } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.update({
    where: { id: session.userId },
    data: {
      onboardingStep: "google",
      lineFollowedOAAt: new Date(),
      lineConnection: {
        update: {
          isFollowingOA: true,
          oaLinkedAt: new Date(),
        },
      },
    },
  });

  await setSessionCookie({
    userId: user.id,
    lineUserId: user.lineUserId,
    displayName: user.lineDisplayName,
    avatarUrl: user.avatarUrl,
    onboardingStep: user.onboardingStep,
  });

  return NextResponse.json({ success: true, nextStep: user.onboardingStep });
}
