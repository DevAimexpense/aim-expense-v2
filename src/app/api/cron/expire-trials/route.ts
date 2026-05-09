// ===========================================
// GET /api/cron/expire-trials
// Daily sweep — expire trials whose trialEndsAt is in the past, downgrade
// the org's effective limits + clear trial fields.
//
// Schedule via Vercel Cron in vercel.json:
//   { "crons": [{ "path": "/api/cron/expire-trials", "schedule": "0 1 * * *" }] }
// (runs at 01:00 UTC = 08:00 Bangkok)
//
// Auth: requires `Authorization: Bearer ${CRON_SECRET}` (matches Vercel Cron).
// In dev, set CRON_SECRET in .env.local to test manually.
// ===========================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PLAN_LIMITS } from "@/lib/plans";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}` header
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const freeLimits = PLAN_LIMITS.free;

  // Find all subs with an expired trial that hasn't been downgraded yet
  // (trialPlan still set + trialEndsAt in past + plan still "free")
  const expired = await prisma.subscription.findMany({
    where: {
      trialEndsAt: { lt: now },
      trialPlan: { not: null },
    },
    select: { id: true, orgId: true },
  });

  if (expired.length === 0) {
    return NextResponse.json({ success: true, expiredCount: 0, ranAt: now });
  }

  // Batch update — clear trial fields + reset limits to plan ("free" by default)
  // Note: if user has already upgraded to a paid plan during the trial, we keep
  // their paid plan; we only clear the trial markers.
  for (const sub of expired) {
    await prisma.subscription.update({
      where: { id: sub.id },
      data: {
        trialPlan: null,
        trialStartedAt: null,
        trialEndsAt: null,
        // reset limits to current `plan` (likely "free" unless already upgraded)
        maxMembers: freeLimits.users,
        maxEvents: 3, // legacy field, keep close to free
        scanCredits: freeLimits.ocrPerMonth,
      },
    });

    await prisma.auditLog.create({
      data: {
        orgId: sub.orgId,
        userId: "system", // synthetic — cron runs without user context
        action: "update",
        entityType: "subscription",
        entityRef: sub.id,
        summary: "Trial expired → downgraded to Free Forever",
      },
    });
  }

  return NextResponse.json({
    success: true,
    expiredCount: expired.length,
    ranAt: now,
  });
}
