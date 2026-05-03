// ===========================================
// Aim Expense — Billing Router (S24)
// ใบวางบิล CRUD + state transitions + recordPayment
// State: draft → sent → partial → paid | void  (overdue = derived)
// ===========================================

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, orgProcedure, permissionProcedure } from "../trpc";
import { getSheetsService, ensureTabsCached } from "../lib/sheets-context";
import {
  GoogleSheetsService,
  SHEET_TABS,
} from "../services/google-sheets.service";
import { computeNextDocNumber } from "../lib/doc-number";
import { prisma } from "@/lib/prisma";

// ===== Schemas =====

const BillingLineInput = z.object({
  description: z.string().min(1, "กรุณากรอกรายละเอียด").max(500),
  quantity: z.number().min(0.01, "จำนวนต้องมากกว่า 0"),
  unitPrice: z.number().min(0),
  discountPercent: z.number().min(0).max(100).default(0),
  notes: z.string().max(200).optional(),
});

const BillingStatus = z.enum([
  "draft",
  "sent",
  "partial",
  "paid",
  "void",
]);

const PaymentMethod = z.enum([
  "transfer",
  "cash",
  "cheque",
  "creditCard",
  "other",
]);

const BillingCreateInput = z.object({
  docDate: z.string().min(1),
  dueDate: z.string().min(1),
  customerId: z.string().min(1),
  sourceQuotationId: z.string().optional(),
  eventId: z.string().optional(),
  projectName: z.string().max(200).optional(),
  vatIncluded: z.boolean(),
  discountAmount: z.number().min(0).default(0),
  whtPercent: z.number().min(0).max(15).default(0),
  notes: z.string().max(1000).optional(),
  terms: z.string().max(1000).optional(),
  lines: z.array(BillingLineInput).min(1, "ต้องมีอย่างน้อย 1 รายการ"),
});

// ===== Helpers =====

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Compute totals — same as Quotation but adds WHT
 *
 * Formula:
 *   Subtotal = sum(lineTotals) - discountAmount  (or backed-out if VAT included)
 *   VATAmount = subtotal × 0.07  (or × 7/107 if included)
 *   GrandTotal = Subtotal + VATAmount
 *   WHTAmount = Subtotal × WHTPercent / 100  (WHT base = pre-VAT subtotal)
 *   AmountReceivable = GrandTotal - WHTAmount  (= cash actually received)
 */
export function computeBillingTotals(
  lines: { quantity: number; unitPrice: number; discountPercent: number }[],
  vatIncluded: boolean,
  discountAmount: number,
  whtPercent: number
): {
  lineTotals: number[];
  subtotal: number;
  vatAmount: number;
  grandTotal: number;
  whtAmount: number;
  amountReceivable: number;
} {
  const lineTotals = lines.map((l) =>
    round2(l.quantity * l.unitPrice * (1 - l.discountPercent / 100))
  );
  const sumLines = lineTotals.reduce((a, b) => a + b, 0);

  let subtotal: number;
  let vatAmount: number;
  let grandTotal: number;

  if (vatIncluded) {
    grandTotal = round2(sumLines - discountAmount);
    vatAmount = round2((grandTotal * 7) / 107);
    subtotal = round2(grandTotal - vatAmount);
  } else {
    subtotal = round2(sumLines - discountAmount);
    vatAmount = round2(subtotal * 0.07);
    grandTotal = round2(subtotal + vatAmount);
  }

  const whtAmount = round2((subtotal * whtPercent) / 100);
  const amountReceivable = round2(grandTotal - whtAmount);

  return {
    lineTotals,
    subtotal,
    vatAmount,
    grandTotal,
    whtAmount,
    amountReceivable,
  };
}

// ===== Output shape =====

