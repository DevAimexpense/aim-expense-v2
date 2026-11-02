// ===========================================
// POST /api/stripe/webhook
// Stripe webhook handler — verifies signature + reacts to subscription events.
//
// Events handled:
//   - checkout.session.completed  → upgrade plan + cache priceId/interval
//   - customer.subscription.updated → sync plan/interval/status changes
//   - customer.subscription.deleted → downgrade to free + clear stripe fields
//   - invoice.paid                 → on month-2 of a referral, mark confirmed + schedule commissions
//   - invoice.payment_failed       → log + mark cancelAtPeriodEnd warning
//
// Webhook secret stored in STRIPE_WEBHOOK_SECRET (rotates each `stripe listen`
// invocation in dev — pi must update env when restarting CLI).
// ===========================================

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import {
  stripe,
  tierIntervalFromPrice,
  ENTITLED_STATUSES,
  type BillingInterval,
} from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import {
  AFFILIATE_COMMISSION_SCHEDULE,
  computeCommission,
  PLAN_LIMITS,
  type PlanTier,
} from "@/lib/plans";
import { quotaCacheFor } from "@/lib/comp";
import { safeAuditLog, systemActorFor } from "@/server/lib/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // Stripe webhook signature verify needs node, not edge

const SIG_HEADER = "stripe-signature";

function tierFromMetadata(meta: Stripe.Metadata | null | undefined): PlanTier {
  const t = (meta?.tier || "").toLowerCase();
  if (t === "basic" || t === "pro" || t === "business" || t === "max") return t;
  return "free";
}

function intervalFromMetadata(
  meta: Stripe.Metadata | null | undefined,
): BillingInterval {
  return meta?.interval === "yearly" ? "yearly" : "monthly";
}

/**
 * BIL-01: the tier/interval the customer is actually paying for comes from the
 * subscription's price, not from metadata (which is written once at checkout
 * and goes stale after a plan change in the Customer Portal / Dashboard).
 * Metadata is only a fallback for an unknown price, and we log mismatches.
 */
function resolveTierInterval(s: Stripe.Subscription): {
  tier: PlanTier;
  interval: BillingInterval;
} {
  const item = s.items.data[0];
  const fromPrice = tierIntervalFromPrice(item?.price);
  const metaTier = tierFromMetadata(s.metadata);
  const metaInterval = intervalFromMetadata(s.metadata);

  if (!fromPrice) {
    console.warn(
      `[stripe-webhook] ${s.id}: unknown price ${item?.price?.id ?? "(none)"} — falling back to metadata (${metaTier} ${metaInterval})`,
    );
    return { tier: metaTier, interval: metaInterval };
  }
  if (fromPrice.tier !== metaTier || fromPrice.interval !== metaInterval) {
    console.warn(
      `[stripe-webhook] ${s.id}: metadata says ${metaTier} ${metaInterval} but price ${item?.price?.id} is ${fromPrice.tier} ${fromPrice.interval} — using price`,
    );
  }
  return fromPrice;
}

/** BIL-03: SDK 22 / API 2026-03-25 moved `current_period_end` onto the item. */
function periodEndOf(s: Stripe.Subscription): Date | null {
  const ts = s.items.data[0]?.current_period_end;
  return ts ? new Date(ts * 1000) : null;
}

export async function POST(req: NextRequest) {
  const sig = req.headers.get(SIG_HEADER);
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !secret) {
    return NextResponse.json(
      { error: "Webhook signature missing or secret not configured" },
      { status: 400 },
    );
  }

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Invalid signature";
    console.error("[stripe-webhook] signature verify failed:", msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  console.log(`[stripe-webhook] ${event.type} (${event.id})`);

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await handleSubscriptionUpdate(event.data.object as Stripe.Subscription);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      case "invoice.paid":
        await handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;
      case "invoice.payment_failed":
        await handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;
      case "charge.refunded":
        await handleChargeRefunded(event.data.object as Stripe.Charge);
        break;
      default:
        // No-op for unhandled events; Stripe will mark as delivered
        console.log(`[stripe-webhook] unhandled event type: ${event.type}`);
    }
  } catch (err) {
    console.error(`[stripe-webhook] handler error for ${event.type}:`, err);
    // Return 500 so Stripe retries
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "handler failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({ received: true });
}

// ===== Handlers =====

