// ===========================================
// Aim Expense — Payment Router
// CRUD รายการจ่าย + calc + approve + mark paid + clear reconciliation
// ===========================================

import { z } from "zod";
import { router, orgProcedure, permissionProcedure } from "../trpc";
import { getSheetsService } from "../lib/sheets-context";
import { GoogleSheetsService, SHEET_TABS } from "../services/google-sheets.service";
import { prisma } from "@/lib/prisma";
import { calculatePayment } from "@/lib/calculations";
import { TRPCError } from "@trpc/server";

const PaymentInputSchema = z.object({
  eventId: z.string().min(1),
  payeeId: z.string().min(1),
  expenseType: z.enum(["team", "account"]),
  companyBankId: z.string().optional(),
  invoiceNumber: z.string().max(50).optional(),
  description: z.string().min(1, "กรอกรายละเอียด").max(500),
  costPerUnit: z.number().min(0),
  days: z.number().min(1).default(1),
  numberOfPeople: z.number().min(1).default(1),
  pctWTH: z.number().min(0).max(100).default(0),
  isVatPayee: z.boolean().default(false),
  dueDate: z.string().min(1),
  notes: z.string().max(1000).optional(),
  // ===== R5: Tax compliance fields =====
  documentType: z.enum(["receipt", "tax_invoice", "id_card", "substitute_receipt"]).optional(),
  expenseNature: z.enum(["goods", "service"]).optional(),
  categoryMain: z.string().max(100).optional(),
  categorySub: z.string().max(100).optional(),
  requesterName: z.string().max(100).optional(),
  // ===== Approval flow: skip approval for expense recording =====
  // "pending" = ตั้งเบิก (ต้องอนุมัติ), "paid" = บันทึกค่าใช้จ่าย (จ่ายแล้ว ข้ามอนุมัติ)
  initialStatus: z.enum(["pending", "paid"]).default("pending"),
});

function toPaymentRow(payment: Record<string, string>) {
  const ttl = parseFloat(payment.TTLAmount) || 0;
  const wth = parseFloat(payment.WTHAmount) || 0;
  const vat = parseFloat(payment.VATAmount) || 0;
  const gttl = parseFloat(payment.GTTLAmount) || 0;
  return {
    paymentId: payment.PaymentID,
    eventId: payment.EventID,
    payeeId: payment.PayeeID,
    expenseType: (payment.ExpenseType as "team" | "account") || "account",
    companyBankId: payment.CompanyBankID || "",
    invoiceNumber: payment.InvoiceNumber || "",
    invoiceFileUrl: payment.InvoiceFileURL || "",
    description: payment.Description || "",
    costPerUnit: parseFloat(payment.CostPerUnit) || 0,
    days: parseInt(payment.Days || "1", 10) || 1,
    numberOfPeople: parseInt(payment.NoOfPPL || "1", 10) || 1,
    ttlAmount: ttl,
    pctWTH: parseFloat(payment.PctWTH) || 0,
    wthAmount: wth,
    vatAmount: vat,
    gttlAmount: gttl,
    status: (payment.Status as "pending" | "approved" | "paid" | "rejected" | "cleared") || "pending",
    paymentDate: payment.PaymentDate || "",
    dueDate: payment.DueDate || "",
    approvedBy: payment.ApprovedBy || "",
    approvedAt: payment.ApprovedAt || "",
    paidAt: payment.PaidAt || "",
    batchId: payment.BatchID || "",
    isCleared: payment.IsCleared === "TRUE",
    clearedAt: payment.ClearedAt || "",
    receiptUrl: payment.ReceiptURL || "",
    receiptNumber: payment.ReceiptNumber || "",
    receiptDate: payment.ReceiptDate || "",
    // R5: tax fields
    documentType: (payment.DocumentType as "receipt" | "tax_invoice" | "") || "",
    expenseNature: (payment.ExpenseNature as "goods" | "service" | "") || "",
    categoryMain: payment.CategoryMain || "",
    categorySub: payment.CategorySub || "",
    requesterName: payment.RequesterName || "",
    vendorTaxIdSnapshot: payment.VendorTaxIdSnapshot || "",
    vendorBranchInfo: payment.VendorBranchInfo || "",
    actualExpense: parseFloat(payment.ActualExpense) || 0,
    generatedDocUrl: payment.GeneratedDocUrl || "",
    generatedDocType: payment.GeneratedDocType || "",
    notes: payment.Notes || "",
    createdAt: payment.CreatedAt || "",
    createdBy: payment.CreatedBy || "",
    createdByUserId: payment.CreatedByUserId || "", // R6: ownership check
    updatedAt: payment.UpdatedAt || "",
  };
}

