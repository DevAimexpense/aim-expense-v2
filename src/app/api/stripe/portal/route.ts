// ===========================================
// POST /api/stripe/portal
// Returns a Stripe Customer Portal URL for the active org.
// User can manage card / cancel / change plan / view invoices via Stripe-hosted UI.
// ===========================================

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.activeOrgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sub = await prisma.subscription.findUnique({
    where: { orgId: session.activeOrgId },
    select: { stripeCustomerId: true },
  });

  if (!sub?.stripeCustomerId) {
    return NextResponse.json(
      { error: "ยังไม่ได้สมัคร Stripe — กรุณาเลือกแผนก่อน" },
      { status: 400 },
    );
  }

  const origin =
    process.env.NEXT_PUBLIC_APP_URL ||
    req.headers.get("origin") ||
    "http://localhost:3000";

  try {
    const portal = await stripe.billingPortal.sessions.create({
      customer: sub.stripeCustomerId,
      return_url: `${origin}/account/billing`,
    });
    return NextResponse.json({ url: portal.url });
  } catch (err) {
    console.error("[stripe-portal]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Stripe portal error" },
      { status: 500 },
    );
  }
}
