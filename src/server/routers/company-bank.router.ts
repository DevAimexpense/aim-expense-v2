// ===========================================
// Aim Expense — Company Bank Router
// บัญชีธนาคารของบริษัท (ใช้ในใบเสนอราคา / ใบวางบิล / Account expense source)
// ===========================================

import { z } from "zod";
import { router, orgProcedure } from "../trpc";
import { getSheetsService } from "../lib/sheets-context";
import { GoogleSheetsService, SHEET_TABS } from "../services/google-sheets.service";
import { prisma } from "@/lib/prisma";
import { TRPCError } from "@trpc/server";

const CompanyBankInputSchema = z.object({
  bankName: z.string().trim().min(1, "เลือกธนาคาร").max(100),
  accountNumber: z.string().trim().min(1, "กรอกเลขบัญชี").max(50),
  accountName: z.string().trim().min(1, "กรอกชื่อบัญชี").max(200),
  branch: z.string().trim().max(100).optional(),
  isDefault: z.boolean().default(false),
  useForQuotation: z.boolean().default(true),
  useForBilling: z.boolean().default(true),
  useForPayment: z.boolean().default(true),
});

function requireAdmin(role: string) {
  if (role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "เฉพาะ Admin เท่านั้นที่จัดการบัญชีบริษัทได้",
    });
  }
}

