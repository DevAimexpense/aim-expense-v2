// ===========================================
// GET /api/cron/trial-reminders
// Daily sweep — push a LINE reminder to the org owner when their Pro trial
// is 7 / 3 / 1 days from expiring, so they can renew via LINE.
//
// Schedule via Vercel Cron in vercel.json:
//   { "path": "/api/cron/trial-reminders", "schedule": "30 1 * * *" }
// (runs at 01:30 UTC = 08:30 Bangkok — just after expire-trials)
//
// De-dup: the cron runs once daily and only fires at exact day thresholds
// {7,3,1}, so each subscription hits each threshold at most once. No extra
// DB field needed.
//
// Auth: requires `Authorization: Bearer ${CRON_SECRET}` (matches Vercel Cron).
// ===========================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendTrialReminder } from "@/lib/line/notifications";

export const dynamic = "force-dynamic";

const REMINDER_DAYS = [7, 3, 1];
const DAY_MS = 86_400_000;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  // Active trials still in the future
  const subs = await prisma.subscription.findMany({
    where: {
      trialPlan: { not: null },
      trialEndsAt: { gt: now },
    },
    select: {
      trialEndsAt: true,
      org: {
        select: {
          name: true,
          owner: { select: { lineUserId: true } },
        },
      },
    },
  });

  let sent = 0;
  let skipped = 0;

  for (const sub of subs) {
    if (!sub.trialEndsAt) continue;
    const daysLeft = Math.ceil(
      (sub.trialEndsAt.getTime() - now.getTime()) / DAY_MS,
    );
    if (!REMINDER_DAYS.includes(daysLeft)) {
      skipped++;
      continue;
    }
    const lineUserId = sub.org?.owner?.lineUserId;
    if (!lineUserId) {
      skipped++;
      continue;
    }
    const ok = await sendTrialReminder(lineUserId, {
      orgName: sub.org?.name || "บริษัทของคุณ",
      daysLeft,
      trialEndsAt: sub.trialEndsAt,
    });
    if (ok) sent++;
    else skipped++;
  }

  return NextResponse.json({
    success: true,
    sent,
    skipped,
    scanned: subs.length,
    ranAt: now,
  });
}
