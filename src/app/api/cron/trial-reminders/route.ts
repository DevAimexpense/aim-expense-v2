// ===========================================
// GET /api/cron/trial-reminders
// Daily sweep — push a LINE reminder to the org owner when their Pro trial
// is 7 / 3 / 1 days from expiring, so they can renew via LINE.
//
// Schedule via Vercel Cron in vercel.json:
//   { "path": "/api/cron/trial-reminders", "schedule": "30 1 * * *" }
// (runs at 01:30 UTC = 08:30 Bangkok — just after expire-trials)
//
// De-dup (BIL-11): each stage {7,3,1} fires once per subscription, as a
// WINDOW (`daysLeft <= stage`) rather than an exact-day hit, so a cron run
// that is late or skipped still sends the reminder the next day instead of
// never. "Already sent" is recorded as an AuditLog row
// (entityType=subscription, summary=`trial-reminder:<stage>`) — no schema
// change needed.
//
// Auth: requires `Authorization: Bearer ${CRON_SECRET}` (matches Vercel Cron).
// ===========================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendTrialReminder } from "@/lib/line/notifications";

export const dynamic = "force-dynamic";

const REMINDER_DAYS = [7, 3, 1];
const DAY_MS = 86_400_000;
const REMINDER_MARK = "trial-reminder:";

export async function GET(req: NextRequest) {
  // Fail CLOSED when CRON_SECRET is missing — otherwise anyone could spam
  // every trial owner on LINE.
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[cron/trial-reminders] CRON_SECRET is not set — refusing to run");
    return NextResponse.json(
      { error: "CRON_SECRET not configured — cron disabled" },
      { status: 500 },
    );
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
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
      id: true,
      orgId: true,
      trialStartedAt: true,
      trialEndsAt: true,
      org: {
        select: {
          name: true,
          ownerId: true,
          owner: { select: { lineUserId: true } },
        },
      },
    },
  });

  // Stages already sent for THIS trial (one query for all orgs). Marks older
  // than the trial start belong to a previous trial and are ignored.
  const marks = subs.length
    ? await prisma.auditLog.findMany({
        where: {
          orgId: { in: subs.map((s) => s.orgId) },
          entityType: "subscription",
          summary: { startsWith: REMINDER_MARK },
        },
        select: { orgId: true, summary: true, createdAt: true },
      })
    : [];
  const sentStages = new Map<string, Set<number>>();
  for (const m of marks) {
    const sub = subs.find((s) => s.orgId === m.orgId);
    if (!sub) continue;
    if (sub.trialStartedAt && m.createdAt < sub.trialStartedAt) continue;
    const stage = Number(m.summary?.slice(REMINDER_MARK.length));
    if (!Number.isFinite(stage)) continue;
    if (!sentStages.has(m.orgId)) sentStages.set(m.orgId, new Set());
    sentStages.get(m.orgId)!.add(stage);
  }

  let sent = 0;
  let skipped = 0;

  for (const sub of subs) {
    if (!sub.trialEndsAt) continue;
    const daysLeft = Math.ceil(
      (sub.trialEndsAt.getTime() - now.getTime()) / DAY_MS,
    );
    // Stages whose window we are inside and have not sent yet. If several are
    // due at once (cron was down), send ONE message and mark them all.
    const done = sentStages.get(sub.orgId) ?? new Set<number>();
    const due = REMINDER_DAYS.filter((d) => daysLeft <= d && !done.has(d));
    if (due.length === 0) {
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
    if (!ok) {
      skipped++;
      continue; // not marked → retried on the next run
    }
    sent++;
    // BIL-24: ไม่มี users.id="system" (FK) → ลงชื่อเจ้าของ org · mark ล้ม = ส่งซ้ำวันถัดไป จึงต้องไม่ล้ม
    await prisma.auditLog.createMany({
      data: due.map((stage) => ({
        orgId: sub.orgId,
        userId: sub.org!.ownerId,
        action: "update",
        entityType: "subscription",
        entityRef: sub.id,
        summary: `${REMINDER_MARK}${stage}`,
      })),
    });
  }

  return NextResponse.json({
    success: true,
    sent,
    skipped,
    scanned: subs.length,
    ranAt: now,
  });
}