function shapeHeader(r: Record<string, string>) {
  const grandTotal = parseFloat(r.GrandTotal) || 0;
  const paidAmount = parseFloat(r.PaidAmount) || 0;
  return {
    billingId: r.BillingID,
    docNumber: r.DocNumber,
    docDate: r.DocDate,
    dueDate: r.DueDate,
    customerId: r.CustomerID,
    customerNameSnapshot: r.CustomerNameSnapshot,
    customerTaxIdSnapshot: r.CustomerTaxIdSnapshot,
    customerAddressSnapshot: r.CustomerAddressSnapshot,
    sourceQuotationId: r.SourceQuotationID || "",
    eventId: r.EventID || "",
    projectName: r.ProjectName || "",
    status: (r.Status || "draft") as
      | "draft"
      | "sent"
      | "partial"
      | "paid"
      | "void",
    subtotal: parseFloat(r.Subtotal) || 0,
    discountAmount: parseFloat(r.DiscountAmount) || 0,
    vatAmount: parseFloat(r.VATAmount) || 0,
    vatIncluded: r.VATIncluded === "TRUE" || r.VATIncluded === "true",
    whtPercent: parseFloat(r.WHTPercent) || 0,
    whtAmount: parseFloat(r.WHTAmount) || 0,
    grandTotal,
    amountReceivable: parseFloat(r.AmountReceivable) || 0,
    paidAmount,
    balance: round2(grandTotal - paidAmount),
    paidDate: r.PaidDate || "",
    paymentMethod: r.PaymentMethod || "",
    bankAccountId: r.BankAccountID || "",
    notes: r.Notes || "",
    terms: r.Terms || "",
    preparedBy: r.PreparedBy || "",
    preparedByUserId: r.PreparedByUserId || "",
    createdAt: r.CreatedAt || "",
    updatedAt: r.UpdatedAt || "",
    pdfUrl: r.PdfUrl || "",
  };
}

function shapeLine(r: Record<string, string>) {
  return {
    lineId: r.LineID,
    billingId: r.BillingID,
    lineNumber: parseInt(r.LineNumber, 10) || 0,
    description: r.Description || "",
    quantity: parseFloat(r.Quantity) || 0,
    unitPrice: parseFloat(r.UnitPrice) || 0,
    discountPercent: parseFloat(r.DiscountPercent) || 0,
    lineTotal: parseFloat(r.LineTotal) || 0,
    notes: r.Notes || "",
  };
}

// ===== Router =====

