// ===========================================
// Stripe SDK singleton + price-ID resolver (S26-B)
//
// We pin a recent API version so behaviour is stable across SDK upgrades.
// Price IDs are resolved by `lookup_key` (`pro_monthly`, `pro_yearly`, ...)
// configured in the Stripe Dashboard — never hard-code price IDs in source.
// ===========================================

import Stripe from "stripe";
import type { PlanTier } from "@/lib/plans";

const secret = process.env.STRIPE_SECRET_KEY;
if (!secret && process.env.NODE_ENV === "production") {
  // Fail loud in prod; in dev/test we let it lazy-fail at first call
  throw new Error("STRIPE_SECRET_KEY not set");
}

export const stripe = new Stripe(secret || "sk_test_dummy", {
  apiVersion: "2026-03-25.dahlia",
  appInfo: { name: "Aim Expense", version: "1.0.0" },
});

export type BillingInterval = "monthly" | "yearly";

/**
 * Map (tier, interval) → lookup_key configured in Stripe Dashboard.
 * Naming convention enforced when pi creates products: `{tier}_{interval}`.
 */
export function lookupKeyFor(
  tier: PlanTier,
  interval: BillingInterval,
): string {
  return `${tier}_${interval}`;
}

/**
 * Fetch the Stripe Price object for a (tier, interval) combo.
 * Throws if the lookup key isn't found in Stripe — caller should surface a
 * clean 4xx in that case.
 *
 * Cached at module level for the lifetime of the lambda (price IDs don't
 * change once products are configured).
 */
const priceCache = new Map<string, Stripe.Price>();

export async function getPriceByTierInterval(
  tier: PlanTier,
  interval: BillingInterval,
): Promise<Stripe.Price> {
  const key = lookupKeyFor(tier, interval);
  const cached = priceCache.get(key);
  if (cached) return cached;

  const list = await stripe.prices.list({
    lookup_keys: [key],
    expand: ["data.product"],
    active: true,
    limit: 1,
  });

  const price = list.data[0];
  if (!price) {
    throw new Error(
      `Stripe price with lookup_key "${key}" not found. Did you create the product + lookup key in Stripe Dashboard?`,
    );
  }

  priceCache.set(key, price);
  return price;
}

/**
 * Coupon ID for the referral discount (20% off first invoice).
 * Created manually in Stripe Dashboard → Products → Coupons.
 */
export const REFERRAL_COUPON_ID = "ref-20pct-month1";
