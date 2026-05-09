// ===========================================
// Aim Expense — Tax Invoice Router (S25B)
// ใบกำกับภาษี CRUD + state machine + convert flows
//
// State: draft → issued → void
// Critical compliance: DocNumber computed AT ISSUE (sequential, no gaps).
// Once issued, all fields locked; only void allowed (with reason).
//
// Linkage: SourceBillingID OR SourceQuotationID (optional — direct sale OK)
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

const TaxInvoiceLineInput = z.object({
  description: z.string().min(1, "กรุณากรอกรายละเอียด").max(500),
  expenseNature: z.enum(["goods", "service"]).default("service"),
  quantity: z.number().min(0.01, "จำนวนต้องมากกว่า 0"),
  unitPrice: z.number().min(0),
  discountPercent: z.number().min(0).max(100).default(0),
  notes: z.string().max(200).optional(),
});

const TaxInvoiceStatus = z.enum(["draft", "issued", "void"]);

const TaxInvoiceCreateInput = z.object({
  docDate: z.string().min(1),
  customerId: z.string().min(1),
  sourceBillingId: z.string().optional(),
  sourceQuotationId: z.string().optional(),
  eventId: z.string().optional(),
  projectName: z.string().max(200).optional(),
  vatIncluded: z.boolean(),
  discountAmount: z.number().min(0).default(0),
  notes: z.string().max(1000).optional(),
  lines: z.array(TaxInvoiceLineInput).min(1, "ต้องมีอย่างน้อย 1 รายการ"),
});

// ===== Helpers =====

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Compute totals — same shape as Billing but no WHT (TI is the tax document; WHT lives on Billing/payment)
 */
export function computeTaxInvoiceTotals(
  lines: { quantity: number; unitPrice: number; discountPercent: number }[],
  vatIncluded: boolean,
  discountAmount: number,
): {
  lineTotals: number[];
  subtotal: number;
  vatAmount: number;
  grandTotal: number;
} {
  const lineTotals = lines.map((l) =>
    round2(l.quantity * l.unitPrice * (1 - l.discountPercent / 100)),
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

  return { lineTotals, subtotal, vatAmount, grandTotal };
}

/**
 * Branch label per Revenue Department convention.
 * "00000" = HQ; "00001"+ = branches (5-digit zero-padded).
 */
function branchLabelOf(branchType: string, branchNumber: string): string {
  if (branchType === "HQ") return "00000";
  if (branchType === "Branch" && branchNumber) {
    return branchNumber.padStart(5, "0");
  }
  return "";
}

/**
 * Validate doc-date: warn if backdated >7 days, block future dates entirely.
 * Per S25B carry-forward: ±7d soft, future hard-block.
 */
function validateDocDate(docDate: string): { warn?: string } {
  const today = new Date().toISOString().slice(0, 10);
  if (docDate > today) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "ไม่สามารถออกใบกำกับภาษีล่วงหน้าได้ (วันที่ในอนาคต)",
    });
  }
  const docTime = new Date(docDate).getTime();
  const todayTime = new Date(today).getTime();
  const diffDays = Math.floor((todayTime - docTime) / (1000 * 60 * 60 * 24));
  if (diffDays > 7) {
    return {
      warn: `วันที่เอกสาร backdate ${diffDays} วัน — โปรดตรวจสอบความถูกต้อง`,
    };
  }
  return {};
}

// ===== Output shape =====

