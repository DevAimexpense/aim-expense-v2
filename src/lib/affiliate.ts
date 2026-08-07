// ===========================================
// Aim Expense — Affiliate helpers
// Pure utilities for the affiliate/referral program:
// code generation + validation, admin allowlist, referral link,
// and commission grouping/summing for dashboards.
// ===========================================

import type { Commission } from "@prisma/client";

/**
 * Referral code format — MUST match the capture regex in `src/middleware.ts`
 * (the `?ref=` handler) so a generated/entered code round-trips correctly.
 */
export const AFFILIATE_CODE_REGEX = /^[A-Za-z0-9-]{4,16}$/;

// Charset for auto-generated codes — omits ambiguous chars (0/O, 1/I/L) so
// codes are easy to read/share by voice.
const CODE_CHARSET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Generate a random referral code (default 8 chars, always regex-valid). */
export function generateAffiliateCode(length = 8): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CODE_CHARSET[Math.floor(Math.random() * CODE_CHARSET.length)];
  }
  return out;
}

/**
 * Affiliate-admin allowlist. There is no global-admin role in the schema, so
 * admin access to the payout dashboard is gated by an env allowlist compared
 * against the (unique) User.email. Set `AFFILIATE_ADMIN_EMAILS` = comma list.
 */
export function isAffiliateAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const allow = (process.env.AFFILIATE_ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allow.includes(email.toLowerCase());
}

/** Build the shareable referral link for a code. */
export function buildReferralLink(code: string): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "https://aimexpense.com";
  return `${base}/?ref=${encodeURIComponent(code)}`;
}

// ===== Commission grouping / summing (dashboards) =====

export type CommissionGroups = {
  scheduled: Commission[];
  paid: Commission[];
  held: Commission[];
  clawedBack: Commission[];
};

/** Split commissions by status for dashboard display. */
export function groupCommissions(commissions: Commission[]): CommissionGroups {
  return {
    scheduled: commissions.filter((c) => c.status === "scheduled"),
    paid: commissions.filter((c) => c.status === "paid"),
    held: commissions.filter((c) => c.status === "held"),
    clawedBack: commissions.filter((c) => c.status === "clawed_back"),
  };
}

/** Sum commission amounts (THB). `amountTHB` is a Prisma Decimal → Number(). */
export function sumCommissionTHB(commissions: Commission[]): number {
  return commissions.reduce((sum, c) => sum + Number(c.amountTHB), 0);
}
