// ===========================================
// GET /api/cron/expire-manual-plans
// Daily sweep — ลูกค้าวางบิล/โอน (Subscription.status = manual_invoice) ที่
// billingPeriodEnd ผ่านไปแล้ว → กลับแผนฟรี + รีเซ็ต quota cache (ข้อมูลในชีตยังอยู่ครบ)
//
// คู่กับ expire-trials: vercel.json → { "path": "/api/cron/expire-manual-plans", "schedule": "10 1 * * *" }
// (01:10 UTC = 08:10 Bangkok) · Auth: `Authorization: Bearer ${CRON_SECRET}` — fail closed
// ===========================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PLAN_LABELS, normalisePlan } from "@/lib/plans";
import { INVOICE_STATUS, invoiceEndData } from "@/lib/comp";
import { formatDate } from "@/lib/utils/date";
import { safeAuditLog, systemActorFor } from "@/server/lib/audit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[cron/expire-manual-plans] CRON_SECRET is not set — refusing to run");
    return NextResponse.json({ error: "CRON_SECRET not configured — cron disabled" }, { status: 500 });
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const expired = await prisma.subscription.findMany({
    where: {
      status: INVOICE_STATUS,
      stripeSubscriptionId: null,
      billingPeriodEnd: { lt: now },
    },
    select: { id: true, orgId: true, plan: true, billingPeriodEnd: true },
  });

  let expiredCount = 0;
  for (const sub of expired) {
    // ผูก status/billingPeriodEnd เดิมไว้ใน where — ถ้าทีมงานต่อรอบใหม่ระหว่าง sweep จะไม่ถูกทับ
    const r = await prisma.subscription.updateMany({
      where: { id: sub.id, status: INVOICE_STATUS, billingPeriodEnd: sub.billingPeriodEnd },
      data: invoiceEndData(),
    });
    if (r.count === 0) continue;
    expiredCount++;
    const actor = await systemActorFor(sub.orgId);
    if (!actor) continue;
    await safeAuditLog({
      data: {
        orgId: sub.orgId,
        userId: actor,
        action: "plan_expire",
        entityType: "subscription",
        entityRef: sub.id,
        summary: `รอบวางบิล ${PLAN_LABELS[normalisePlan(sub.plan)]} สิ้นสุด ${formatDate(sub.billingPeriodEnd)} → แผนฟรี (ระบบ)`,
      },
    });
  }

  return NextResponse.json({ success: true, expiredCount, ranAt: now });
}
