// ===========================================
// GET /api/onboarding/line-oa-status
// Check follow status — hybrid approach:
// 1. Read from DB (fast, cached from webhook events)
// 2. If DB says not following, also query LINE API directly
//    (handles case: user followed BEFORE webhook was set up)
// ===========================================

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getBotUserProfile } from "@/lib/line/messaging";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const lineConn = await prisma.lineConnection.findUnique({
    where: { userId: session.userId },
    select: {
      isFollowingOA: true,
      oaLinkedAt: true,
    },
  });

  // If already marked as following in DB → return immediately
  if (lineConn?.isFollowingOA) {
    return NextResponse.json({
      isFollowingOA: true,
      oaLinkedAt: lineConn.oaLinkedAt,
    });
  }

  // DB says not following — query LINE API directly as fallback
  // This handles cases where user was already following before webhook was set up
  try {
    await getBotUserProfile(session.lineUserId);
    // If success (no throw) → user IS a friend of bot → update DB + return true
    await prisma.lineConnection.update({
      where: { userId: session.userId },
      data: {
        isFollowingOA: true,
        oaLinkedAt: new Date(),
      },
    });
    await prisma.user.update({
      where: { id: session.userId },
      data: { lineFollowedOAAt: new Date() },
    });

    return NextResponse.json({
      isFollowingOA: true,
      oaLinkedAt: new Date(),
    });
  } catch (err) {
    // Error = not a friend / or API error
    const message = err instanceof Error ? err.message : "unknown";
    // Only log non-404 errors (404 is expected when not following)
    if (!message.includes("404")) {
      console.log("[line-oa-status] bot profile fetch:", message);
    }
    return NextResponse.json({
      isFollowingOA: false,
      oaLinkedAt: null,
    });
  }
}
