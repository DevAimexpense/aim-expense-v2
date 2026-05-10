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
//   1. Auth + active org check
//   2. Resolve price via lookup_key
//   3. Find/create Stripe Customer for the org (idempotent)
//   4. Apply ref-coupon if valid affiliate code
//   5. Create checkout.session with success/cancel URLs back to /account/billing
// ===========================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { stripe, getPriceByTierInterval, REFERRAL_COUPON_ID } from "@/lib/stripe";
import { PLAN_TIERS, type PlanTier } from "@/lib/plans";

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

  // Owner email for receipts
  const owner = await prisma.user.findUnique({
    where: { id: org.ownerId },
    select: { email: true, lineEmail: true, lineDisplayName: true },
  });
  const customerEmail =
    owner?.email || owner?.lineEmail || `${org.id}@aimexpense.com`;

  // Get/create Stripe Customer
  let stripeCustomerId = sub?.stripeCustomerId || undefined;
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

  // Resolve price via lookup_key
  let priceId: string;
  try {
    const price = await getPriceByTierInterval(tier, interval);
    priceId = price.id;
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Price lookup failed",
      },
      { status: 500 },
    );
  }

  // Check if ref code is valid (block self-referral here too as defence-in-depth)
  let discounts: { coupon: string }[] | undefined;
  let validRefPartnerId: string | null = null;
  if (refCode) {
    const partner = await prisma.affiliatePartner.findUnique({
      where: { code: refCode },
    });
    if (partner && partner.isActive && partner.userId !== session.userId) {
      discounts = [{ coupon: REFERRAL_COUPON_ID }];
      validRefPartnerId = partner.id;
    }
  }

  // Use NEXT_PUBLIC_APP_URL or fall back to request origin
  const origin =
    process.env.NEXT_PUBLIC_APP_URL ||
    req.headers.get("origin") ||
    "http://localhost:3000";

  try {
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card", "promptpay"],
      customer: stripeCustomerId,
      line_items: [{ price: priceId, quantity: 1 }],
      // Apply coupon as session-level `discounts` (only if valid + present)
      ...(discounts ? { discounts } : { allow_promotion_codes: true }),
      subscription_data: {
        metadata: {
          orgId,
          ownerUserId: org.ownerId,
          tier,
          interval,
          ...(validRefPartnerId ? { refPartnerId: validRefPartnerId } : {}),
          ...(refCode ? { refCode } : {}),
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