export const paymentRouter = router({
  list: orgProcedure
    .input(
      z.object({
        eventId: z.string().optional(),
        payeeId: z.string().optional(),
        status: z.string().optional(),
        expenseType: z.enum(["team", "account"]).optional(),
        companyBankId: z.string().optional(),
        dueDate: z.string().optional(),
        dueDateFrom: z.string().optional(),
        dueDateTo: z.string().optional(),
        paymentDate: z.string().optional(),
        paymentDateFrom: z.string().optional(),
        paymentDateTo: z.string().optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const sheets = await getSheetsService(ctx.org.orgId);
      await sheets.ensureAllTabsExist();

      let payments = await sheets.getPayments();

      if (input?.eventId) payments = payments.filter((p) => p.EventID === input.eventId);
      if (input?.payeeId) payments = payments.filter((p) => p.PayeeID === input.payeeId);
      if (input?.status) payments = payments.filter((p) => p.Status === input.status);
      if (input?.expenseType)
        payments = payments.filter((p) => (p.ExpenseType || "account") === input.expenseType);
      if (input?.companyBankId)
        payments = payments.filter((p) => p.CompanyBankID === input.companyBankId);
      if (input?.dueDate) payments = payments.filter((p) => p.DueDate === input.dueDate);
      if (input?.dueDateFrom)
        payments = payments.filter((p) => p.DueDate >= input.dueDateFrom!);
      if (input?.dueDateTo)
        payments = payments.filter((p) => p.DueDate <= input.dueDateTo!);
      if (input?.paymentDate)
        payments = payments.filter((p) => p.PaymentDate === input.paymentDate);
      if (input?.paymentDateFrom)
        payments = payments.filter((p) => p.PaymentDate >= input.paymentDateFrom!);
      if (input?.paymentDateTo)
        payments = payments.filter((p) => p.PaymentDate <= input.paymentDateTo!);

      return payments.map(toPaymentRow);
    }),

  getById: orgProcedure
    .input(z.object({ paymentId: z.string() }))
    .query(async ({ ctx, input }) => {
      const sheets = await getSheetsService(ctx.org.orgId);
      const p = await sheets.getById(SHEET_TABS.PAYMENTS, "PaymentID", input.paymentId);
      return p ? toPaymentRow(p) : null;
    }),

  preview: orgProcedure
    .input(z.object({
      costPerUnit: z.number().min(0),
      days: z.number().min(1).default(1),
      numberOfPeople: z.number().min(1).default(1),
      pctWTH: z.number().min(0).max(100).default(0),
      isVatPayee: z.boolean().default(false),
    }))
    .query(({ input }) => calculatePayment(input)),

  create: permissionProcedure("updatePayments")
    .input(PaymentInputSchema)
    .mutation(async ({ ctx, input }) => {
      if (input.expenseType === "account" && !input.companyBankId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Account Expense ต้องเลือกบัญชีต้นทาง",
        });
      }

      const sheets = await getSheetsService(ctx.org.orgId);
      await sheets.ensureAllTabsExist();

      const calc = calculatePayment({
        costPerUnit: input.costPerUnit,
        days: input.days,
        numberOfPeople: input.numberOfPeople,
        pctWTH: input.pctWTH,
        isVatPayee: input.isVatPayee,
      });

      // R5: snapshot vendor info from Payee (กันข้อมูลเปลี่ยนภายหลัง)
      let vendorTaxIdSnapshot = "";
      let vendorBranchInfo = "";
      try {
        const payee = await sheets.getById(SHEET_TABS.PAYEES, "PayeeID", input.payeeId);
        if (payee) {
          vendorTaxIdSnapshot = payee.TaxID || "";
          if (payee.BranchType === "Branch" && payee.BranchNumber) {
            vendorBranchInfo = `สาขา ${payee.BranchNumber}`;
          } else if (payee.BranchType === "HQ") {
            vendorBranchInfo = "สำนักงานใหญ่";
          }
        }
      } catch {
        // best-effort — skip if payee lookup fails
      }

      const paymentId = GoogleSheetsService.generateId("PMT");
      const now = new Date().toISOString();
      const status = input.initialStatus || "pending";
      // ถ้า status = "paid" (บันทึกค่าใช้จ่าย) → ถือว่าจ่ายแล้ว ข้ามอนุมัติ
      const isPaidDirect = status === "paid";

      // ใช้ appendRowByHeaders เพื่อ map ตาม column name ใน Sheet จริง
      // (ป้องกัน column misalignment ถ้า Sheet order ไม่ตรงกับ SHEET_HEADERS)
      await sheets.appendRowByHeaders(SHEET_TABS.PAYMENTS, {
        PaymentID: paymentId,
        EventID: input.eventId,
        PayeeID: input.payeeId,
        ExpenseType: input.expenseType,
        CompanyBankID: input.companyBankId || "",
        InvoiceNumber: input.invoiceNumber || "",
        InvoiceFileURL: "",
        Description: input.description,
        CostPerUnit: input.costPerUnit,
        Days: input.days,
        NoOfPPL: input.numberOfPeople,
        TTLAmount: calc.ttlAmount,
        PctWTH: input.pctWTH,
        WTHAmount: calc.wthAmount,
        VATAmount: calc.vatAmount,
        GTTLAmount: calc.gttlAmount,
        Status: status,
        PaymentDate: isPaidDirect ? now.slice(0, 10) : "",
        DueDate: input.dueDate,
        ApprovedBy: isPaidDirect ? ctx.session.displayName : "",
        ApprovedAt: isPaidDirect ? now : "",
        PaidAt: isPaidDirect ? now : "",
        BatchID: "",
        IsCleared: "FALSE",
        ClearedAt: "",
        ReceiptURL: "",
        ReceiptNumber: "",
        ReceiptDate: "",
        // R5: tax compliance fields
        DocumentType: input.documentType || "",
        ExpenseNature: input.expenseNature || "",
        CategoryMain: input.categoryMain || "",
        CategorySub: input.categorySub || "",
        RequesterName: input.requesterName || ctx.session.displayName,
        VendorTaxIdSnapshot: vendorTaxIdSnapshot,
        VendorBranchInfo: vendorBranchInfo,
        Notes: input.notes || "",
        CreatedAt: now,
        CreatedBy: ctx.session.displayName,
        CreatedByUserId: ctx.session.userId, // R6: stable userId for ownership check
        UpdatedAt: now,
      });

      await prisma.auditLog.create({
        data: {
          orgId: ctx.org.orgId,
          userId: ctx.session.userId,
          action: "create",
          entityType: "payment",
          entityRef: paymentId,
          summary: `${isPaidDirect ? "บันทึกค่าใช้จ่าย" : "ตั้งเบิก"} ${calc.gttlAmount.toLocaleString()} บาท (${input.expenseType === "team" ? "เบิกสด" : "โอนบัญชี"})`,
        },
      });

      return { success: true, paymentId, calc };
    }),

  update: permissionProcedure("updatePayments")
    .input(z.object({ paymentId: z.string() }).merge(PaymentInputSchema.partial()))
    .mutation(async ({ ctx, input }) => {
      const sheets = await getSheetsService(ctx.org.orgId);
      const existing = await sheets.getById(SHEET_TABS.PAYMENTS, "PaymentID", input.paymentId);
      if (!existing) throw new Error("ไม่พบรายการจ่าย");

      // R6 Ownership Gate:
      // - admin / manager → แก้ของใครก็ได้
      // - role อื่น (มี updatePayments เช่น accountant) → แก้ได้เฉพาะของตัวเองเท่านั้น
      const role = ctx.org.role;
      const isAdminOrManager = role === "admin" || role === "manager";
      const isOwner =
        !!existing.CreatedByUserId && existing.CreatedByUserId === ctx.session.userId;
      if (!isAdminOrManager && !isOwner) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "คุณไม่มีสิทธิ์แก้ไขรายการที่สร้างโดยผู้อื่น — เฉพาะ Admin/Manager เท่านั้น",
        });
      }

      // Permission gate (post-approval):
      // - "pending" / "rejected" → user ที่มี updatePayments ทุกคนแก้ได้
      // - "approved" / "paid" / "cleared" → ต้องมี editPaymentAfterApproval ด้วย
      const isPostApproval =
        existing.Status !== "pending" && existing.Status !== "rejected";
      if (isPostApproval && !ctx.org.permissions.editPaymentAfterApproval) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "รายการนี้ถูกอนุมัติแล้ว — เฉพาะผู้มีอำนาจ (Admin/Manager) เท่านั้นที่แก้ไขได้",
        });
      }

      const updates: Record<string, string | number> = {};
      const needsRecalc =
        input.costPerUnit !== undefined ||
        input.days !== undefined ||
        input.numberOfPeople !== undefined ||
        input.pctWTH !== undefined ||
        input.isVatPayee !== undefined;

      if (needsRecalc) {
        const calc = calculatePayment({
          costPerUnit: input.costPerUnit ?? parseFloat(existing.CostPerUnit) ?? 0,
          days: input.days ?? parseInt(existing.Days, 10) ?? 1,
          numberOfPeople: input.numberOfPeople ?? parseInt(existing.NoOfPPL, 10) ?? 1,
          pctWTH: input.pctWTH ?? parseFloat(existing.PctWTH) ?? 0,
          isVatPayee: input.isVatPayee ?? (parseFloat(existing.VATAmount) > 0),
        });
        updates.TTLAmount = calc.ttlAmount;
        updates.WTHAmount = calc.wthAmount;
        updates.VATAmount = calc.vatAmount;
        updates.GTTLAmount = calc.gttlAmount;
        if (input.costPerUnit !== undefined) updates.CostPerUnit = input.costPerUnit;
        if (input.days !== undefined) updates.Days = input.days;
        if (input.numberOfPeople !== undefined) updates.NoOfPPL = input.numberOfPeople;
        if (input.pctWTH !== undefined) updates.PctWTH = input.pctWTH;
      }

      if (input.eventId !== undefined) updates.EventID = input.eventId;
      if (input.payeeId !== undefined) updates.PayeeID = input.payeeId;
      if (input.expenseType !== undefined) updates.ExpenseType = input.expenseType;
      if (input.companyBankId !== undefined) updates.CompanyBankID = input.companyBankId;
      if (input.invoiceNumber !== undefined) updates.InvoiceNumber = input.invoiceNumber;
      if (input.description !== undefined) updates.Description = input.description;
      if (input.dueDate !== undefined) updates.DueDate = input.dueDate;
      if (input.notes !== undefined) updates.Notes = input.notes;
      // R5: tax compliance fields
      if (input.documentType !== undefined) updates.DocumentType = input.documentType;
      if (input.expenseNature !== undefined) updates.ExpenseNature = input.expenseNature;
      if (input.categoryMain !== undefined) updates.CategoryMain = input.categoryMain;
      if (input.categorySub !== undefined) updates.CategorySub = input.categorySub;
      if (input.requesterName !== undefined) updates.RequesterName = input.requesterName;
      // If payeeId changed, refresh vendor snapshot
      if (input.payeeId !== undefined && input.payeeId !== existing.PayeeID) {
        try {
          const newPayee = await sheets.getById(SHEET_TABS.PAYEES, "PayeeID", input.payeeId);
          if (newPayee) {
            updates.VendorTaxIdSnapshot = newPayee.TaxID || "";
            updates.VendorBranchInfo =
              newPayee.BranchType === "Branch" && newPayee.BranchNumber
                ? `สาขา ${newPayee.BranchNumber}`
                : newPayee.BranchType === "HQ"
                ? "สำนักงานใหญ่"
                : "";
          }
        } catch {
          /* skip */
        }
      }
      updates.UpdatedAt = new Date().toISOString();

      const ok = await sheets.updateById(SHEET_TABS.PAYMENTS, "PaymentID", input.paymentId, updates);
      if (!ok) throw new Error("แก้ไขไม่สำเร็จ");

      await prisma.auditLog.create({
        data: {
          orgId: ctx.org.orgId,
          userId: ctx.session.userId,
          action: "update",
          entityType: "payment",
          entityRef: input.paymentId,
          summary: `แก้ไขรายการจ่าย`,
        },
      });

      return { success: true };
    }),

  /**
   * Stage 2: บันทึกข้อมูลใบเสร็จ/ใบกำกับภาษี (หลังจากจ่ายเงินแล้ว)
   * - อัปโหลดไฟล์แยก ผ่าน /api/payments/upload (fileType=receipt) → ได้ URL
   * - แล้วเรียก mutation นี้เก็บ metadata (เลขที่ใบเสร็จ + วันที่)
   */
  recordReceipt: permissionProcedure("updatePayments")
    .input(
      z.object({
        paymentId: z.string(),
        receiptUrl: z.string().url().optional().or(z.literal("")),
        receiptNumber: z.string().max(50).optional(),
        receiptDate: z.string().optional(), // ISO YYYY-MM-DD
      })
    )
    .mutation(async ({ ctx, input }) => {
      const sheets = await getSheetsService(ctx.org.orgId);
      const existing = await sheets.getById(SHEET_TABS.PAYMENTS, "PaymentID", input.paymentId);
      if (!existing) throw new Error("ไม่พบรายการ");
      if (existing.Status !== "approved" && existing.Status !== "paid" && existing.Status !== "cleared") {
        throw new Error("บันทึกใบเสร็จได้เฉพาะรายการที่อนุมัติหรือจ่ายแล้ว");
      }

      const updates: Record<string, string | number> = {
        UpdatedAt: new Date().toISOString(),
      };
      if (input.receiptUrl !== undefined) updates.ReceiptURL = input.receiptUrl;
      if (input.receiptNumber !== undefined) updates.ReceiptNumber = input.receiptNumber;
      if (input.receiptDate !== undefined) updates.ReceiptDate = input.receiptDate;

      const ok = await sheets.updateById(SHEET_TABS.PAYMENTS, "PaymentID", input.paymentId, updates);
      if (!ok) throw new Error("บันทึกไม่สำเร็จ");

      await prisma.auditLog.create({
        data: {
          orgId: ctx.org.orgId,
          userId: ctx.session.userId,
          action: "record_receipt",
          entityType: "payment",
          entityRef: input.paymentId,
          summary: `บันทึกใบเสร็จ${input.receiptNumber ? ` ${input.receiptNumber}` : ""}`,
        },
      });

      return { success: true };
    }),

  approve: permissionProcedure("approvePayments")
    .input(
      z.object({
        paymentIds: z.array(z.string()).min(1),
        // วันที่จ่ายเงิน (optional) — ถ้าใส่ → กำหนดใน PaymentDate column ตอนอนุมัติ
        // รายการจะไปปรากฏในหน้า "เตรียมจ่าย" ตามวันที่จ่ายนี้
        paymentDate: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const sheets = await getSheetsService(ctx.org.orgId);
      const now = new Date().toISOString();
      let success = 0;
      for (const id of input.paymentIds) {
        const existing = await sheets.getById(SHEET_TABS.PAYMENTS, "PaymentID", id);
        if (!existing) continue;
        if (existing.Status !== "pending") continue;
        const updates: Record<string, string | number> = {
          Status: "approved",
          ApprovedBy: ctx.session.displayName,
          ApprovedAt: now,
          UpdatedAt: now,
        };
        if (input.paymentDate) {
          updates.PaymentDate = input.paymentDate;
        }
        const ok = await sheets.updateById(SHEET_TABS.PAYMENTS, "PaymentID", id, updates);
        if (ok) success++;
      }

      if (success > 0) {
        await prisma.auditLog.create({
          data: {
            orgId: ctx.org.orgId,
            userId: ctx.session.userId,
            action: "approve",
            entityType: "payment",
            entityRef: input.paymentIds.join(","),
            summary: `อนุมัติ ${success} รายการ${
              input.paymentDate ? ` (วันจ่าย ${input.paymentDate})` : ""
            }`,
          },
        });
      }
      return { success: true, approved: success };
    }),

  reject: permissionProcedure("approvePayments")
    .input(z.object({
      paymentIds: z.array(z.string()).min(1),
      reason: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const sheets = await getSheetsService(ctx.org.orgId);
      const now = new Date().toISOString();
      let success = 0;
      for (const id of input.paymentIds) {
        const existing = await sheets.getById(SHEET_TABS.PAYMENTS, "PaymentID", id);
        if (!existing) continue;
        if (existing.Status !== "pending") continue;
        const ok = await sheets.updateById(SHEET_TABS.PAYMENTS, "PaymentID", id, {
          Status: "rejected",
          Notes: (existing.Notes || "") + (input.reason ? ` | เหตุผล: ${input.reason}` : ""),
          UpdatedAt: now,
        });
        if (ok) success++;
      }

      await prisma.auditLog.create({
        data: {
          orgId: ctx.org.orgId,
          userId: ctx.session.userId,
          action: "reject",
          entityType: "payment",
          entityRef: input.paymentIds.join(","),
          summary: `ปฏิเสธ ${success} รายการ${input.reason ? " — " + input.reason : ""}`,
        },
      });

      return { success: true, rejected: success };
    }),

  markPaid: permissionProcedure("approvePayments")
    .input(z.object({
      paymentIds: z.array(z.string()).min(1),
      batchId: z.string().optional(),
      paymentDate: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const sheets = await getSheetsService(ctx.org.orgId);
      const now = new Date().toISOString();
      const batchId = input.batchId || GoogleSheetsService.generateId("BATCH");
      const paymentDate = input.paymentDate || now.slice(0, 10);
      let success = 0;

      for (const id of input.paymentIds) {
        const existing = await sheets.getById(SHEET_TABS.PAYMENTS, "PaymentID", id);
        if (!existing) continue;
        if (existing.Status !== "approved") continue;
        const ok = await sheets.updateById(SHEET_TABS.PAYMENTS, "PaymentID", id, {
          Status: "paid",
          PaidAt: now,
          PaymentDate: paymentDate,
          BatchID: batchId,
          UpdatedAt: now,
        });
        if (ok) success++;
      }

      await prisma.auditLog.create({
        data: {
          orgId: ctx.org.orgId,
          userId: ctx.session.userId,
          action: "mark_paid",
          entityType: "payment",
          entityRef: batchId,
          summary: `จ่าย ${success} รายการ (batch ${batchId})`,
        },
      });

      return { success: true, paid: success, batchId };
    }),

  clearReconciliation: permissionProcedure("approvePayments")
    .input(z.object({
      paymentId: z.string(),
      receiptUrl: z.string().url().optional().or(z.literal("")),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const sheets = await getSheetsService(ctx.org.orgId);
      const existing = await sheets.getById(SHEET_TABS.PAYMENTS, "PaymentID", input.paymentId);
      if (!existing) throw new Error("ไม่พบรายการ");
      if (existing.ExpenseType !== "team") {
        throw new Error("เคลียร์ได้เฉพาะ Team Expense");
      }

      const now = new Date().toISOString();
      const ok = await sheets.updateById(SHEET_TABS.PAYMENTS, "PaymentID", input.paymentId, {
        IsCleared: "TRUE",
        ClearedAt: now,
        Status: "cleared",
        ReceiptURL: input.receiptUrl || existing.ReceiptURL,
        Notes: input.notes !== undefined ? input.notes : existing.Notes,
        UpdatedAt: now,
      });
      if (!ok) throw new Error("เคลียร์ไม่สำเร็จ");

      await prisma.auditLog.create({
        data: {
          orgId: ctx.org.orgId,
          userId: ctx.session.userId,
          action: "clear",
          entityType: "payment",
          entityRef: input.paymentId,
          summary: `เคลียร์งบรายการ team expense`,
        },
      });

      return { success: true };
    }),

  /**
   * Staff อัปเดตค่าใช้จ่ายจริงหลังจบงาน
   * เทียบกับ gttlAmount ที่ตั้งเบิกไว้ → ส่วนต่างต้องคืน
   */
  updateExpense: permissionProcedure("updatePayments")
    .input(
      z.object({
        paymentId: z.string(),
        actualExpense: z.number().min(0, "ค่าใช้จ่ายจริงต้องไม่ติดลบ"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const sheets = await getSheetsService(ctx.org.orgId);
      const existing = await sheets.getById(SHEET_TABS.PAYMENTS, "PaymentID", input.paymentId);
      if (!existing) throw new Error("ไม่พบรายการ");

      // อนุญาตเฉพาะรายการที่จ่ายแล้ว (paid/cleared)
      if (existing.Status !== "paid" && existing.Status !== "cleared") {
        throw new Error("อัปเดตค่าใช้จ่ายจริงได้เฉพาะรายการที่จ่ายแล้ว");
      }

      // R6 Ownership Gate: staff แก้ได้เฉพาะของตัวเอง, admin/manager แก้ได้ทั้งหมด
      const role = ctx.org.role;
      const isAdminOrManager = role === "admin" || role === "manager";
      const isOwner = !!existing.CreatedByUserId && existing.CreatedByUserId === ctx.session.userId;
      if (!isAdminOrManager && !isOwner) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "คุณไม่มีสิทธิ์แก้ไขรายการที่สร้างโดยผู้อื่น",
        });
      }

      const ok = await sheets.updateById(SHEET_TABS.PAYMENTS, "PaymentID", input.paymentId, {
        ActualExpense: input.actualExpense,
        UpdatedAt: new Date().toISOString(),
      });
      if (!ok) throw new Error("อัปเดตไม่สำเร็จ");

      const gttl = parseFloat(existing.GTTLAmount) || 0;
      const diff = gttl - input.actualExpense;

      await prisma.auditLog.create({
        data: {
          orgId: ctx.org.orgId,
          userId: ctx.session.userId,
          action: "update_expense",
          entityType: "payment",
          entityRef: input.paymentId,
          summary: `อัปเดตค่าใช้จ่ายจริง ฿${input.actualExpense.toLocaleString()} (ตั้งเบิก ฿${gttl.toLocaleString()}, ส่วนต่าง ฿${diff.toLocaleString()})`,
        },
      });

      return { success: true, actualExpense: input.actualExpense, budgeted: gttl, difference: diff };
    }),

  delete: permissionProcedure("deletePayments")
    .input(z.object({ paymentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const sheets = await getSheetsService(ctx.org.orgId);
      const existing = await sheets.getById(SHEET_TABS.PAYMENTS, "PaymentID", input.paymentId);
      if (!existing) throw new Error("ไม่พบรายการ");
      if (existing.Status !== "pending" && existing.Status !== "rejected") {
        throw new Error("ลบได้เฉพาะรายการที่ยังไม่อนุมัติ");
      }

      const ok = await sheets.deleteById(SHEET_TABS.PAYMENTS, "PaymentID", input.paymentId);
      if (!ok) throw new Error("ลบไม่สำเร็จ");

      await prisma.auditLog.create({
        data: {
          orgId: ctx.org.orgId,
          userId: ctx.session.userId,
          action: "delete",
          entityType: "payment",
          entityRef: input.paymentId,
          summary: `ลบรายการจ่าย`,
        },
      });

      return { success: true };
    }),
});
