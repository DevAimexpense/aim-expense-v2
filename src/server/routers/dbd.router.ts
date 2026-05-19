// ===========================================
// Aim Expense — DBD Router (S27)
// Juristic-person lookup against DBD (กรมพัฒนาธุรกิจการค้า).
// Scaffold — see src/server/services/dbd.service.ts.
// ===========================================

import { z } from "zod";
import { router, orgProcedure } from "../trpc";
import { dbdLookup } from "../services/dbd.service";
import { TRPCError } from "@trpc/server";

export const dbdRouter = router({
  /**
   * Look up a company at DBD by tax ID or name.
   * Returns `{ configured: false }` until DBD API access is granted —
   * the customer form handles that state gracefully.
   */
  lookup: orgProcedure
    .input(
      z.object({
        taxId: z.string().trim().max(13).optional(),
        name: z.string().trim().max(200).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      if (!input.taxId && !input.name) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "ระบุเลขผู้เสียภาษีหรือชื่อบริษัทอย่างน้อย 1 อย่าง",
        });
      }
      return dbdLookup(input);
    }),
});