function shapeHeader(r: Record<string, string>) {
  return {
    taxInvoiceId: r.TaxInvoiceID,
    docNumber: r.DocNumber || "",
    docDate: r.DocDate,
    customerId: r.CustomerID,
    customerNameSnapshot: r.CustomerNameSnapshot,
    customerTaxIdSnapshot: r.CustomerTaxIdSnapshot,
    customerBranchSnapshot: r.CustomerBranchSnapshot || "",
    customerAddressSnapshot: r.CustomerAddressSnapshot,
    sourceBillingId: r.SourceBillingID || "",
    sourceQuotationId: r.SourceQuotationID || "",
    eventId: r.EventID || "",
    projectName: r.ProjectName || "",
    status: (r.Status || "draft") as "draft" | "issued" | "void",
    subtotal: parseFloat(r.Subtotal) || 0,
    discountAmount: parseFloat(r.DiscountAmount) || 0,
    vatAmount: parseFloat(r.VATAmount) || 0,
    vatIncluded: r.VATIncluded === "TRUE" || r.VATIncluded === "true",
    grandTotal: parseFloat(r.GrandTotal) || 0,
    notes: r.Notes || "",
    preparedBy: r.PreparedBy || "",
    preparedByUserId: r.PreparedByUserId || "",
    issuedAt: r.IssuedAt || "",
    voidedAt: r.VoidedAt || "",
    voidReason: r.VoidReason || "",
    creditNoteId: r.CreditNoteID || "",
    createdAt: r.CreatedAt || "",
    updatedAt: r.UpdatedAt || "",
    pdfUrl: r.PdfUrl || "",
    // Payment tracking (Phase 2)
    paidAmount: parseFloat(r.PaidAmount) || 0,
    paidDate: r.PaidDate || "",
    paymentMethod: (r.PaymentMethod || "") as "" | "cash" | "transfer" | "cheque",
    paymentWHTPercent: parseFloat(r.PaymentWHTPercent) || 0,
    paymentWHTAmount: parseFloat(r.PaymentWHTAmount) || 0,
    paymentAdjustmentAmount: parseFloat(r.PaymentAdjustmentAmount) || 0,
    paymentAdjustmentNote: r.PaymentAdjustmentNote || "",
    paymentEvidenceUrl: r.PaymentEvidenceUrl || "",
    whtCertUrl: r.WHTCertUrl || "",
    paymentRecordedAt: r.PaymentRecordedAt || "",
    isPaid: (parseFloat(r.PaidAmount) || 0) > 0,
  };
}

function shapeLine(r: Record<string, string>) {
  return {
    lineId: r.LineID,
    taxInvoiceId: r.TaxInvoiceID,
    lineNumber: parseInt(r.LineNumber, 10) || 0,
    description: r.Description || "",
    expenseNature: (r.ExpenseNature || "service") as "goods" | "service",
    quantity: parseFloat(r.Quantity) || 0,
    unitPrice: parseFloat(r.UnitPrice) || 0,
    discountPercent: parseFloat(r.DiscountPercent) || 0,
    lineTotal: parseFloat(r.LineTotal) || 0,
    notes: r.Notes || "",
  };
}

// ===== Router =====

