// ===========================================
// Aim Expense — Bank Router (Master Bank List)
// รายชื่อธนาคาร (สำหรับใช้เป็น dropdown ตอนกรอก Payee)
// ===========================================

import { z } from "zod";
import { router, orgProcedure, permissionProcedure } from "../trpc";
import { getSheetsService } from "../lib/sheets-context";
import { GoogleSheetsService, SHEET_TABS } from "../services/google-sheets.service";
import { prisma } from "@/lib/prisma";

export const bankRouter = router({
  /**
   * รายชื่อธนาคารทั้งหมด (default + user added)
   */
  list: orgProcedure.query(async ({ ctx }) => {
    const sheets = await getSheetsService(ctx.org.orgId);
    const banks = await sheets.getBanks();
    return banks.map((b) => ({
      bankId: b.BankID,
      bankName: b.BankName,
      // isCustom: รู้จาก BankID prefix (BANK = built-in, CUSTOM = user-added)
      isCustom: !b.BankID.startsWith("BANK0"),
    }));
  }),

  /**
   * เพิ่มธนาคารใหม่ (custom)
   */
  create: permissionProcedure("manageBanks")
    .input(z.object({
      bankName: z.string().trim().min(1, "กรุณากรอกชื่อธนาคาร").max(100),
    }))
    .mutation(async ({ ctx, input }) => {
      const sheets = await getSheetsService(ctx.org.orgId);
      const existing = await sheets.getBanks();

      // Check duplicate name
      const dup = existing.find(
        (b) => b.BankName.trim().toLowerCase() === input.bankName.toLowerCase()
      );
      if (dup) {
        throw new Error("มีธนาคารนี้อยู่แล้ว");
      }

      const bankId = GoogleSheetsService.generateId("CUSTOM");
      await sheets.appendRow(SHEET_TABS.BANKS, [
        bankId,
        input.bankName,
        "", "", "", "FALSE",
      ]);

      await prisma.auditLog.create({
        data: {
          orgId: ctx.org.orgId,
          userId: ctx.session.userId,
          action: "create",
          entityType: "bank",
          entityRef: bankId,
          summary: `เพิ่มธนาคาร "${input.bankName}"`,
        },
      });

      return { success: true, bankId };
    }),

  /**
   * ลบธนาคาร — ลบได้เฉพาะ custom (user-added)
   */
  delete: permissionProcedure("manageBanks")
    .input(z.object({ bankId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (input.bankId.startsWith("BANK0")) {
        throw new Error("ไม่สามารถลบธนาคารพื้นฐานได้");
      }

      const sheets = await getSheetsService(ctx.org.orgId);

      // Find bank's name first
      const bank = await sheets.getById(SHEET_TABS.BANKS, "BankID", input.bankId);
      if (!bank) throw new Error("ไม่พบธนาคาร");

      // Check if used by Payees
      const payees = await sheets.getPayees();
      const used = payees.filter((p) => p.BankName === bank.BankName);
      if (used.length > 0) {
        throw new Error(`ลบไม่ได้ — มี Payee ${used.length} รายใช้ธนาคารนี้`);
      }

      const ok = await sheets.deleteById(SHEET_TABS.BANKS, "BankID", input.bankId);
      if (!ok) throw new Error("ไม่พบธนาคาร");

      await prisma.auditLog.create({
        data: {
          orgId: ctx.org.orgId,
          userId: ctx.session.userId,
          action: "delete",
          entityType: "bank",
          entityRef: input.bankId,
          summary: `ลบธนาคาร`,
        },
      });

      return { success: true };
    }),
});
