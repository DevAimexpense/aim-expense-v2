// ===========================================
// Affiliate Admin Router — payout management (adminProcedure)
// Gated by AFFILIATE_ADMIN_EMAILS (see src/server/trpc.ts adminProcedure).
// Manual payout: admin views matured commissions, marks paid, transfers
// PromptPay by hand. Commission.paidAt + payoutBatchId + status = audit trail
// (AuditLog is org-scoped and not usable for this global action).
// ===========================================

import { z } from "zod";
import { router, adminProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";

export const affiliateAdminRouter = router({
  /** All partners + their aggregate totals. */
  partners: adminProcedure
    .input(
      z
        .object({
          search: z.string().optional(),
          activeOnly: z.boolean().optional(),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const rows = await prisma.affiliatePartner.findMany({
        where: {
          ...(input?.activeOnly ? { isActive: true } : {}),
          ...(input?.search
            ? { code: { contains: input.search, mode: "insensitive" } }
            : {}),
        },
        orderBy: { createdAt: "desc" },
      });
      // Coerce Decimal totals to number for the client (superjson).
      return rows.map((p) => ({
        ...p,
        totalCommission: Number(p.totalCommission),
      }));
    }),

  /** Commissions ready to pay: status=scheduled AND scheduledFor <= now. */
  maturedCommissions: adminProcedure.query(async () => {
    const commissions = await prisma.commission.findMany({
      where: { status: "scheduled", scheduledFor: { lte: new Date() } },
      include: {
        partner: {
          select: {
            code: true,
            payoutMethod: true,
            payoutAccount: true,
            userId: true,
          },
        },
      },
      orderBy: { scheduledFor: "asc" },
    });
    const totalTHB = commissions.reduce(
      (sum, c) => sum + Number(c.amountTHB),
      0,
    );
    // Coerce Decimal amountTHB to number for the client (superjson).
    return {
      commissions: commissions.map((c) => ({
        ...c,
        amountTHB: Number(c.amountTHB),
      })),
      totalTHB,
    };
  }),

  /**
   * Mark commissions paid (after transferring PromptPay by hand).
   * Idempotent: only transitions rows still scheduled/held, so re-submitting
   * never double-increments AffiliatePartner.totalCommission.
   */
  markPaid: adminProcedure
    .input(
      z.object({
        commissionIds: z.array(z.string()).min(1),
        payoutBatchId: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const batchId = input.payoutBatchId || `batch_${Date.now()}`;

      return prisma.$transaction(async (tx) => {
        // Only rows currently scheduled/held are payable (idempotency guard).
        const targets = await tx.commission.findMany({
          where: {
            id: { in: input.commissionIds },
            status: { in: ["scheduled", "held"] },
          },
        });
        if (targets.length === 0) return { updated: 0, batchId };

        // Sum per partner for the totalCommission increment.
        const byPartner = new Map<string, number>();
        for (const c of targets) {
          byPartner.set(
            c.partnerId,
            (byPartner.get(c.partnerId) ?? 0) + Number(c.amountTHB),
          );
        }

        await tx.commission.updateMany({
          where: { id: { in: targets.map((t) => t.id) } },
          data: { status: "paid", paidAt: new Date(), payoutBatchId: batchId },
        });

        for (const [partnerId, amount] of byPartner) {
          await tx.affiliatePartner.update({
            where: { id: partnerId },
            data: { totalCommission: { increment: amount } },
          });
        }

        return { updated: targets.length, batchId };
      });
    }),
});
