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
// รอบที่ 2 ในไฟล์เดียวกัน: ลูกค้าวางบิล/โอน (status manual_invoice) เตือนก่อน billingPeriodEnd
// 7 / 3 / 1 วัน ด้วยข้อความ "ติดต่อทีมงานเพื่อต่ออายุ" — mark `invoice-reminder:<stage>`
// นับใหม่ทุกรอบ (mark ที่เก่ากว่า billingPeriodStart = รอบก่อน)
//
// Auth: requires `Authorization: Bearer ${CRON_SECRET}` (matches Vercel Cron).
// ===========================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendInvoiceReminder, sendTrialReminder } from "@/lib/line/notifications";
import { INVOICE_STATUS } from "@/lib/comp";
import { PLAN_LABELS, normalisePlan } from "@/lib/plans";
import { daysLeftUntil, dueStages, parseStageMark } from "@/lib/reminder-stages";

export const dynamic = "force-dynamic";

const REMINDER_MARK = "trial-reminder:";
const INVOICE_MARK = "invoice-reminder:";

/** mark ที่ส่งแล้วของแต่ละ org ในรอบปัจจุบัน (mark ก่อน periodStart = รอบก่อน ไม่นับ) */
async function loadSentStages(
  prefix: string,
  rows: { orgId: string; periodStart: Date | null }[],
): Promise<Map<string, Set<number>>> {
  const sent = new Map<string, Set<number>>();
  if (rows.length === 0) return sent;
  const marks = await prisma.auditLog.findMany({
    where: {
      orgId: { in: rows.map((r) => r.orgId) },
      entityType: "subscription",
      summary: { startsWith: prefix },
    },
    select: { orgId: true, summary: true, createdAt: true },
  });
  for (const m of marks) {
    const row = rows.find((r) => r.orgId === m.orgId);
    if (!row) continue;
    if (row.periodStart && m.createdAt < row.periodStart) continue;
    const stage = parseStageMark(m.summary, prefix);
    if (stage === null) continue;
    if (!sent.has(m.orgId)) sent.set(m.orgId, new Set());
    sent.get(m.orgId)!.add(stage);
  }
  return sent;
}

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

  // Stages already sent for THIS trial — marks older than the trial start belong to a previous trial.
  const sentStages = await loadSentStages(
    REMINDER_MARK,
    subs.map((s) => ({ orgId: s.orgId, periodStart: s.trialStartedAt })),
  );

  let sent = 0;
  let skipped = 0;

  for (const sub of subs) {
    if (!sub.trialEndsAt) continue;
    const daysLeft = daysLeftUntil(sub.trialEndsAt, now);
    // Stages whose window we are inside and have not sent yet. If several are
    // due at once (cron was down), send ONE message and mark them all.
    const due = dueStages(daysLeft, sentStages.get(sub.orgId) ?? new Set<number>());
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

  // ===== รอบที่ 2: ลูกค้าวางบิล/โอน — เตือนก่อนรอบหมด (ไม่มี Stripe ตัดเงินอัตโนมัติ) =====
  const invoices = await prisma.subscription.findMany({
    where: {
      status: INVOICE_STATUS,
      stripeSubscriptionId: null,
      billingPeriodEnd: { gt: now },
    },
    select: {
      id: true,
      orgId: true,
      plan: true,
      billingPeriodStart: true,
      billingPeriodEnd: true,
      org: {
        select: {
          name: true,
          ownerId: true,
          owner: { select: { lineUserId: true } },
        },
      },
    },
  });
  const invoiceSent = await loadSentStages(
    INVOICE_MARK,
    invoices.map((s) => ({ orgId: s.orgId, periodStart: s.billingPeriodStart })),
  );
  let invoiceSentCount = 0;
  let invoiceSkipped = 0;
  for (const sub of invoices) {
    if (!sub.billingPeriodEnd) continue;
    const daysLeft = daysLeftUntil(sub.billingPeriodEnd, now);
    const due = dueStages(daysLeft, invoiceSent.get(sub.orgId) ?? new Set<number>());
    if (due.length === 0) {
      invoiceSkipped++;
      continue;
    }
    const lineUserId = sub.org?.owner?.lineUserId;
    if (!lineUserId) {
      invoiceSkipped++;
      continue;
    }
    const ok = await sendInvoiceReminder(lineUserId, {
      orgName: sub.org?.name || "บริษัทของคุณ",
      planLabel: PLAN_LABELS[normalisePlan(sub.plan)],
      daysLeft,
      periodEnd: sub.billingPeriodEnd,
    });
    if (!ok) {
      invoiceSkipped++;
      continue; // not marked → retried on the next run
    }
    invoiceSentCount++;
    await prisma.auditLog.createMany({
      data: due.map((stage) => ({
        orgId: sub.orgId,
        userId: sub.org!.ownerId,
        action: "update",
        entityType: "subscription",
        entityRef: sub.id,
        summary: `${INVOICE_MARK}${stage}`,
      })),
    });
  }

  return NextResponse.json({
    success: true,
    sent,
    skipped,
    scanned: subs.length,
    invoice: { sent: invoiceSentCount, skipped: invoiceSkipped, scanned: invoices.length },
    ranAt: now,
  });
}