export const billingRouter = router({
  list: orgProcedure
    .input(
      z
        .object({
          status: BillingStatus.optional(),
          customerId: z.string().optional(),
          from: z.string().optional(),
          to: z.string().optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const sheets = await getSheetsService(ctx.org.orgId);
      await ensureTabsCached(sheets, ctx.org.orgId);
      const all = await sheets.getBillings();

      const filtered = all.filter((r) => {
        if (input?.status && r.Status !== input.status) return false;
        if (input?.customerId && r.CustomerID !== input.customerId)
          return false;
        if (input?.from && r.DocDate < input.from) return false;
        if (input?.to && r.DocDate > input.to) return false;
        return true;
      });

      filtered.sort((a, b) => {
        const d = (b.DocDate || "").localeCompare(a.DocDate || "");
        if (d !== 0) return d;
        return (b.CreatedAt || "").localeCompare(a.CreatedAt || "");
      });

      return filtered.map(shapeHeader);
    }),

  getById: orgProcedure
    .input(z.object({ billingId: z.string() }))
    .query(async ({ ctx, input }) => {
      const sheets = await getSheetsService(ctx.org.orgId);
      const header = await sheets.getBillingById(input.billingId);
      if (!header) return null;
      const lines = await sheets.getBillingLines(input.billingId);
      lines.sort(
        (a, b) =>
          (parseInt(a.LineNumber, 10) || 0) -
          (parseInt(b.LineNumber, 10) || 0)
      );
      return {
        header: shapeHeader(header),
        lines: lines.map(shapeLine),
      };
    }),

  create: permissionProcedure("manageBillings")
    .input(BillingCreateInput)
    .mutation(async ({ ctx, input }) => {
      const sheets = await getSheetsService(ctx.org.orgId);
      await ensureTabsCached(sheets, ctx.org.orgId);

      const customer = await sheets.getCustomerById(input.customerId);
      if (!customer) {
        throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบลูกค้า" });
      }

      const billingId = GoogleSheetsService.generateId("BIL");
      const year =
        new Date(input.docDate).getFullYear() || new Date().getFullYear();
      const docNumber = await computeNextDocNumber(
        sheets,
        "BIL",
        year,
        SHEET_TABS.BILLINGS
      );

      const totals = computeBillingTotals(
        input.lines,
        input.vatIncluded,
        input.discountAmount,
        input.whtPercent
      );

      const now = new Date().toISOString();

      try {
        await sheets.appendRowByHeaders(SHEET_TABS.BILLINGS, {
          BillingID: billingId,
          DocNumber: docNumber,
          DocDate: input.docDate,
          DueDate: input.dueDate,
          CustomerID: customer.CustomerID,
          CustomerNameSnapshot: customer.CustomerName || "",
          CustomerTaxIdSnapshot: customer.TaxID || "",
          CustomerAddressSnapshot:
            customer.BillingAddress || customer.Address || "",
          SourceQuotationID: input.sourceQuotationId || "",
          EventID: input.eventId || "",
          ProjectName: input.projectName || "",
          Status: "draft",
          Subtotal: totals.subtotal,
          DiscountAmount: input.discountAmount,
          VATAmount: totals.vatAmount,
          VATIncluded: input.vatIncluded ? "TRUE" : "FALSE",
          WHTPercent: input.whtPercent,
          WHTAmount: totals.whtAmount,
          GrandTotal: totals.grandTotal,
          AmountReceivable: totals.amountReceivable,
          PaidAmount: 0,
          PaidDate: "",
          PaymentMethod: "",
          BankAccountID: "",
          Notes: input.notes || "",
          Terms: input.terms || "",
          PreparedBy: ctx.session.displayName || "",
          PreparedByUserId: ctx.session.userId,
          CreatedAt: now,
          UpdatedAt: now,
          PdfUrl: "",
        });

        for (let i = 0; i < input.lines.length; i++) {
          const l = input.lines[i];
          await sheets.appendRowByHeaders(SHEET_TABS.BILLING_LINES, {
            LineID: GoogleSheetsService.generateId("BILL"),
            BillingID: billingId,
            LineNumber: i + 1,
            Description: l.description,
            Quantity: l.quantity,
            UnitPrice: l.unitPrice,
            DiscountPercent: l.discountPercent,
            LineTotal: totals.lineTotals[i],
            Notes: l.notes || "",
          });
        }
      } catch (e) {
        // Cleanup orphan
        try {
          await sheets.deleteById(SHEET_TABS.BILLINGS, "BillingID", billingId);
          const orphanLines = await sheets.getBillingLines(billingId);
          for (const ol of orphanLines) {
            await sheets.deleteById(
              SHEET_TABS.BILLING_LINES,
              "LineID",
              ol.LineID
            );
          }
        } catch {
          /* ignore */
        }
        throw e;
      }

      await prisma.auditLog.create({
        data: {
          orgId: ctx.org.orgId,
          userId: ctx.session.userId,
          action: "create",
          entityType: "billing",
          entityRef: billingId,
          summary: `สร้างใบวางบิล ${docNumber}`,
        },
      });

      return { success: true, billingId, docNumber };
    }),

  update: permissionProcedure("manageBillings")
    .input(z.object({ billingId: z.string() }).merge(BillingCreateInput))
    .mutation(async ({ ctx, input }) => {
      const sheets = await getSheetsService(ctx.org.orgId);
      const existing = await sheets.getBillingById(input.billingId);
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบใบวางบิล" });
      }
      if (existing.Status !== "draft") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `แก้ไขไม่ได้ — สถานะปัจจุบัน: ${existing.Status}`,
        });
      }

      const customer = await sheets.getCustomerById(input.customerId);
      if (!customer) {
        throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบลูกค้า" });
      }

      const totals = computeBillingTotals(
        input.lines,
        input.vatIncluded,
        input.discountAmount,
        input.whtPercent
      );

      await sheets.updateById(
        SHEET_TABS.BILLINGS,
        "BillingID",
        input.billingId,
        {
          DocDate: input.docDate,
          DueDate: input.dueDate,
          CustomerID: customer.CustomerID,
          CustomerNameSnapshot: customer.CustomerName || "",
          CustomerTaxIdSnapshot: customer.TaxID || "",
          CustomerAddressSnapshot:
            customer.BillingAddress || customer.Address || "",
          EventID: input.eventId || "",
          ProjectName: input.projectName || "",
          Subtotal: totals.subtotal,
          DiscountAmount: input.discountAmount,
          VATAmount: totals.vatAmount,
          VATIncluded: input.vatIncluded ? "TRUE" : "FALSE",
          WHTPercent: input.whtPercent,
          WHTAmount: totals.whtAmount,
          GrandTotal: totals.grandTotal,
          AmountReceivable: totals.amountReceivable,
          Notes: input.notes || "",
          Terms: input.terms || "",
          UpdatedAt: new Date().toISOString(),
        }
      );

      const oldLines = await sheets.getBillingLines(input.billingId);
      for (const ol of oldLines) {
        await sheets.deleteById(
          SHEET_TABS.BILLING_LINES,
          "LineID",
          ol.LineID
        );
      }
      for (let i = 0; i < input.lines.length; i++) {
        const l = input.lines[i];
        await sheets.appendRowByHeaders(SHEET_TABS.BILLING_LINES, {
          LineID: GoogleSheetsService.generateId("BILL"),
          BillingID: input.billingId,
          LineNumber: i + 1,
          Description: l.description,
          Quantity: l.quantity,
          UnitPrice: l.unitPrice,
          DiscountPercent: l.discountPercent,
          LineTotal: totals.lineTotals[i],
          Notes: l.notes || "",
        });
      }

      await prisma.auditLog.create({
        data: {
          orgId: ctx.org.orgId,
          userId: ctx.session.userId,
          action: "update",
          entityType: "billing",
          entityRef: input.billingId,
          summary: `แก้ไขใบวางบิล ${existing.DocNumber}`,
        },
      });

      return { success: true };
    }),

  // ===== State transitions =====

  send: permissionProcedure("manageBillings")
    .input(z.object({ billingId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const sheets = await getSheetsService(ctx.org.orgId);
      const existing = await sheets.getBillingById(input.billingId);
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบใบวางบิล" });
      }
      if (existing.Status !== "draft") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `ส่งไม่ได้ — สถานะปัจจุบัน: ${existing.Status}`,
        });
      }
      await sheets.updateById(
        SHEET_TABS.BILLINGS,
        "BillingID",
        input.billingId,
        {
          Status: "sent",
          UpdatedAt: new Date().toISOString(),
        }
      );
      await prisma.auditLog.create({
        data: {
          orgId: ctx.org.orgId,
          userId: ctx.session.userId,
          action: "update",
          entityType: "billing",
          entityRef: input.billingId,
          summary: `ส่งใบวางบิล ${existing.DocNumber}`,
        },
      });
      return { success: true };
    }),

  void: permissionProcedure("manageBillings")
    .input(z.object({ billingId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const sheets = await getSheetsService(ctx.org.orgId);
      const existing = await sheets.getBillingById(input.billingId);
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบใบวางบิล" });
      }
      if (existing.Status === "void" || existing.Status === "paid") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `ยกเลิกไม่ได้ — สถานะปัจจุบัน: ${existing.Status}`,
        });
      }
      await sheets.updateById(
        SHEET_TABS.BILLINGS,
        "BillingID",
        input.billingId,
        {
          Status: "void",
          UpdatedAt: new Date().toISOString(),
        }
      );
      await prisma.auditLog.create({
        data: {
          orgId: ctx.org.orgId,
          userId: ctx.session.userId,
          action: "update",
          entityType: "billing",
          entityRef: input.billingId,
          summary: `ยกเลิกใบวางบิล ${existing.DocNumber}`,
        },
      });
      return { success: true };
    }),

  /**
   * Record received payment (full or partial)
   * - PaidAmount += amount
   * - Status updates: partial (if < grandTotal) or paid (if >= grandTotal)
   * - PaidDate = วันที่รับเงิน (latest)
   */
  recordPayment: permissionProcedure("manageBillings")
    .input(
      z.object({
        billingId: z.string(),
        amount: z.number().min(0.01, "จำนวนเงินต้องมากกว่า 0"),
        paidDate: z.string().min(1),
        paymentMethod: PaymentMethod,
        bankAccountId: z.string().optional(),
        notes: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const sheets = await getSheetsService(ctx.org.orgId);
      const existing = await sheets.getBillingById(input.billingId);
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบใบวางบิล" });
      }
      if (existing.Status === "void") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "ใบวางบิลถูกยกเลิกแล้ว",
        });
      }
      if (existing.Status === "draft") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "ต้องส่งใบวางบิลก่อนถึงจะบันทึกรับเงินได้",
        });
      }
      if (existing.Status === "paid") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "ใบวางบิลนี้ชำระครบแล้ว",
        });
      }

      const grandTotal = parseFloat(existing.GrandTotal) || 0;
      const previousPaid = parseFloat(existing.PaidAmount) || 0;
      const newPaid = round2(previousPaid + input.amount);

      if (newPaid > grandTotal) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `จำนวนเงินที่รับเกินยอดรวม (รับแล้ว ${previousPaid} + ${input.amount} > ${grandTotal})`,
        });
      }

      const newStatus = newPaid >= grandTotal ? "paid" : "partial";

      await sheets.updateById(
        SHEET_TABS.BILLINGS,
        "BillingID",
        input.billingId,
        {
          PaidAmount: newPaid,
          PaidDate: input.paidDate,
          PaymentMethod: input.paymentMethod,
          BankAccountID: input.bankAccountId || "",
          Status: newStatus,
          UpdatedAt: new Date().toISOString(),
        }
      );

      await prisma.auditLog.create({
        data: {
          orgId: ctx.org.orgId,
          userId: ctx.session.userId,
          action: "update",
          entityType: "billing",
          entityRef: input.billingId,
          summary: `รับเงิน ${input.amount.toLocaleString()} บาท (${input.paymentMethod}) ใบวางบิล ${existing.DocNumber} → ${newStatus}`,
        },
      });

      return {
        success: true,
        newStatus,
        paidAmount: newPaid,
        balance: round2(grandTotal - newPaid),
      };
    }),
});
