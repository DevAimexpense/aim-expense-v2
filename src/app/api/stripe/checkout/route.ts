// ===========================================
// POST /api/stripe/checkout
// Create a Stripe Checkout Session for subscription upgrade.
//
// Body:
//   { tier: "basic" | "pro" | "business" | "max",
//     interval: "monthly" | "yearly",
//     refCode?: string  // affiliate/referral code (read from cookie if absent) }
//
// Returns:
//   { url: "https://checkout.stripe.com/..." }
//
// Flow:
//   1. Auth + active org check (comped/lifetime orgs are blocked — nothing to pay)
//   2. Resolve price via lookup_key + assert amount/currency match PLAN_PRICING_THB
//   3. Org already has a live Stripe subscription → update its price in place
//      (one subscription per org, prorated) and return to /account/billing
//   4. Find/create Stripe Customer for the org (idempotent)
//   5. Apply ref-coupon: Referral row first; `aim_ref` cookie/body code only
//      after creating the Referral row for this org (BIL-09)
//   6. Create checkout.session with success/cancel URLs back to /account/billing
//      (keeping remaining trial days via subscription_data.trial_end)
// ===========================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type Stripe from "stripe";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { isInvoiceActive } from "@/lib/comp";
import {
  stripe,
  getPriceByTierInterval,
  REFERRAL_COUPON_ID,
  ENTITLED_STATUSES,
} from "@/lib/stripe";
import {
  PLAN_TIERS,
  PLAN_PRICING_THB,
  PLAN_LABELS,
  REFERRAL_DISCOUNT,
  isInTrial,
  type PlanTier,
} from "@/lib/plans";
import { safeAuditLog } from "@/server/lib/audit";

// Stripe rejects `trial_end` closer than 48h; add a little slack for clock skew.
const TRIAL_END_MIN_AHEAD_S = 48 * 3600 + 10 * 60;

