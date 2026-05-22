// ===========================================
// Stripe SDK singleton + price-ID resolver (S26-B)
//
// We pin a recent API version so behaviour is stable across SDK upgrades.
// Price IDs are resolved by `lookup_key` (`pro_monthly`, `pro_yearly`, ...)
// configured in the Stripe Dashboard — never hard-code price IDs in source.
// ===========================================

import Stripe from "stripe";
import type { PlanTier } from "@/lib/plans";

// Lazy singleton — the Stripe client is created on FIRST USE, not at import.
// This keeps `next build` (which imports every route module to collect page
// data) from failing when STRIPE_SECRET_KEY isn't set (e.g. demo deploys
// before Stripe go-live). The key is only required when checkout/webhook/
// portal are actually called at runtime.
let _stripe: Stripe | null = null;
function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    throw new Error("STRIPE_SECRET_KEY not set");
  }
  _stripe = new Stripe(secret, {
    apiVersion: "2026-03-25.dahlia",
    appInfo: { name: "Aim Expense", version: "1.0.0" },
  });
  return _stripe;
}

// Proxy so existing call sites (`stripe.checkout.sessions.create(...)`) work
// unchanged while deferring instantiation to first property access.
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop, receiver) {
    const client = getStripe();
    const value = Reflect.get(client as object, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export type BillingInterval = "monthly" | "yearly";

/**
 * Map (tier, interval) → lookup_key (Stripe Dashboard naming convention).
 * Used as fallback when no env-based price ID is set.
 */
export function lookupKeyFor(
  tier: PlanTier,
  interval: BillingInterval,
): string {
  return `${tier}_${interval}`;
}

/**
 * Resolve a Stripe price ID from env vars.
 * Naming convention: `STRIPE_PRICE_{TIER}_{INTERVAL}` (uppercase).
 * Returns `null` if not set — caller falls back to `lookup_keys` query.
 */
function envPriceIdFor(
  tier: PlanTier,
  interval: BillingInterval,
): string | null {
  const key = `STRIPE_PRICE_${tier.toUpperCase()}_${interval.toUpperCase()}`;
  const v = process.env[key];
  return v && v.startsWith("price_") ? v : null;
}

/**
 * Fetch the Stripe Price object for a (tier, interval) combo.
 *
 * Resolution order:
 *   1. env var `STRIPE_PRICE_{TIER}_{INTERVAL}` (fast, explicit)
 *   2. Stripe API by `lookup_key` (fallback — requires lookup keys set in Dashboard)
 *
 * Throws if neither resolves. Cached at module level after first hit.
 */
const priceCache = new Map<string, Stripe.Price>();

export async function getPriceByTierInterval(
  tier: PlanTier,
  interval: BillingInterval,
): Promise<Stripe.Price> {
  const cacheKey = `${tier}_${interval}`;
  const cached = priceCache.get(cacheKey);
  if (cached) return cached;

  // 1. Try env-configured price ID first
  const envId = envPriceIdFor(tier, interval);
  if (envId) {
    try {
      const price = await stripe.prices.retrieve(envId);
      priceCache.set(cacheKey, price);
      return price;
    } catch (err) {
      console.warn(
        `[stripe] env price ID ${envId} failed (${tier} ${interval}), falling back to lookup_key:`,
        err instanceof Error ? err.message : err,
      );
      // Fall through to lookup_key path below
    }
  }

  // 2. Fall back to lookup_key on Stripe Dashboard
  const lookupKey = lookupKeyFor(tier, interval);
  const list = await stripe.prices.list({
    lookup_keys: [lookupKey],
    expand: ["data.product"],
    active: true,
    limit: 1,
  });

  const price = list.data[0];
  if (!price) {
    throw new Error(
      `Stripe price not found for ${tier}/${interval}. ` +
        `Set env var STRIPE_PRICE_${tier.toUpperCase()}_${interval.toUpperCase()} ` +
        `or set lookup_key="${lookupKey}" on the price in Stripe Dashboard.`,
    );
  }

  priceCache.set(cacheKey, price);
  return price;
}

/**
 * Coupon ID for the referral discount (20% off first invoice).
 *
 * Stripe auto-generates an ID if not specified at create time, so we read
 * from env to support both: `STRIPE_REFERRAL_COUPON_ID` overrides the
 * default. Created manually in Stripe Dashboard → Products → Coupons.
 */
export const REFERRAL_COUPON_ID =
  process.env.STRIPE_REFERRAL_COUPON_ID || "ref-20pct-month1";