export const taxInvoiceRouter = router({
  list: orgProcedure
    .input(
      z
        .object({
          status: TaxInvoiceStatus.optional(),
          customerId: z.string().optional(),
          from: z.string().optional(),
          to: z.string().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const sheets = await getSheetsService(ctx.org.orgId);
      await ensureTabsCached(sheets, ctx.org.orgId);
      const all = await sheets.getTaxInvoices();

      const filtered = all.filter((r) => {
        if (input?.status && r.Status !== input.status) return false;
        if (input?.customerId && r.CustomerID !== input.customerId) return false;
        if (input?.from && r.DocDate < input.from) return false;
        if (input?.to && r.DocDate > input.to) return false;
        return true;
      });

      filtered.sort((a, b) => {
        // Issued docs first (by doc number desc), then drafts (by createdAt desc)
        const aIssued = a.Status === "issued";
        const bIssued = b.Status === "issued";
        if (aIssued !== bIssued) return aIssued ? -1 : 1;
        const d = (b.DocDate || "").localeCompare(a.DocDate || "");
        if (d !== 0) return d;
        return (b.CreatedAt || "").localeCompare(a.CreatedAt || "");
      });

      return filtered.map(shapeHeader);
    }),

  getById: orgProcedure
    .input(z.object({ taxInvoiceId: z.string() }))
    .query(async ({ ctx, input }) => {
      const sheets = await getSheetsService(ctx.org.orgId);
      // batchGet — fetch header tab + lines tab in 1 HTTP call
      const batch = await sheets.getAllBatch([
        SHEET_TABS.TAX_INVOICES,
        SHEET_TABS.TAX_INVOICE_LINES,
      ]);
      const header = (batch[SHEET_TABS.TAX_INVOICES] || []).find(
        (r) => r.TaxInvoiceID === input.taxInvoiceId,
      );
      if (!header) return null;
      const lines = (batch[SHEET_TABS.TAX_INVOICE_LINES] || [])
        .filter((r) => r.TaxInvoiceID === input.taxInvoiceId)
        .sort(
          (a, b) =>
            (parseInt(a.LineNumber, 10) || 0) -
            (parseInt(b.LineNumber, 10) || 0),
        );
      return {
        header: shapeHeader(header),
        lines: lines.map(shapeLine),
      };
    }),

  create: permissionProcedure("manageTaxInvoices")
    .input(TaxInvoiceCreateInput)
    .mutation(async ({ ctx, input }) => {
      validateDocDate(input.docDate);

      const sheets = await getSheetsService(ctx.org.orgId);
      await ensureTabsCached(sheets, ctx.org.orgId);

      const customer = await sheets.getCustomerById(input.customerId);
      if (!customer) {
        throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบลูกค้า" });
      }

      const taxInvoiceId = GoogleSheetsService.generateId("TI");
      const totals = computeTaxInvoiceTotals(
        input.lines,
        input.vatIncluded,
        input.discountAmount,
      );

      const now = new Date().toISOString();

      try {
        await sheets.appendRowByHeaders(SHEET_TABS.TAX_INVOICES, {
          TaxInvoiceID: taxInvoiceId,
          DocNumber: "", // empty until issued
          DocDate: input.docDate,
          CustomerID: customer.CustomerID,
          CustomerNameSnapshot: customer.CustomerName || "",
          CustomerTaxIdSnapshot: customer.TaxID || "",
          CustomerBranchSnapshot: branchLabelOf(
            customer.BranchType || "",
            customer.BranchNumber || "",
          ),
          CustomerAddressSnapshot: customer.Address || customer.BillingAddress || "",
          SourceBillingID: input.sourceBillingId || "",
          SourceQuotationID: input.sourceQuotationId || "",
          EventID: input.eventId || "",
          ProjectName: input.projectName || "",
          Status: "draft",
          Subtotal: totals.subtotal,
          DiscountAmount: input.discountAmount,
          VATAmount: totals.vatAmount,
          VATIncluded: input.vatIncluded ? "TRUE" : "FALSE",
          GrandTotal: totals.grandTotal,
          Notes: input.notes || "",
          PreparedBy: ctx.session.displayName || "",
          PreparedByUserId: ctx.session.userId,
          IssuedAt: "",
          VoidedAt: "",
          VoidReason: "",
          CreditNoteID: "",
          CreatedAt: now,
          UpdatedAt: now,
          PdfUrl: "",
        });

        for (let i = 0; i < input.lines.length; i++) {
          const l = input.lines[i];
          await sheets.appendRowByHeaders(SHEET_TABS.TAX_INVOICE_LINES, {
            LineID: GoogleSheetsService.generateId("TIL"),
            TaxInvoiceID: taxInvoiceId,
            LineNumber: i + 1,
            Description: l.description,
            ExpenseNature: l.expenseNature,
            Quantity: l.quantity,
            UnitPrice: l.unitPrice,
            DiscountPercent: l.discountPercent,
            LineTotal: totals.lineTotals[i],
            Notes: l.notes || "",
          });
        }
      } catch (e) {
        try {
          await sheets.deleteById(
            SHEET_TABS.TAX_INVOICES,
            "TaxInvoiceID",
            taxInvoiceId,
          );
          const orphans = await sheets.getTaxInvoiceLines(taxInvoiceId);
          for (const ol of orphans) {
            await sheets.deleteById(
              SHEET_TABS.TAX_INVOICE_LINES,
              "LineID",
              ol.LineID,
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
          entityType: "tax_invoice",
          entityRef: taxInvoiceId,
          summary: `สร้างใบกำกับภาษี (draft) สำหรับ ${customer.CustomerName}`,
        },
      });

      return { success: true, taxInvoiceId };
    }),

  /**
   * Update a draft tax invoice. Issued/void TIs are locked.
   */
  update: permissionProcedure("manageTaxInvoices")
    .input(z.object({ taxInvoiceId: z.string() }).merge(TaxInvoiceCreateInput))
    .mutation(async ({ ctx, input }) => {
      validateDocDate(input.docDate);

      const sheets = await getSheetsService(ctx.org.orgId);
      const existing = await sheets.getTaxInvoiceById(input.taxInvoiceId);
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบใบกำกับภาษี" });
      }
      if (existing.Status !== "draft") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `แก้ไขไม่ได้ — ใบกำกับภาษีถูก ${existing.Status === "issued" ? "ออกเลขแล้ว (lock)" : "ยกเลิกแล้ว"}`,
        });
      }

      const customer = await sheets.getCustomerById(input.customerId);
      if (!customer) {
        throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบลูกค้า" });
      }

      const totals = computeTaxInvoiceTotals(
        input.lines,
        input.vatIncluded,
        input.discountAmount,
      );

      await sheets.updateById(
        SHEET_TABS.TAX_INVOICES,
        "TaxInvoiceID",
        input.taxInvoiceId,
        {
          DocDate: input.docDate,
          CustomerID: customer.CustomerID,
          CustomerNameSnapshot: customer.CustomerName || "",
          CustomerTaxIdSnapshot: customer.TaxID || "",
          CustomerBranchSnapshot: branchLabelOf(
            customer.BranchType || "",
            customer.BranchNumber || "",
          ),
          CustomerAddressSnapshot:
            customer.Address || customer.BillingAddress || "",
          EventID: input.eventId || "",
          ProjectName: input.projectName || "",
          Subtotal: totals.subtotal,
          DiscountAmount: input.discountAmount,
          VATAmount: totals.vatAmount,
          VATIncluded: input.vatIncluded ? "TRUE" : "FALSE",
          GrandTotal: totals.grandTotal,
          Notes: input.notes || "",
          UpdatedAt: new Date().toISOString(),
        },
      );

      const oldLines = await sheets.getTaxInvoiceLines(input.taxInvoiceId);
      for (const ol of oldLines) {
        await sheets.deleteById(
          SHEET_TABS.TAX_INVOICE_LINES,
          "LineID",
          ol.LineID,
        );
      }
      for (let i = 0; i < input.lines.length; i++) {
        const l = input.lines[i];
        await sheets.appendRowByHeaders(SHEET_TABS.TAX_INVOICE_LINES, {
          LineID: GoogleSheetsService.generateId("TIL"),
          TaxInvoiceID: input.taxInvoiceId,
          LineNumber: i + 1,
          Description: l.description,
          ExpenseNature: l.expenseNature,
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
          entityType: "tax_invoice",
          entityRef: input.taxInvoiceId,
          summary: `แก้ไขใบกำกับภาษี draft`,
        },
      });

      return { success: true };
    }),

  /**
   * Issue a draft tax invoice — assigns sequential DocNumber + locks all fields.
   *
   * Compliance critical (RD requirement):
   * - Customer TaxID + Branch must be present (cannot issue without)
   * - DocNumber computed from MAX of issued+year+1 → strictly sequential
   * - Once issued, only `void` action is allowed; all fields immutable
   */
  issue: permissionProcedure("manageTaxInvoices")
    .input(z.object({ taxInvoiceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const sheets = await getSheetsService(ctx.org.orgId);
      const existing = await sheets.getTaxInvoiceById(input.taxInvoiceId);
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบใบกำกับภาษี" });
      }
      if (existing.Status !== "draft") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `ออกเลขไม่ได้ — สถานะปัจจุบัน: ${existing.Status}`,
        });
      }
      // RD compliance — must have TaxID + Branch snapshot
      if (!existing.CustomerTaxIdSnapshot) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "ลูกค้าไม่มีเลขประจำตัวผู้เสียภาษี — กรุณาเพิ่มก่อนออกใบกำกับภาษี",
        });
      }
      if (!existing.CustomerBranchSnapshot) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "ลูกค้าไม่มีข้อมูลสาขา (สำนักงานใหญ่/สาขาเลขที่) — กรุณาเพิ่มก่อนออกใบกำกับภาษี",
        });
      }

      const docDate = existing.DocDate || new Date().toISOString().slice(0, 10);
      const year = new Date(docDate).getFullYear() || new Date().getFullYear();
      // Sequential numbering — only count issued docs (skip draft/void)
      const docNumber = await computeNextDocNumber(
        sheets,
        "TI",
        year,
        SHEET_TABS.TAX_INVOICES,
        (status) => status === "issued",
      );

      const now = new Date().toISOString();
      await sheets.updateById(
        SHEET_TABS.TAX_INVOICES,
        "TaxInvoiceID",
        input.taxInvoiceId,
        {
          DocNumber: docNumber,
          Status: "issued",
          IssuedAt: now,
          UpdatedAt: now,
        },
      );

      await prisma.auditLog.create({
        data: {
          orgId: ctx.org.orgId,
          userId: ctx.session.userId,
          action: "update",
          entityType: "tax_invoice",
          entityRef: input.taxInvoiceId,
          summary: `ออกใบกำกับภาษี ${docNumber} (lock)`,
        },
      });

      return { success: true, docNumber };
    }),

  /**
   * Void an issued tax invoice — sets status=void with timestamp + reason.
   * Per RD: voided numbers stay in the sequence (do not re-use).
   * Phase 2 (future): link to a credit-note that replaces it.
   */
  void: permissionProcedure("manageTaxInvoices")
    .input(
      z.object({
        taxInvoiceId: z.string(),
        reason: z.string().min(3, "กรุณาระบุเหตุผลในการยกเลิก").max(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const sheets = await getSheetsService(ctx.org.orgId);
      const existing = await sheets.getTaxInvoiceById(input.taxInvoiceId);
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบใบกำกับภาษี" });
      }
      if (existing.Status === "void") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "ใบกำกับภาษีถูกยกเลิกแล้ว",
        });
      }
      if (existing.Status === "draft") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "ลบ draft แทนการยกเลิกได้เลย — void สำหรับใบที่ออกเลขแล้วเท่านั้น",
        });
      }

      const now = new Date().toISOString();
      await sheets.updateById(
        SHEET_TABS.TAX_INVOICES,
        "TaxInvoiceID",
        input.taxInvoiceId,
        {
          Status: "void",
          VoidedAt: now,
          VoidReason: input.reason,
          UpdatedAt: now,
        },
      );

      await prisma.auditLog.create({
        data: {
          orgId: ctx.org.orgId,
          userId: ctx.session.userId,
          action: "update",
          entityType: "tax_invoice",
          entityRef: input.taxInvoiceId,
          summary: `ยกเลิกใบกำกับภาษี ${existing.DocNumber}: ${input.reason}`,
        },
      });

      return { success: true };
    }),

  /**
   * Delete a draft tax invoice (only drafts — issued/void are immutable per RD).
   */
  delete: permissionProcedure("manageTaxInvoices")
    .input(z.object({ taxInvoiceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const sheets = await getSheetsService(ctx.org.orgId);
      const existing = await sheets.getTaxInvoiceById(input.taxInvoiceId);
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบใบกำกับภาษี" });
      }
      if (existing.Status !== "draft") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "ลบไม่ได้ — ใบกำกับภาษีที่ออกเลขแล้วต้องใช้ 'ยกเลิก' (void) แทน",
        });
      }

      await sheets.deleteById(
        SHEET_TABS.TAX_INVOICES,
        "TaxInvoiceID",
        input.taxInvoiceId,
      );
      const lines = await sheets.getTaxInvoiceLines(input.taxInvoiceId);
      for (const l of lines) {
        await sheets.deleteById(
          SHEET_TABS.TAX_INVOICE_LINES,
          "LineID",
          l.LineID,
        );
      }

      await prisma.auditLog.create({
        data: {
          orgId: ctx.org.orgId,
          userId: ctx.session.userId,
          action: "delete",
          entityType: "tax_invoice",
          entityRef: input.taxInvoiceId,
          summary: `ลบใบกำกับภาษี draft`,
        },
      });

      return { success: true };
    }),

  /**
   * Convert from a Billing → create a draft Tax Invoice with snapshots.
   * Billing remains untouched (TI is the tax doc; billing was just the demand-for-payment).
   */
  convertFromBilling: permissionProcedure("manageTaxInvoices")
    .input(z.object({ billingId: z.string(), docDate: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const sheets = await getSheetsService(ctx.org.orgId);
      await ensureTabsCached(sheets, ctx.org.orgId);

      const billing = await sheets.getBillingById(input.billingId);
      if (!billing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบใบวางบิล" });
      }
      if (billing.Status === "void") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "ใบวางบิลถูกยกเลิก ไม่สามารถออกใบกำกับภาษีได้",
        });
      }

      const billingLines = await sheets.getBillingLines(input.billingId);
      if (billingLines.length === 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "ใบวางบิลไม่มีรายการสินค้า/บริการ",
        });
      }

      const customer = await sheets.getCustomerById(billing.CustomerID);
      if (!customer) {
        throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบลูกค้า" });
      }

      const taxInvoiceId = GoogleSheetsService.generateId("TI");
      const docDate = input.docDate || new Date().toISOString().slice(0, 10);
      validateDocDate(docDate);

      const now = new Date().toISOString();

      try {
        await sheets.appendRowByHeaders(SHEET_TABS.TAX_INVOICES, {
          TaxInvoiceID: taxInvoiceId,
          DocNumber: "", // empty until issued
          DocDate: docDate,
          CustomerID: customer.CustomerID,
          CustomerNameSnapshot:
            billing.CustomerNameSnapshot || customer.CustomerName,
          CustomerTaxIdSnapshot:
            billing.CustomerTaxIdSnapshot || customer.TaxID || "",
          CustomerBranchSnapshot: branchLabelOf(
            customer.BranchType || "",
            customer.BranchNumber || "",
          ),
          CustomerAddressSnapshot:
            billing.CustomerAddressSnapshot ||
            customer.Address ||
            customer.BillingAddress ||
            "",
          SourceBillingID: billing.BillingID,
          SourceQuotationID: billing.SourceQuotationID || "",
          EventID: billing.EventID || "",
          ProjectName: billing.ProjectName || "",
          Status: "draft",
          Subtotal: parseFloat(billing.Subtotal) || 0,
          DiscountAmount: parseFloat(billing.DiscountAmount) || 0,
          VATAmount: parseFloat(billing.VATAmount) || 0,
          VATIncluded: billing.VATIncluded || "FALSE",
          GrandTotal: parseFloat(billing.GrandTotal) || 0,
          Notes: billing.Notes || "",
          PreparedBy: ctx.session.displayName || "",
          PreparedByUserId: ctx.session.userId,
          IssuedAt: "",
          VoidedAt: "",
          VoidReason: "",
          CreditNoteID: "",
          CreatedAt: now,
          UpdatedAt: now,
          PdfUrl: "",
        });

        for (let i = 0; i < billingLines.length; i++) {
          const bl = billingLines[i];
          await sheets.appendRowByHeaders(SHEET_TABS.TAX_INVOICE_LINES, {
            LineID: GoogleSheetsService.generateId("TIL"),
            TaxInvoiceID: taxInvoiceId,
            LineNumber: i + 1,
            Description: bl.Description || "",
            ExpenseNature: "service", // default — user can edit before issue
            Quantity: parseFloat(bl.Quantity) || 0,
            UnitPrice: parseFloat(bl.UnitPrice) || 0,
            DiscountPercent: parseFloat(bl.DiscountPercent) || 0,
            LineTotal: parseFloat(bl.LineTotal) || 0,
            Notes: bl.Notes || "",
          });
        }
      } catch (e) {
        try {
          await sheets.deleteById(
            SHEET_TABS.TAX_INVOICES,
            "TaxInvoiceID",
            taxInvoiceId,
          );
          const orphans = await sheets.getTaxInvoiceLines(taxInvoiceId);
          for (const ol of orphans) {
            await sheets.deleteById(
              SHEET_TABS.TAX_INVOICE_LINES,
              "LineID",
              ol.LineID,
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
          entityType: "tax_invoice",
          entityRef: taxInvoiceId,
          summary: `สร้างใบกำกับภาษี draft จากใบวางบิล ${billing.DocNumber}`,
        },
      });

      return { success: true, taxInvoiceId };
    }),

  /**
   * Convert from a Quotation → create a draft Tax Invoice (skip Billing).
   * Quotation status is NOT modified (a quotation may convert to multiple TIs over time).
   */
  convertFromQuotation: permissionProcedure("manageTaxInvoices")
    .input(z.object({ quotationId: z.string(), docDate: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const sheets = await getSheetsService(ctx.org.orgId);
      await ensureTabsCached(sheets, ctx.org.orgId);

      const quotation = await sheets.getQuotationById(input.quotationId);
      if (!quotation) {
        throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบใบเสนอราคา" });
      }
      if (
        quotation.Status === "void" ||
        quotation.Status === "rejected"
      ) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "ใบเสนอราคาถูกยกเลิก/ปฏิเสธ ไม่สามารถออกใบกำกับภาษีได้",
        });
      }

      const qLines = await sheets.getQuotationLines(input.quotationId);
      if (qLines.length === 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "ใบเสนอราคาไม่มีรายการสินค้า/บริการ",
        });
      }

      const customer = await sheets.getCustomerById(quotation.CustomerID);
      if (!customer) {
        throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบลูกค้า" });
      }

      const taxInvoiceId = GoogleSheetsService.generateId("TI");
      const docDate = input.docDate || new Date().toISOString().slice(0, 10);
      validateDocDate(docDate);

      const now = new Date().toISOString();

      try {
        await sheets.appendRowByHeaders(SHEET_TABS.TAX_INVOICES, {
          TaxInvoiceID: taxInvoiceId,
          DocNumber: "",
          DocDate: docDate,
          CustomerID: customer.CustomerID,
          CustomerNameSnapshot:
            quotation.CustomerNameSnapshot || customer.CustomerName,
          CustomerTaxIdSnapshot:
            quotation.CustomerTaxIdSnapshot || customer.TaxID || "",
          CustomerBranchSnapshot: branchLabelOf(
            customer.BranchType || "",
            customer.BranchNumber || "",
          ),
          CustomerAddressSnapshot:
            quotation.CustomerAddressSnapshot ||
            customer.Address ||
            customer.BillingAddress ||
            "",
          SourceBillingID: "",
          SourceQuotationID: quotation.QuotationID,
          EventID: quotation.EventID || "",
          ProjectName: quotation.ProjectName || "",
          Status: "draft",
          Subtotal: parseFloat(quotation.Subtotal) || 0,
          DiscountAmount: parseFloat(quotation.DiscountAmount) || 0,
          VATAmount: parseFloat(quotation.VATAmount) || 0,
          VATIncluded: quotation.VATIncluded || "FALSE",
          GrandTotal: parseFloat(quotation.GrandTotal) || 0,
          Notes: quotation.Notes || "",
          PreparedBy: ctx.session.displayName || "",
          PreparedByUserId: ctx.session.userId,
          IssuedAt: "",
          VoidedAt: "",
          VoidReason: "",
          CreditNoteID: "",
          CreatedAt: now,
          UpdatedAt: now,
          PdfUrl: "",
        });

        for (let i = 0; i < qLines.length; i++) {
          const ql = qLines[i];
          await sheets.appendRowByHeaders(SHEET_TABS.TAX_INVOICE_LINES, {
            LineID: GoogleSheetsService.generateId("TIL"),
            TaxInvoiceID: taxInvoiceId,
            LineNumber: i + 1,
            Description: ql.Description || "",
            ExpenseNature: "service",
            Quantity: parseFloat(ql.Quantity) || 0,
            UnitPrice: parseFloat(ql.UnitPrice) || 0,
            DiscountPercent: parseFloat(ql.DiscountPercent) || 0,
            LineTotal: parseFloat(ql.LineTotal) || 0,
            Notes: ql.Notes || "",
          });
        }
      } catch (e) {
        try {
          await sheets.deleteById(
            SHEET_TABS.TAX_INVOICES,
            "TaxInvoiceID",
            taxInvoiceId,
          );
          const orphans = await sheets.getTaxInvoiceLines(taxInvoiceId);
          for (const ol of orphans) {
            await sheets.deleteById(
              SHEET_TABS.TAX_INVOICE_LINES,
              "LineID",
              ol.LineID,
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
          entityType: "tax_invoice",
          entityRef: taxInvoiceId,
          summary: `สร้างใบกำกับภาษี draft จากใบเสนอราคา ${quotation.DocNumber}`,
        },
      });

      return { success: true, taxInvoiceId };
    }),

  /**
   * Record customer payment on an issued tax invoice (S25B Phase 2).
   *
   * Captures:
   *   - paidDate, paymentMethod, paymentEvidenceUrl
   *   - WHT (% + computed baht) — if customer ลูกค้าหัก ณ ที่จ่าย
   *   - adjustment amount (positive=เพิ่ม, negative=ลด) + optional note
   *   - netReceived (defaults to grandTotal − WHT − adjustment, but user can override)
   *   - whtCertUrl (optional — สามารถแนบทีหลังผ่าน attachWhtCert)
   *
   * Single-shot: re-calling overwrites previous payment record (no installments).
   * Once recorded, status stays "issued" (TI compliance is on issuance, not on
   * settlement). To reverse, void the TI.
   */
  recordPayment: permissionProcedure("manageTaxInvoices")
    .input(
      z.object({
        taxInvoiceId: z.string(),
        paidDate: z.string().min(1, "กรุณาระบุวันที่รับชำระ"),
        paymentMethod: z.enum(["cash", "transfer", "cheque"]),
        netReceived: z.number().min(0, "ยอดรับสุทธิต้องไม่ติดลบ"),
        whtPercent: z.number().min(0).max(15).default(0),
        whtAmount: z.number().min(0).default(0),
        adjustmentAmount: z.number().default(0), // can be negative
        adjustmentNote: z.string().max(500).optional(),
        paymentEvidenceUrl: z.string().optional(),
        whtCertUrl: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const sheets = await getSheetsService(ctx.org.orgId);
      const existing = await sheets.getTaxInvoiceById(input.taxInvoiceId);
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบใบกำกับภาษี" });
      }
      if (existing.Status !== "issued") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `บันทึกการชำระเงินไม่ได้ — สถานะปัจจุบัน: ${existing.Status} (ต้อง issued)`,
        });
      }

      const now = new Date().toISOString();
      await sheets.updateById(
        SHEET_TABS.TAX_INVOICES,
        "TaxInvoiceID",
        input.taxInvoiceId,
        {
          PaidAmount: round2(input.netReceived),
          PaidDate: input.paidDate,
          PaymentMethod: input.paymentMethod,
          PaymentWHTPercent: input.whtPercent,
          PaymentWHTAmount: round2(input.whtAmount),
          PaymentAdjustmentAmount: round2(input.adjustmentAmount),
          PaymentAdjustmentNote: input.adjustmentNote || "",
          PaymentEvidenceUrl: input.paymentEvidenceUrl || "",
          WHTCertUrl: input.whtCertUrl || existing.WHTCertUrl || "",
          PaymentRecordedAt: now,
          UpdatedAt: now,
        },
      );

      await prisma.auditLog.create({
        data: {
          orgId: ctx.org.orgId,
          userId: ctx.session.userId,
          action: "update",
          entityType: "tax_invoice",
          entityRef: input.taxInvoiceId,
          summary: `บันทึกการชำระเงิน ${input.netReceived.toLocaleString()} บาท (${input.paymentMethod}) ใบกำกับภาษี ${existing.DocNumber}`,
        },
      });

      return { success: true, netReceived: input.netReceived };
    }),

  /**
   * Attach uploaded URL (evidence or WHT cert) to a tax invoice.
   * Used by the upload API route after the file is on Drive.
   */
  attachUploadedFile: permissionProcedure("manageTaxInvoices")
    .input(
      z.object({
        taxInvoiceId: z.string(),
        fileType: z.enum(["evidence", "whtCert"]),
        url: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const sheets = await getSheetsService(ctx.org.orgId);
      const existing = await sheets.getTaxInvoiceById(input.taxInvoiceId);
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบใบกำกับภาษี" });
      }
      const updates: Record<string, string> = {
        UpdatedAt: new Date().toISOString(),
      };
      if (input.fileType === "evidence") {
        updates.PaymentEvidenceUrl = input.url;
      } else {
        updates.WHTCertUrl = input.url;
      }
      await sheets.updateById(
        SHEET_TABS.TAX_INVOICES,
        "TaxInvoiceID",
        input.taxInvoiceId,
        updates,
      );
      return { success: true };
    }),
});