const Body = z.object({
  tier: z.enum(
    PLAN_TIERS.filter(
      (t): t is Exclude<PlanTier, "free" | "enterprise"> =>
        t !== "free" && t !== "enterprise",
    ) as ["basic", "pro", "business", "max"],
  ),
  interval: z.enum(["monthly", "yearly"]),
  refCode: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.activeOrgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orgId = session.activeOrgId;
  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Invalid input" },
      { status: 400 },
    );
  }

  const { tier, interval } = parsed;

  // Resolve ref code: explicit body > cookie
  const refCode =
    parsed.refCode || req.cookies.get("aim_ref")?.value || undefined;

  // Look up org + subscription
  const [org, sub] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true, name: true, ownerId: true },
    }),
    prisma.subscription.findUnique({ where: { orgId } }),
  ]);
  if (!org) {
    return NextResponse.json({ error: "ไม่พบ org" }, { status: 404 });
  }

  // วางบิล/โอนกับทีมงาน (รอบยังไม่หมด) — ถ้าให้ผ่าน Stripe จะจ่ายสองทาง
  if (isInvoiceActive(sub)) {
    return NextResponse.json(
      {
        error:
          "แพ็กเกจนี้ชำระผ่านการวางบิลกับทีมงานอยู่ — ไม่ต้องชำระผ่าน Stripe หากต้องการเปลี่ยนแพ็กเกจ กรุณาติดต่อทีมงาน",
      },
      { status: 400 },
    );
  }

  // ฟรีตลอดชีพ (comped จากหลังบ้าน) — ไม่มีอะไรต้องจ่าย และ webhook จะไม่ทับ plan อยู่แล้ว
  if (sub?.isBetaTester) {
    return NextResponse.json(
      {
        error:
          "บัญชีนี้ได้รับสิทธิ์ใช้งานฟรีจากทีมงานแล้ว ไม่ต้องชำระเงินผ่าน Stripe — หากต้องการเปลี่ยนแพ็กเกจ กรุณาติดต่อทีมงาน",
      },
      { status: 400 },
    );
  }

  // Resolve price via lookup_key
  let price: Stripe.Price;
  try {
    price = await getPriceByTierInterval(tier, interval);
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Price lookup failed",
      },
      { status: 500 },
    );
  }

  // Never charge an amount the website did not advertise: the Stripe price
  // must equal PLAN_PRICING_THB (in satang) and be in THB.
  const expectedTHB = PLAN_PRICING_THB[tier]?.[interval];
  if (
    expectedTHB === undefined ||
    price.currency !== "thb" ||
    price.unit_amount !== expectedTHB * 100
  ) {
    console.error(
      `[stripe-checkout] price mismatch for ${tier}/${interval}: Stripe ${price.id} = ${price.unit_amount} ${price.currency}, expected ${(expectedTHB ?? 0) * 100} thb`,
    );
    return NextResponse.json(
      {
        error:
          "ราคาในระบบไม่ตรงกับราคาใน Stripe — ระงับการชำระเงินชั่วคราวเพื่อความปลอดภัย กรุณาติดต่อทีมงาน",
      },
      { status: 500 },
    );
  }
  const priceId = price.id;

  // BIL-02: one Stripe subscription per org. If a live one exists, change its
  // price in place (prorated) instead of opening a second Checkout — a second
  // session would double-bill and orphan the old subscription id in our DB.
  if (sub?.stripeSubscriptionId) {
    let existing: Stripe.Subscription | null = null;
    try {
      existing = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId);
    } catch (err) {
      // BIL-22: เฉพาะ id ที่ไม่มีจริง (สร้างใต้ test key / ถูกลบ) เท่านั้นที่ไปเปิด Checkout ใหม่ได้
      // error อื่น (timeout/5xx/429) ต้องหยุด — ไม่งั้น org ที่จ่ายอยู่จะได้ subscription ที่ 2
      const code = (err as { code?: string; statusCode?: number })?.code;
      const status = (err as { statusCode?: number })?.statusCode;
      if (code === "resource_missing" || status === 404) {
        existing = null;
      } else {
        console.error("[stripe-checkout] subscriptions.retrieve failed", err);
        return NextResponse.json(
          { error: "เชื่อมต่อ Stripe ไม่สำเร็จชั่วคราว กรุณาลองใหม่อีกครั้ง" },
          { status: 503 },
        );
      }
    }
    if (existing && ENTITLED_STATUSES.has(existing.status)) {
      const item = existing.items.data[0];
      if (!item) {
        return NextResponse.json(
          { error: "ไม่พบรายการในแพ็กเกจปัจจุบันบน Stripe กรุณาติดต่อทีมงาน" },
          { status: 500 },
        );
      }
      if (item.price.id === priceId) {
        // Already on this exact price — nothing to change
        return NextResponse.json({ url: "/account/billing?stripe=updated" });
      }
      try {
        await stripe.subscriptions.update(existing.id, {
          items: [{ id: item.id, price: priceId }],
          proration_behavior: "create_prorations",
          cancel_at_period_end: false, // BIL-23: เลือกแพ็กเกจใหม่ = ยกเลิกคำสั่ง "ยกเลิกสิ้นรอบ" ที่ค้างอยู่
          metadata: {
            ...existing.metadata,
            orgId,
            ownerUserId: org.ownerId,
            tier,
            interval,
          },
        });
      } catch (err) {
        console.error("[stripe-checkout] subscription update failed", err);
        return NextResponse.json(
          { error: err instanceof Error ? err.message : "Stripe error" },
          { status: 500 },
        );
      }
      await safeAuditLog({
        data: {
          orgId,
          userId: session.userId,
          action: "update",
          entityType: "subscription",
          entityRef: existing.id,
          summary: `เปลี่ยนแพ็กเกจเป็น ${PLAN_LABELS[tier]} (${interval}) — รอ Stripe ยืนยัน`,
        },
      });
      // DB plan/limits are synced by the `customer.subscription.updated` webhook
      return NextResponse.json({ url: "/account/billing?stripe=updated" });
    }
    // canceled / incomplete_expired / unknown → proceed with a new Checkout Session
  }

  // Owner email for receipts
  const owner = await prisma.user.findUnique({
    where: { id: org.ownerId },
    select: { email: true, lineEmail: true, lineDisplayName: true },
  });
  const customerEmail =
    owner?.email || owner?.lineEmail || `${org.id}@aimexpense.com`;

  // Get/create Stripe Customer
  let stripeCustomerId = sub?.stripeCustomerId || undefined;
  // Verify a stored customer still exists on the CURRENT Stripe account/mode.
  // A stale ID — e.g. created under test/sandbox before switching to live keys,
  // or a customer that was deleted — makes checkout fail with "No such
  // customer". If it no longer resolves, drop it and recreate below.
  if (stripeCustomerId) {
    try {
      const existing = await stripe.customers.retrieve(stripeCustomerId);
      if ("deleted" in existing && existing.deleted) stripeCustomerId = undefined;
    } catch {
      stripeCustomerId = undefined;
    }
  }
  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      email: customerEmail,
      name: org.name,
      metadata: { orgId, ownerUserId: org.ownerId },
    });
    stripeCustomerId = customer.id;
    await prisma.subscription.update({
      where: { orgId },
      data: { stripeCustomerId },
    });
  }

  // BIL-09: the discount must follow the same record the partner's commission
  // follows — the Referral row written at signup — not the 30-day `aim_ref`
  // cookie (which expires exactly when the trial does).
  // Org ที่ยังไม่มี Referral row แต่มีโค้ด (cookie/body): ต้อง "สร้าง Referral row ก่อน"
  // แล้วค่อยให้คูปอง — ไม่งั้นลูกค้าได้ส่วนลดแต่พาร์ตเนอร์ไม่ได้คอม (ไม่มี row ให้ webhook ยืนยัน)
  // กติกาเดียวกับ create-company: พาร์ตเนอร์ active, ไม่ใช่ตัวเอง, org ยังไม่เคยถูกแนะนำ
  // Self-referral is blocked in both paths as defence-in-depth.
  let discounts: { coupon: string }[] | undefined;
  let validRefPartnerId: string | null = null;
  let appliedRefCode: string | undefined;

  const referral = await prisma.referral.findUnique({
    where: { referredOrgId: orgId },
    include: { partner: { select: { id: true, code: true, isActive: true, userId: true } } },
  });
  if (referral) {
    // org เคยถูกแนะนำแล้ว (ไม่ว่าสถานะใด) → ไม่สร้างซ้ำ · BIL-33: คูปอง "ใบแรก" ให้เฉพาะ row ที่ยัง pending
    // (confirmed = จ่ายครบ 2 ใบแล้ว = เคยได้ส่วนลดไปแล้ว) → ยกเลิกแล้วสมัครใหม่ไม่ได้ลดซ้ำ
    if (
      referral.status === "pending" &&
      referral.partner.isActive &&
      referral.partner.userId !== session.userId
    ) {
      discounts = [{ coupon: REFERRAL_COUPON_ID }];
      validRefPartnerId = referral.partner.id;
      appliedRefCode = referral.partner.code;
    }
  } else if (refCode && /^[A-Za-z0-9-]{4,16}$/.test(refCode)) {
    const created = await createReferralAtCheckout(orgId, refCode, session.userId);
    if (created) {
      discounts = [{ coupon: REFERRAL_COUPON_ID }];
      validRefPartnerId = created.partnerId;
      appliedRefCode = refCode;
    }
  }

  // Keep the remaining trial days: without `trial_end` Stripe charges today and
  // the unused trial is lost. Stripe needs it ≥ 48h ahead; closer than that we
  // simply start billing now (the customer loses < 2 days, acceptable).
  let trialEnd: number | undefined;
  if (sub && isInTrial(sub) && sub.trialEndsAt) {
    const ts = Math.floor(sub.trialEndsAt.getTime() / 1000);
    if (ts - Math.floor(Date.now() / 1000) >= TRIAL_END_MIN_AHEAD_S) trialEnd = ts;
  }

  // Use NEXT_PUBLIC_APP_URL or fall back to request origin
  const origin =
    process.env.NEXT_PUBLIC_APP_URL ||
    req.headers.get("origin") ||
    "http://localhost:3000";

  try {
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      // PromptPay is a single-payment method and cannot be used in
      // `subscription` mode — only card supports recurring billing.
      payment_method_types: ["card"],
      customer: stripeCustomerId,
      line_items: [{ price: priceId, quantity: 1 }],
      // Apply coupon as session-level `discounts` (only if valid + present)
      ...(discounts ? { discounts } : { allow_promotion_codes: true }),
      subscription_data: {
        ...(trialEnd ? { trial_end: trialEnd } : {}),
        // tier/interval here are a FALLBACK only — the webhook resolves the
        // real tier from the price (BIL-01).
        metadata: {
          orgId,
          ownerUserId: org.ownerId,
          tier,
          interval,
          ...(validRefPartnerId ? { refPartnerId: validRefPartnerId } : {}),
          ...(appliedRefCode ? { refCode: appliedRefCode } : {}),
        },
      },
      success_url: `${origin}/account/billing?stripe=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/account/billing?stripe=cancelled`,
      locale: "th",
      metadata: {
        orgId,
        tier,
        interval,
        ...(validRefPartnerId ? { refPartnerId: validRefPartnerId } : {}),
      },
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (err) {
    console.error("[stripe-checkout]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Stripe error" },
      { status: 500 },
    );
  }
}