async function handleCheckoutCompleted(s: Stripe.Checkout.Session) {
  const orgId = s.metadata?.orgId;
  if (!orgId) {
    console.warn("[stripe-webhook] checkout.completed missing orgId metadata");
    return;
  }
  // The actual subscription record will arrive via `customer.subscription.created`.
  // Just record the audit + capture stripe customer/sub IDs preemptively.
  if (s.customer && typeof s.customer === "string") {
    await prisma.subscription.update({
      where: { orgId },
      data: { stripeCustomerId: s.customer },
    });
  }
  await safeAuditLog({
    data: {
      orgId,
      userId: s.metadata?.ownerUserId || (await systemActorFor(orgId)) || "",
      action: "update",
      entityType: "subscription",
      entityRef: s.id,
      summary: `Checkout completed (session ${s.id})`,
    },
  });
}

async function handleSubscriptionUpdate(s: Stripe.Subscription) {
  const orgId = s.metadata?.orgId;
  if (!orgId) {
    // Sometimes the subscription metadata is missing; try resolve via customer
    const customer = await prisma.subscription.findFirst({
      where: { stripeCustomerId: s.customer as string },
    });
    if (!customer) {
      console.warn("[stripe-webhook] subscription update — orgId not resolvable");
      return;
    }
    return updateSubscriptionRow(customer.orgId, s);
  }
  return updateSubscriptionRow(orgId, s);
}

async function updateSubscriptionRow(orgId: string, s: Stripe.Subscription) {
  const { tier, interval } = resolveTierInterval(s);
  const priceId = s.items.data[0]?.price?.id || null;
  const currentPeriodEnd = periodEndOf(s);

  // ฟรีตลอดชีพ (comped จากหลังบ้าน) → เก็บสถานะ Stripe ไว้ แต่ไม่ทับ plan/quota ที่ทีมงานให้
  const existing = await prisma.subscription.findUnique({
    where: { orgId },
    select: { isBetaTester: true, stripeSubscriptionId: true },
  });
  // BIL-21: subscription เก่า (เช่น incomplete → incomplete_expired หลังลูกค้าสร้างใบใหม่สำเร็จ)
  // ต้องไม่ทับ org ที่จ่ายอยู่ด้วยอันใหม่ให้เป็น Free
  if (
    !ENTITLED_STATUSES.has(s.status) &&
    existing?.stripeSubscriptionId &&
    existing.stripeSubscriptionId !== s.id
  ) {
    console.warn(`[stripe-webhook] ignore ${s.status} for stale subscription ${s.id} (org ${orgId} tracks ${existing.stripeSubscriptionId})`);
    return;
  }
  if (existing?.isBetaTester) {
    await prisma.subscription.update({
      where: { orgId },
      data: {
        stripeSubscriptionId: s.id,
        stripePriceId: priceId,
        billingInterval: interval,
        currentPeriodEnd,
        cancelAtPeriodEnd: s.cancel_at_period_end,
      },
    });
    return;
  }

  // BIL-04: only an entitled status (active / trialing / past_due) unlocks the
  // paid tier. incomplete / incomplete_expired / unpaid / canceled → Free, but
  // we keep the Stripe ids so a later `updated` (e.g. 3DS completed) can
  // promote again and `deleted` can still find the row.
  const entitled = ENTITLED_STATUSES.has(s.status);
  const planToStore: PlanTier = entitled ? tier : "free";

  await prisma.subscription.update({
    where: { orgId },
    data: {
      plan: planToStore,
      status: s.status,
      stripeSubscriptionId: s.id,
      stripePriceId: priceId,
      billingInterval: interval,
      currentPeriodEnd,
      cancelAtPeriodEnd: s.cancel_at_period_end,
      // Trial markers are cleared only once the paid plan is really live —
      // an `incomplete` checkout must not cost the customer their trial days.
      ...(entitled
        ? { trialPlan: null, trialStartedAt: null, trialEndsAt: null }
        : {}),
      // Cache quotas for fast read
      ...quotaCacheFor(planToStore),
    },
  });

  await safeAuditLog({
    data: {
      orgId,
      userId: (await systemActorFor(orgId)) || "",
      action: "update",
      entityType: "subscription",
      entityRef: s.id,
      summary: entitled
        ? `Subscription ${s.status}: ${tier} ${interval}`
        : `Subscription ${s.status} (${tier} ${interval}) → plan held at Free until payment settles`,
    },
  });
}

