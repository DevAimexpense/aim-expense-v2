// ===========================================
// Aim Expense — Payee Router
// CRUD ผู้รับเงิน (vendor/supplier/freelance)
// ===========================================

import { z } from "zod";
import { router, orgProcedure, permissionProcedure } from "../trpc";
import { getSheetsService } from "../lib/sheets-context";
import { GoogleSheetsService, SHEET_TABS } from "../services/google-sheets.service";
import { prisma } from "@/lib/prisma";

const PayeeInputSchema = z.object({
  payeeName: z.string().min(1, "กรุณากรอกชื่อผู้รับเงิน").max(200),
  taxId: z.string().max(13).optional(),
  // สำนักงานใหญ่/สาขา — สำคัญสำหรับใบกำกับภาษี
  branchType: z.enum(["HQ", "Branch"]).default("HQ"),
  branchNumber: z.string().max(10).optional(), // 5 หลักมาตรฐานไทย
  bankAccount: z.string().max(50).optional(),
  bankName: z.string().max(100).optional(),
  isVAT: z.boolean().default(false),
  defaultWTH: z.number().min(0).max(100).default(0),
  phone: z.string().max(20).optional(),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().max(500).optional(),
});

export const payeeRouter = router({
  list: orgProcedure.query(async ({ ctx }) => {
    const sheets = await getSheetsService(ctx.org.orgId);
    const payees = await sheets.getPayees();
    return payees.map((p) => ({
      payeeId: p.PayeeID,
      payeeName: p.PayeeName,
      taxId: p.TaxID || "",
      branchType: (p.BranchType === "Branch" ? "Branch" : "HQ") as "HQ" | "Branch",
      branchNumber: p.BranchNumber || "",
      bankAccount: p.BankAccount || "",
      bankName: p.BankName || "",
      isVAT: p.IsVAT === "TRUE" || p.IsVAT === "true",
      defaultWTH: parseFloat(p.DefaultWTH) || 0,
      phone: p.Phone || "",
      email: p.Email || "",
      address: p.Address || "",
    }));
  }),

  getById: orgProcedure
    .input(z.object({ payeeId: z.string() }))
    .query(async ({ ctx, input }) => {
      const sheets = await getSheetsService(ctx.org.orgId);
      const p = await sheets.getPayeeById(input.payeeId);
      if (!p) return null;
      return {
        payeeId: p.PayeeID,
        payeeName: p.PayeeName,
        taxId: p.TaxID || "",
        bankAccount: p.BankAccount || "",
        bankName: p.BankName || "",
        isVAT: p.IsVAT === "TRUE" || p.IsVAT === "true",
        defaultWTH: parseFloat(p.DefaultWTH) || 0,
        phone: p.Phone || "",
        email: p.Email || "",
        address: p.Address || "",
      };
    }),

  create: permissionProcedure("managePayees")
    .input(PayeeInputSchema)
    .mutation(async ({ ctx, input }) => {
      const sheets = await getSheetsService(ctx.org.orgId);
      const payeeId = GoogleSheetsService.generateId("PAY");

      // ใช้ appendRowByHeaders ป้องกัน column misalignment
      await sheets.appendRowByHeaders(SHEET_TABS.PAYEES, {
        PayeeID: payeeId,
        PayeeName: input.payeeName,
        TaxID: input.taxId || "",
        BranchType: input.branchType,
        BranchNumber: input.branchNumber || "",
        BankAccount: input.bankAccount || "",
        BankName: input.bankName || "",
        IsVAT: input.isVAT ? "TRUE" : "FALSE",
        DefaultWTH: input.defaultWTH,
        Phone: input.phone || "",
        Email: input.email || "",
        Address: input.address || "",
      });

      await prisma.auditLog.create({
        data: {
          orgId: ctx.org.orgId,
          userId: ctx.session.userId,
          action: "create",
          entityType: "payee",
          entityRef: payeeId,
          summary: `เพิ่มผู้รับเงิน "${input.payeeName}"`,
        },
      });

      return { success: true, payeeId };
    }),

  update: permissionProcedure("managePayees")
    .input(z.object({ payeeId: z.string() }).merge(PayeeInputSchema.partial()))
    .mutation(async ({ ctx, input }) => {
      const sheets = await getSheetsService(ctx.org.orgId);
      const updates: Record<string, string | number> = {};
      if (input.payeeName !== undefined) updates.PayeeName = input.payeeName;
      if (input.taxId !== undefined) updates.TaxID = input.taxId;
      if (input.branchType !== undefined) updates.BranchType = input.branchType;
      if (input.branchNumber !== undefined) updates.BranchNumber = input.branchNumber;
      if (input.bankAccount !== undefined) updates.BankAccount = input.bankAccount;
      if (input.bankName !== undefined) updates.BankName = input.bankName;
      if (input.isVAT !== undefined) updates.IsVAT = input.isVAT ? "TRUE" : "FALSE";
      if (input.defaultWTH !== undefined) updates.DefaultWTH = input.defaultWTH;
      if (input.phone !== undefined) updates.Phone = input.phone;
      if (input.email !== undefined) updates.Email = input.email;
      if (input.address !== undefined) updates.Address = input.address;

      const ok = await sheets.updateById(
        SHEET_TABS.PAYEES,
        "PayeeID",
        input.payeeId,
        updates
      );
      if (!ok) throw new Error("ไม่พบผู้รับเงิน");

      await prisma.auditLog.create({
        data: {
          orgId: ctx.org.orgId,
          userId: ctx.session.userId,
          action: "update",
          entityType: "payee",
          entityRef: input.payeeId,
          summary: `แก้ไขผู้รับเงิน`,
        },
      });

      return { success: true };
    }),

  delete: permissionProcedure("managePayees")
    .input(z.object({ payeeId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const sheets = await getSheetsService(ctx.org.orgId);
      const payments = await sheets.getPayments();
      const used = payments.filter((p) => p.PayeeID === input.payeeId);
      if (used.length > 0) {
        throw new Error(
          `ลบไม่ได้ — ผู้รับเงินนี้มีรายจ่าย ${used.length} รายการในระบบ`
        );
      }

      const ok = await sheets.deleteById(
        SHEET_TABS.PAYEES,
        "PayeeID",
        input.payeeId
      );
      if (!ok) throw new Error("ไม่พบผู้รับเงิน");

      await prisma.auditLog.create({
        data: {
          orgId: ctx.org.orgId,
          userId: ctx.session.userId,
          action: "delete",
          entityType: "payee",
          entityRef: input.payeeId,
          summary: `ลบผู้รับเงิน`,
        },
      });

      return { success: true };
    }),
});
