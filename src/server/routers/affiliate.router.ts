// ===========================================
// Affiliate Router — partner-facing (self-signup + dashboard)
// Partner identity key = AffiliatePartner.userId (one partner per user),
// so these are protectedProcedure (per-user), NOT org-scoped.
// Reward model = partner_affiliate (cash commission). See src/lib/plans.ts.
// ===========================================

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";
import {
  AFFILIATE_CODE_REGEX,
  generateAffiliateCode,
  buildReferralLink,
  groupCommissions,
  sumCommissionTHB,
} from "@/lib/affiliate";
import { AFFILIATE_MIN_PAYOUT_THB } from "@/lib/plans";

export const affiliateRouter = router({
  /** Current user's partner row (null → UI shows signup form). */
  me: protectedProcedure.query(async ({ ctx }) => {
    const partner = await prisma.affiliatePartner.findUnique({
      where: { userId: ctx.session.userId },
    });
    return { partner };
  }),

  /** Server-generated unique code candidate for the "สุ่มโค้ด" button. */
  generateCode: protectedProcedure.mutation(async () => {
    for (let i = 0; i < 5; i++) {
      const code = generateAffiliateCode();
      const exists = await prisma.affiliatePartner.findUnique({ where: { code } });
      if (!exists) return { code };
    }
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "สร้างโค้ดไม่สำเร็จ กรุณาลองใหม่",
    });
  }),

  /** Self-signup as an affiliate partner (partner_affiliate / PromptPay cash). */
  signup: protectedProcedure
    .input(
      z.object({
        code: z
          .string()
          .regex(AFFILIATE_CODE_REGEX, "โค้ดต้องเป็น A-Z, 0-9, - ยาว 4-16 ตัว"),
        payoutAccount: z
          .string()
          .min(4, "กรุณากรอกเบอร์ PromptPay")
          .max(64),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.userId;

      const existing = await prisma.affiliatePartner.findUnique({
        where: { userId },
      });
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "คุณเป็นพันธมิตรอยู่แล้ว",
        });
      }

      const codeTaken = await prisma.affiliatePartner.findUnique({
        where: { code: input.code },
      });
      if (codeTaken) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "โค้ดนี้ถูกใช้แล้ว กรุณาเลือกโค้ดอื่น",
        });
      }

      try {
        const partner = await prisma.affiliatePartner.create({
          data: {
            userId,
            code: input.code,
            programType: "partner_affiliate",
            payoutMethod: "promptpay",
            payoutAccount: input.payoutAccount,
            isActive: true,
          },
        });
        return { partner };
      } catch {
        // Unique-constraint race on userId/code
        throw new TRPCError({
          code: "CONFLICT",
          message: "ข้อมูลซ้ำ กรุณาลองใหม่",
        });
      }
    }),

  /** Partner dashboard data: link, referrals, commissions (grouped), totals. */
  dashboard: protectedProcedure.query(async ({ ctx }) => {
    const partner = await prisma.affiliatePartner.findUnique({
      where: { userId: ctx.session.userId },
    });
    if (!partner) return null;

    const [referrals, commissions] = await Promise.all([
      prisma.referral.findMany({
        where: { partnerId: partner.id },
        orderBy: { signedUpAt: "desc" },
      }),
      prisma.commission.findMany({
        where: { partnerId: partner.id },
        orderBy: { scheduledFor: "asc" },
      }),
    ]);

    const groups = groupCommissions(commissions);

    return {
      partner,
      referralLink: buildReferralLink(partner.code),
      // Privacy: expose only status/timestamps, not the referred org's identity.
      referrals: referrals.map((r) => ({
        id: r.id,
        code: r.code,
        status: r.status,
        signedUpAt: r.signedUpAt,
        confirmedAt: r.confirmedAt,
      })),
      // Prisma Decimal doesn't survive superjson → coerce amountTHB to number.
      commissions: {
        scheduled: groups.scheduled.map((c) => ({ ...c, amountTHB: Number(c.amountTHB) })),
        paid: groups.paid.map((c) => ({ ...c, amountTHB: Number(c.amountTHB) })),
        held: groups.held.map((c) => ({ ...c, amountTHB: Number(c.amountTHB) })),
        clawedBack: groups.clawedBack.map((c) => ({ ...c, amountTHB: Number(c.amountTHB) })),
      },
      totals: {
        pendingTHB:
          sumCommissionTHB(groups.scheduled) + sumCommissionTHB(groups.held),
        paidTHB: sumCommissionTHB(groups.paid),
        lifetimeTHB: Number(partner.totalCommission),
        referralCount: referrals.length,
        confirmedCount: referrals.filter((r) => r.status === "confirmed").length,
      },
      minPayoutTHB: AFFILIATE_MIN_PAYOUT_THB,
    };
  }),

  /** Update PromptPay payout account (code is locked to protect live links). */
  updatePayout: protectedProcedure
    .input(z.object({ payoutAccount: z.string().min(4).max(64) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.userId;
      const partner = await prisma.affiliatePartner.findUnique({
        where: { userId },
      });
      if (!partner) {
        throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบพันธมิตร" });
      }
      await prisma.affiliatePartner.update({
        where: { userId },
        data: { payoutAccount: input.payoutAccount },
      });
      return { ok: true };
    }),
});