async function handleSubscriptionDeleted(s: Stripe.Subscription) {
  const sub = await prisma.subscription.findFirst({
    where: { stripeSubscriptionId: s.id },
  });
  if (!sub) return;
  const freeLimits = PLAN_LIMITS.free;
  // ฟรีตลอดชีพ (comped) → ล้างแค่ข้อมูล Stripe, plan ที่ทีมงานให้ยังอยู่
  if (sub.isBetaTester) {
    await prisma.subscription.update({
      where: { id: sub.id },
      data: {
        stripeSubscriptionId: null,
        stripePriceId: null,
        billingInterval: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      },
    });
    return;
  }
  await prisma.subscription.update({
    where: { id: sub.id },
    data: {
      plan: "free",
      status: "canceled",
      stripeSubscriptionId: null,
      stripePriceId: null,
      billingInterval: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      maxMembers: freeLimits.users,
      maxEvents: freeLimits.events,
      scanCredits: freeLimits.ocrPerMonth,
    },
  });
  await safeAuditLog({
    data: {
      orgId: sub.orgId,
      userId: (await systemActorFor(sub.orgId)) || "",
      action: "update",
      entityType: "subscription",
      entityRef: s.id,
      summary: "Subscription cancelled — downgraded to Free",
    },
  });

  // Clawback affiliate referral on cancel (unpaid commissions only).
  await clawbackReferral(sub.orgId);
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  // Resolve org via customer
  const customerId = typeof invoice.customer === "string" ? invoice.customer : null;
  if (!customerId) return;

  const sub = await prisma.subscription.findFirst({
    where: { stripeCustomerId: customerId },
  });
  if (!sub) return;

  const orgId = sub.orgId;
  const amountPaid = (invoice.amount_paid || 0) / 100; // satangs → THB

  // Audit
  await safeAuditLog({
    data: {
      orgId,
      userId: (await systemActorFor(orgId)) || "",
      action: "update",
      entityType: "invoice",
      entityRef: invoice.id || "",
      summary: `Invoice paid: ${amountPaid.toFixed(2)} THB`,
    },
  });

  // Affiliate referral lifecycle — confirm referral + schedule commissions on month-2 invoice
  // Use billing_reason to differentiate first invoice from renewals.
  // - "subscription_create" = first invoice (skip — no commission yet, we wait until month 2)
  // - "subscription_cycle" = recurring renewal — month-2+ → confirm + create commission rows
  if (invoice.billing_reason === "subscription_cycle") {
    // BIL-20: เมื่อ checkout ส่ง trial_end ใบแรกที่เก็บเงินจริงก็เป็น "subscription_cycle" แล้ว
    // → ต้องนับใบที่จ่ายจริง (amount_paid > 0) ของ subscription นี้ ให้ครบ 2 ใบก่อนยืนยันค่าคอม
    if (await hasPaidAtLeast(invoice, 2)) {
      await maybeConfirmReferral(orgId, invoice);
    }
  }
}

/** จำนวนใบแจ้งหนี้ที่ "จ่ายจริง" (amount_paid > 0, รวมใบนี้) ของ subscription เดียวกัน ≥ n หรือไม่ */
async function hasPaidAtLeast(invoice: Stripe.Invoice, n: number): Promise<boolean> {
  const subRef = (invoice as Stripe.Invoice & { subscription?: string | { id: string } | null }).subscription
    ?? (invoice.parent as { subscription_details?: { subscription?: string | { id: string } } } | null)
      ?.subscription_details?.subscription;
  const subscriptionId = typeof subRef === "string" ? subRef : subRef?.id;
  if (!subscriptionId) return (invoice.amount_paid || 0) > 0 && n <= 1;
  try {
    const list = await stripe.invoices.list({ subscription: subscriptionId, status: "paid", limit: 24 });
    const paidReal = list.data.filter((inv) => (inv.amount_paid || 0) > 0).length;
    // ใบปัจจุบันอาจยังไม่อยู่ในลิสต์ (eventual consistency) → นับรวมถ้าจ่ายจริงและยังไม่ถูกนับ
    const includesCurrent = list.data.some((inv) => inv.id === invoice.id);
    const total = paidReal + (!includesCurrent && (invoice.amount_paid || 0) > 0 ? 1 : 0);
    return total >= n;
  } catch (e) {
    console.error("[stripe-webhook] invoices.list failed — referral confirmation deferred", e);
    return false; // ปล่อยให้ใบถัดไปยืนยัน ดีกว่าจ่ายคอมก่อนเวลา
  }
}

