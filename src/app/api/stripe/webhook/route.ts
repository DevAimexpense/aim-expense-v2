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
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import {
  AFFILIATE_COMMISSION_SCHEDULE,
  computeCommission,
  PLAN_LIMITS,
  type PlanTier,
} from "@/lib/plans";

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // Stripe webhook signature verify needs node, not edge

const SIG_HEADER = "stripe-signature";

function tierFromMetadata(meta: Stripe.Metadata | null | undefined): PlanTier {
  const t = (meta?.tier || "").toLowerCase();
  if (t === "basic" || t === "pro" || t === "business" || t === "max") return t;
  return "free";
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
  await prisma.auditLog.create({
    data: {
      orgId,
      userId: s.metadata?.ownerUserId || "system",
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
  const tier = tierFromMetadata(s.metadata);
  const interval = (s.metadata?.interval || "monthly") as "monthly" | "yearly";
  const priceId = s.items.data[0]?.price?.id || null;

  const limits = PLAN_LIMITS[tier];
  const periodEnd = (s as Stripe.Subscription & { current_period_end?: number }).current_period_end;

  await prisma.subscription.update({
    where: { orgId },
    data: {
      plan: tier,
      status: s.status,
      stripeSubscriptionId: s.id,
      stripePriceId: priceId,
      billingInterval: interval,
      currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
      cancelAtPeriodEnd: s.cancel_at_period_end,
      // Trial cleared once they've upgraded to a paid plan
      trialPlan: null,
      trialStartedAt: null,
      trialEndsAt: null,
      // Cache quotas for fast read
      maxMembers: limits.users === -1 ? 9999 : limits.users,
      maxEvents: limits.businesses === -1 ? 9999 : limits.businesses,
      scanCredits: limits.ocrPerMonth === -1 ? 999999 : limits.ocrPerMonth,
    },
  });

  await prisma.auditLog.create({
    data: {
      orgId,
      userId: "system",
      action: "update",
      entityType: "subscription",
      entityRef: s.id,
      summary: `Subscription ${s.status}: ${tier} ${interval}`,
    },
  });
}

async function handleSubscriptionDeleted(s: Stripe.Subscription) {
  const sub = await prisma.subscription.findFirst({
    where: { stripeSubscriptionId: s.id },
  });
  if (!sub) return;
  const freeLimits = PLAN_LIMITS.free;
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
      maxEvents: freeLimits.businesses,
      scanCredits: freeLimits.ocrPerMonth,
    },
  });
  await prisma.auditLog.create({
    data: {
      orgId: sub.orgId,
      userId: "system",
      action: "update",
      entityType: "subscription",
      entityRef: s.id,
      summary: "Subscription cancelled — downgraded to Free",
    },
  });
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
  await prisma.auditLog.create({
    data: {
      orgId,
      userId: "system",
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
    await maybeConfirmReferral(orgId, invoice);
  }
}

async function maybeConfirmReferral(orgId: string, invoice: Stripe.Invoice) {
  const referral = await prisma.referral.findUnique({
    where: { referredOrgId: orgId },
  });
  if (!referral || referral.status !== "pending") return;

  // Mark confirmed + schedule commission rows
  await prisma.referral.update({
    where: { id: referral.id },
    data: {
      status: "confirmed",
      confirmedAt: new Date(),
      firstPaymentAt: new Date(),
    },
  });

  // Get monthly price baseline for commission calculation
  const sub = await prisma.subscription.findUnique({
    where: { orgId },
    select: { stripePriceId: true, billingInterval: true },
  });
  // For yearly subscriptions, normalise to per-month equivalent for commission
  const linePriceCents = invoice.amount_paid || 0;
  const monthlyEquivCents =
    sub?.billingInterval === "yearly" ? linePriceCents / 12 : linePriceCents;
  const monthlyPriceTHB = monthlyEquivCents / 100;

  // Schedule commissions for months 2 / 3 / 4 (month 1 = 0 hold per design)
  const now = new Date();
  for (const entry of AFFILIATE_COMMISSION_SCHEDULE) {
    if (entry.percent === 0) continue;
    const scheduledFor = new Date(now);
    scheduledFor.setMonth(scheduledFor.getMonth() + (entry.monthIndex - 2));
    await prisma.commission.create({
      data: {
        partnerId: referral.partnerId,
        referralId: referral.id,
        monthIndex: entry.monthIndex,
        amountTHB: computeCommission(monthlyPriceTHB, entry.monthIndex),
        status: "scheduled",
        scheduledFor,
      },
    });
  }
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const customerId = typeof invoice.customer === "string" ? invoice.customer : null;
  if (!customerId) return;
  const sub = await prisma.subscription.findFirst({
    where: { stripeCustomerId: customerId },
  });
  if (!sub) return;
  await prisma.auditLog.create({
    data: {
      orgId: sub.orgId,
      userId: "system",
      action: "update",
      entityType: "invoice",
      entityRef: invoice.id || "",
      summary: `Payment failed (invoice ${invoice.id})`,
    },
  });
}