/**
 * BIL-09: สร้าง Referral row ตอน checkout ให้ org ที่ยังไม่มี (เช่น สมัครก่อนมีโค้ด แล้วค่อยกดลิงก์พาร์ตเนอร์)
 * ใช้เงื่อนไขเดียวกับ create-company: พาร์ตเนอร์มีจริง + active + ไม่ใช่ผู้ใช้คนเดียวกัน
 * คืน `{ partnerId }` เมื่อมี row (สร้างใหม่ หรือมีคนสร้างพร้อมกันพอดี) · null = ไม่ให้คูปอง
 */
async function createReferralAtCheckout(
  orgId: string,
  refCode: string,
  userId: string,
): Promise<{ partnerId: string } | null> {
  const partner = await prisma.affiliatePartner.findUnique({
    where: { code: refCode },
    select: { id: true, isActive: true, userId: true },
  });
  if (!partner || !partner.isActive || partner.userId === userId) return null;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.referral.create({
        data: {
          partnerId: partner.id,
          referredOrgId: orgId,
          code: refCode,
          status: "pending",
          discountApplied: REFERRAL_DISCOUNT.discountAppliedCode,
        },
      });
      await tx.affiliatePartner.update({
        where: { id: partner.id },
        data: { totalReferrals: { increment: 1 } },
      });
    });
    return { partnerId: partner.id };
  } catch (e) {
    // P2002 = มี row โผล่มาระหว่างนั้น (ดับเบิลคลิก checkout) → ใช้ row นั้นถ้าเป็นพาร์ตเนอร์เดียวกัน
    const code = (e as { code?: string })?.code;
    if (code === "P2002") {
      const existing = await prisma.referral.findUnique({
        where: { referredOrgId: orgId },
        select: { partnerId: true, status: true },
      });
      if (existing?.partnerId === partner.id && existing.status === "pending") {
        return { partnerId: partner.id };
      }
      return null;
    }
    console.warn("[stripe-checkout] referral capture failed — no coupon applied:", e);
    return null;
  }
}
