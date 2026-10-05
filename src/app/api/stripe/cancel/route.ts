// ===========================================
// POST /api/stripe/cancel   body: { action: "cancel" | "resume" }
//
// ยกเลิกแพ็กเกจแบบ "สิ้นรอบบิล" (cancel_at_period_end) — ลูกค้าใช้ต่อได้จนจบรอบ
// ที่จ่ายไปแล้ว แล้ว Stripe ส่ง customer.subscription.deleted → webhook
// downgrade เป็น Free ให้เอง · "resume" = เปลี่ยนใจก่อนสิ้นรอบ
//
// เฉพาะ admin ของ org ที่กำลังใช้งานอยู่
// ===========================================

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getOrgContext } from "@/lib/auth/middleware";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
  }
  const org = await getOrgContext(session.userId, session.activeOrgId);
  if (!org) {
    return NextResponse.json({ error: "กรุณาเลือกองค์กร" }, { status: 400 });
  }
  if (org.role !== "admin") {
    return NextResponse.json(
      { error: "เฉพาะ Admin เท่านั้นที่ยกเลิกแพ็กเกจได้" },
      { status: 403 },
    );
  }

  const body = (await req.json().catch(() => null)) as { action?: string } | null;
  const action = body?.action;
  if (action !== "cancel" && action !== "resume") {
    return NextResponse.json({ error: "คำสั่งไม่ถูกต้อง" }, { status: 400 });
  }

  const sub = await prisma.subscription.findUnique({
    where: { orgId: org.orgId },
    select: { id: true, stripeSubscriptionId: true },
  });
  if (!sub?.stripeSubscriptionId) {
    return NextResponse.json(
      { error: "ไม่มีแพ็กเกจแบบชำระเงินที่ต้องยกเลิก" },
      { status: 400 },
    );
  }

  const cancel = action === "cancel";
  try {
    const updated = await stripe.subscriptions.update(sub.stripeSubscriptionId, {
      cancel_at_period_end: cancel,
    });
    const periodEnd = (updated as typeof updated & { current_period_end?: number })
      .current_period_end;

    // เขียน DB ทันที (webhook จะ sync ซ้ำอีกรอบ — ค่าเดียวกัน)
    await prisma.subscription.update({
      where: { id: sub.id },
      data: {
        cancelAtPeriodEnd: cancel,
        ...(periodEnd ? { currentPeriodEnd: new Date(periodEnd * 1000) } : {}),
      },
    });
    await prisma.auditLog.create({
      data: {
        orgId: org.orgId,
        userId: session.userId,
        action: "update",
        entityType: "subscription",
        entityRef: sub.id,
        summary: cancel
          ? "ยกเลิกแพ็กเกจ (มีผลสิ้นรอบบิล)"
          : "ยกเลิกคำขอยกเลิก — ใช้แพ็กเกจต่อ",
      },
    });
    return NextResponse.json({ success: true, cancelAtPeriodEnd: cancel });
  } catch (err) {
    console.error("[stripe-cancel]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Stripe error" },
      { status: 500 },
    );
  }
}