export const companyBankRouter = router({
  /**
   * รายการบัญชีบริษัททั้งหมด
   */
  list: orgProcedure.query(async ({ ctx }) => {
    const sheets = await getSheetsService(ctx.org.orgId);
    // Auto-migration: ensure CompanyBanks tab exists
    await sheets.ensureAllTabsExist();

    const banks = await sheets.getAll(SHEET_TABS.COMPANY_BANKS);
    return banks.map((b) => ({
      companyBankId: b.CompanyBankID,
      bankName: b.BankName,
      accountNumber: b.AccountNumber,
      accountName: b.AccountName,
      branch: b.Branch || "",
      isDefault: b.IsDefault === "TRUE" || b.IsDefault === "true",
      useForQuotation: b.UseForQuotation !== "FALSE" && b.UseForQuotation !== "false",
      useForBilling: b.UseForBilling !== "FALSE" && b.UseForBilling !== "false",
      useForPayment: b.UseForPayment !== "FALSE" && b.UseForPayment !== "false",
    }));
  }),

  /**
   * รายการบัญชีที่เปิดใช้ "useForPayment" — ใช้สำหรับ Account expense Source
   */
  listForPayment: orgProcedure.query(async ({ ctx }) => {
    const sheets = await getSheetsService(ctx.org.orgId);
    await sheets.ensureAllTabsExist();
    const banks = await sheets.getAll(SHEET_TABS.COMPANY_BANKS);
    return banks
      .filter((b) => b.UseForPayment !== "FALSE" && b.UseForPayment !== "false")
      .map((b) => ({
        companyBankId: b.CompanyBankID,
        bankName: b.BankName,
        accountNumber: b.AccountNumber,
        accountName: b.AccountName,
        isDefault: b.IsDefault === "TRUE" || b.IsDefault === "true",
      }));
  }),

  /**
   * เพิ่มบัญชีธนาคารบริษัท
   */
  create: orgProcedure
    .input(CompanyBankInputSchema)
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx.org.role);
      const sheets = await getSheetsService(ctx.org.orgId);
      await sheets.ensureAllTabsExist();

      // ถ้าตั้งเป็น default → unset อื่นทั้งหมด
      if (input.isDefault) {
        const existing = await sheets.getAll(SHEET_TABS.COMPANY_BANKS);
        for (const b of existing) {
          if (b.IsDefault === "TRUE") {
            await sheets.updateById(
              SHEET_TABS.COMPANY_BANKS,
              "CompanyBankID",
              b.CompanyBankID,
              { IsDefault: "FALSE" }
            );
          }
        }
      }

      const id = GoogleSheetsService.generateId("CB");
      const now = new Date().toISOString();

      await sheets.appendRow(SHEET_TABS.COMPANY_BANKS, [
        id,
        input.bankName,
        input.accountNumber,
        input.accountName,
        input.branch || "",
        input.isDefault ? "TRUE" : "FALSE",
        input.useForQuotation ? "TRUE" : "FALSE",
        input.useForBilling ? "TRUE" : "FALSE",
        input.useForPayment ? "TRUE" : "FALSE",
        now,
      ]);

      await prisma.auditLog.create({
        data: {
          orgId: ctx.org.orgId,
          userId: ctx.session.userId,
          action: "create",
          entityType: "company_bank",
          entityRef: id,
          summary: `เพิ่มบัญชีบริษัท ${input.bankName} ${input.accountNumber}`,
        },
      });

      return { success: true, companyBankId: id };
    }),

  /**
   * แก้ไขบัญชีบริษัท
   */
  update: orgProcedure
    .input(z.object({ companyBankId: z.string() }).merge(CompanyBankInputSchema.partial()))
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx.org.role);
      const sheets = await getSheetsService(ctx.org.orgId);

      if (input.isDefault === true) {
        const existing = await sheets.getAll(SHEET_TABS.COMPANY_BANKS);
        for (const b of existing) {
          if (b.CompanyBankID !== input.companyBankId && b.IsDefault === "TRUE") {
            await sheets.updateById(
              SHEET_TABS.COMPANY_BANKS,
              "CompanyBankID",
              b.CompanyBankID,
              { IsDefault: "FALSE" }
            );
          }
        }
      }

      const updates: Record<string, string | number> = {};
      if (input.bankName !== undefined) updates.BankName = input.bankName;
      if (input.accountNumber !== undefined) updates.AccountNumber = input.accountNumber;
      if (input.accountName !== undefined) updates.AccountName = input.accountName;
      if (input.branch !== undefined) updates.Branch = input.branch;
      if (input.isDefault !== undefined) updates.IsDefault = input.isDefault ? "TRUE" : "FALSE";
      if (input.useForQuotation !== undefined) updates.UseForQuotation = input.useForQuotation ? "TRUE" : "FALSE";
      if (input.useForBilling !== undefined) updates.UseForBilling = input.useForBilling ? "TRUE" : "FALSE";
      if (input.useForPayment !== undefined) updates.UseForPayment = input.useForPayment ? "TRUE" : "FALSE";

      const ok = await sheets.updateById(
        SHEET_TABS.COMPANY_BANKS,
        "CompanyBankID",
        input.companyBankId,
        updates
      );
      if (!ok) throw new Error("ไม่พบบัญชี");

      await prisma.auditLog.create({
        data: {
          orgId: ctx.org.orgId,
          userId: ctx.session.userId,
          action: "update",
          entityType: "company_bank",
          entityRef: input.companyBankId,
          summary: `แก้ไขบัญชีบริษัท`,
        },
      });

      return { success: true };
    }),

  /**
   * ลบบัญชีบริษัท
   */
  delete: orgProcedure
    .input(z.object({ companyBankId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx.org.role);
      const sheets = await getSheetsService(ctx.org.orgId);

      // Check if used in payments
      const payments = await sheets.getPayments();
      const used = payments.filter((p) => p.CompanyBankID === input.companyBankId);
      if (used.length > 0) {
        throw new Error(`ลบไม่ได้ — มีรายจ่าย ${used.length} รายการใช้บัญชีนี้`);
      }

      const ok = await sheets.deleteById(
        SHEET_TABS.COMPANY_BANKS,
        "CompanyBankID",
        input.companyBankId
      );
      if (!ok) throw new Error("ไม่พบบัญชี");

      await prisma.auditLog.create({
        data: {
          orgId: ctx.org.orgId,
          userId: ctx.session.userId,
          action: "delete",
          entityType: "company_bank",
          entityRef: input.companyBankId,
          summary: `ลบบัญชีบริษัท`,
        },
      });

      return { success: true };
    }),
});
