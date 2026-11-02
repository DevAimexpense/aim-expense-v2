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
import { PLAN_LABELS, normalisePlan } from "@/lib/plans";
import { quotaCacheFor } from "@/lib/comp";
import { safeAuditLog, systemActorFor } from "@/server/lib/audit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}` header.
  // Fail CLOSED: with no secret configured this route must not be callable by
  // anyone on the internet (it rewrites every org's quota).
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[cron/expire-trials] CRON_SECRET is not set — refusing to run");
    return NextResponse.json(
      { error: "CRON_SECRET not configured — cron disabled" },
      { status: 500 },
    );
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  // Find all subs with an expired trial that hasn't been downgraded yet
  // (trialPlan still set + trialEndsAt in past + plan still "free")
  const expired = await prisma.subscription.findMany({
    where: {
      trialEndsAt: { lt: now },
      trialPlan: { not: null },
    },
    select: { id: true, orgId: true, plan: true, isBetaTester: true },
  });

  if (expired.length === 0) {
    return NextResponse.json({ success: true, expiredCount: 0, ranAt: now });
  }

  // Clear trial fields + reset the quota cache to the org's REAL plan (BIL-05).
  // A backoffice "free months" grant on top of a paid Stripe plan (or a
  // lifetime comp) must fall back to that plan's limits, not to Free.
  for (const sub of expired) {
    const plan = normalisePlan(sub.plan);
    await prisma.subscription.update({
      where: { id: sub.id },
      data: {
        trialPlan: null,
        trialStartedAt: null,
        trialEndsAt: null,
        ...quotaCacheFor(plan),
      },
    });

    await safeAuditLog({
      data: {
        orgId: sub.orgId,
        userId: (await systemActorFor(sub.orgId)) || "", // BIL-24: ไม่มี user "system" → ใช้เจ้าของ org
        action: "update",
        entityType: "subscription",
        entityRef: sub.id,
        summary:
          plan === "free"
            ? "Trial expired → downgraded to Free Forever"
            : `Trial expired → back to ${PLAN_LABELS[plan]}${sub.isBetaTester ? " (lifetime)" : ""}`,
      },
    });
  }

  return NextResponse.json({
    success: true,
    expiredCount: expired.length,
    ranAt: now,
  });
}