/**
 * BIL-10: idempotent + atomic. Commissions are created BEFORE the referral is
 * flipped to `confirmed`, inside one transaction, and any monthIndex that
 * already exists is skipped — so a Stripe retry after a partial failure
 * fills in the missing rows instead of leaving the partner short forever.
 */
async function maybeConfirmReferral(orgId: string, invoice: Stripe.Invoice) {
  const referral = await prisma.referral.findUnique({
    where: { referredOrgId: orgId },
    include: {
      partner: { select: { programType: true } },
      commissions: { select: { monthIndex: true } },
    },
  });
  if (!referral || referral.status !== "pending") return;

  // Only partner_affiliate earns cash commissions; a customer_referral
  // (free-month model) is confirmed but accrues no cash.
  const earnsCash = referral.partner?.programType === "partner_affiliate";

  // Get monthly price baseline for commission calculation
  const sub = await prisma.subscription.findUnique({
    where: { orgId },
    select: { billingInterval: true },
  });
  // For yearly subscriptions, normalise to per-month equivalent for commission
  const linePriceCents = invoice.amount_paid || 0;
  const monthlyEquivCents =
    sub?.billingInterval === "yearly" ? linePriceCents / 12 : linePriceCents;
  const monthlyPriceTHB = monthlyEquivCents / 100;

  // Schedule commissions for months 2 / 3 / 4 (month 1 = 0 hold per design),
  // skipping any monthIndex a previous (partially failed) attempt already wrote.
  const already = new Set(referral.commissions.map((c) => c.monthIndex));
  const now = new Date();
  const rows = earnsCash
    ? AFFILIATE_COMMISSION_SCHEDULE.filter(
        (e) => e.percent > 0 && !already.has(e.monthIndex),
      ).map((entry) => {
        const scheduledFor = new Date(now);
        scheduledFor.setMonth(scheduledFor.getMonth() + (entry.monthIndex - 2));
        return {
          partnerId: referral.partnerId,
          referralId: referral.id,
          monthIndex: entry.monthIndex,
          amountTHB: computeCommission(monthlyPriceTHB, entry.monthIndex),
          status: "scheduled",
          scheduledFor,
        };
      })
    : [];

  await prisma.$transaction(async (tx) => {
    if (rows.length > 0) {
      await tx.commission.createMany({ data: rows });
    }
    // Flip status LAST, and only if still pending (guards concurrent retries).
    await tx.referral.updateMany({
      where: { id: referral.id, status: "pending" },
      data: {
        status: "confirmed",
        confirmedAt: now,
        firstPaymentAt: now,
      },
    });
  });
}

/** Invalidate a referral + claw back its UNPAID commissions (paid stay paid). */
async function clawbackReferral(orgId: string) {
  const referral = await prisma.referral.findUnique({
    where: { referredOrgId: orgId },
  });
  if (!referral) return;
  if (referral.status !== "refunded" && referral.status !== "invalid") {
    await prisma.referral.update({
      where: { id: referral.id },
      data: { status: "refunded" },
    });
  }
  // Only scheduled/held are clawed back — already-paid commissions stay paid
  // (the money was already transferred).
  await prisma.commission.updateMany({
    where: { referralId: referral.id, status: { in: ["scheduled", "held"] } },
    data: { status: "clawed_back" },
  });
}

/** Charge refunded → treat like a cancel for affiliate commissions. */
async function handleChargeRefunded(charge: Stripe.Charge) {
  const customerId =
    typeof charge.customer === "string" ? charge.customer : null;
  if (!customerId) return;
  const sub = await prisma.subscription.findFirst({
    where: { stripeCustomerId: customerId },
  });
  if (!sub) return;
  await clawbackReferral(sub.orgId);
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const customerId = typeof invoice.customer === "string" ? invoice.customer : null;
  if (!customerId) return;
  const sub = await prisma.subscription.findFirst({
    where: { stripeCustomerId: customerId },
  });
  if (!sub) return;
  await safeAuditLog({
    data: {
      orgId: sub.orgId,
      userId: (await systemActorFor(sub.orgId)) || "",
      action: "update",
      entityType: "invoice",
      entityRef: invoice.id || "",
      summary: `Payment failed (invoice ${invoice.id})`,
    },
  });
}
