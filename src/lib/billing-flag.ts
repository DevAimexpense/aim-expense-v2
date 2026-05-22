// ===========================================
// Master switch for live billing (S27 soft-launch).
//
// While OFF (default — demo / trial-only soft launch):
//   - /pricing paid tiers show "เริ่มทดลองฟรี" instead of Stripe checkout
//   - /account/billing shows a "trial / billing coming soon" notice
// Flip ON by setting NEXT_PUBLIC_BILLING_ENABLED=true once Stripe LIVE keys
// are configured (after KYC) — no code change needed.
//
// NEXT_PUBLIC_ prefix → readable in both server and client components.
// ===========================================

export const BILLING_ENABLED =
  process.env.NEXT_PUBLIC_BILLING_ENABLED === "true";
