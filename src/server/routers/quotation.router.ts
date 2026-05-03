// ===========================================
// Aim Expense — Quotation Router (S23)
// ใบเสนอราคา CRUD + state transitions
// State machine: draft → sent → accepted | rejected | void  (+ converted in S24)
// ===========================================

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, orgProcedure, permissionProcedure } from "../trpc";
import { getSheetsService } from "../lib/sheets-context";
import {
  GoogleSheetsService,
  SHEET_TABS,
} from "../services/google-sheets.service";
import { computeNextDocNumber } from "../lib/doc-number";
import { prisma } from "@/lib/prisma";

// ===== Schemas =====

const QuotationLineInput = z.object({
  description: z.string().min(1, "กรุณากรอกรายละเอียด").max(500),
  quantity: z.number().min(0.01, "จำนวนต้องมากกว่า 0"),
  unitPrice: z.number().min(0),
  discountPercent: z.number().min(0).max(100).default(0),
  notes: z.string().max(200).optional(),
});

const QuotationStatus = z.enum([
  "draft",
  "sent",
  "accepted",
  "rejected",
  "void",
  "converted",
]);

const QuotationCreateInput = z.object({
  docDate: z.string().min(1), // YYYY-MM-DD
  validUntil: z.string().min(1),
  customerId: z.string().min(1),
  eventId: z.string().optional(),
  projectName: z.string().max(200).optional(),
  vatIncluded: z.boolean(),
  discountAmount: z.number().min(0).default(0),
  notes: z.string().max(1000).optional(),
  terms: z.string().max(1000).optional(),
  lines: z.array(QuotationLineInput).min(1, "ต้องมีอย่างน้อย 1 รายการ"),
});

// ===== Helpers =====

/**
 * Round to 2 decimal places (banker's rounding not needed — half-up acceptable for SME)
 */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Compute totals from line items + VAT mode
 *
 * vatIncluded = false → ราคาเป็น net, บวก VAT 7% ทับ
 *   subtotal = sum(lineTotals) - discountAmount
 *   vatAmount = subtotal × 0.07
 *   grandTotal = subtotal + vatAmount
 *
 * vatIncluded = true → ราคารวม VAT แล้ว, ดึง VAT ออกมาแสดง
 *   grandTotalRaw = sum(lineTotals) - discountAmount  (this is the inclusive total)
 *   vatAmount = grandTotalRaw × 7/107
 *   subtotal = grandTotalRaw - vatAmount
 */
export function computeQuotationTotals(
  lines: { quantity: number; unitPrice: number; discountPercent: number }[],
  vatIncluded: boolean,
  discountAmount: number
): {
  lineTotals: number[];
  subtotal: number;
  vatAmount: number;
  grandTotal: number;
} {
  const lineTotals = lines.map((l) =>
    round2(l.quantity * l.unitPrice * (1 - l.discountPercent / 100))
  );
  const sumLines = lineTotals.reduce((a, b) => a + b, 0);

  if (vatIncluded) {
    const grandTotalRaw = round2(sumLines - discountAmount);
    const vatAmount = round2((grandTotalRaw * 7) / 107);
    const subtotal = round2(grandTotalRaw - vatAmount);
    return { lineTotals, subtotal, vatAmount, grandTotal: grandTotalRaw };
  } else {
    const subtotal = round2(sumLines - discountAmount);
    const vatAmount = round2(subtotal * 0.07);
    const grandTotal = round2(subtotal + vatAmount);
    return { lineTotals, subtotal, vatAmount, grandTotal };
  }
}

// ===== Output shape =====

function shapeHeader(r: Record<string, string>) {
  return {
    quotationId: r.QuotationID,
    docNumber: r.DocNumber,
    docDate: r.DocDate,
    validUntil: r.ValidUntil,
    customerId: r.CustomerID,
    customerNameSnapshot: r.CustomerNameSnapshot,
    customerTaxIdSnapshot: r.CustomerTaxIdSnapshot,
    customerAddressSnapshot: r.CustomerAddressSnapshot,
    status: (r.Status || "draft") as
      | "draft"
      | "sent"
      | "accepted"
      | "rejected"
      | "void"
      | "converted",
    eventId: r.EventID || "",
    projectName: r.ProjectName || "",
    subtotal: parseFloat(r.Subtotal) || 0,
    discountAmount: parseFloat(r.DiscountAmount) || 0,
    vatAmount: parseFloat(r.VATAmount) || 0,
    vatIncluded: r.VATIncluded === "TRUE" || r.VATIncluded === "true",
    grandTotal: parseFloat(r.GrandTotal) || 0,
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
    quotationId: r.QuotationID,
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

export const quotationRouter = router({
  list: orgProcedure
    .input(
      z
        .object({
          status: QuotationStatus.optional(),
          customerId: z.string().optional(),
          from: z.string().optional(),
          to: z.string().optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const sheets = await getSheetsService(ctx.org.orgId);
      await sheets.ensureAllTabsExist();
      const all = await sheets.getQuotations();

      const filtered = all.filter((r) => {
        if (input?.status && r.Status !== input.status) return false;
        if (input?.customerId && r.CustomerID !== input.customerId)
          return false;
        if (input?.from && r.DocDate < input.from) return false;
        if (input?.to && r.DocDate > input.to) return false;
        return true;
      });

      // Sort by docDate desc, fallback by createdAt desc
      filtered.sort((a, b) => {
        const d = (b.DocDate || "").localeCompare(a.DocDate || "");
        if (d !== 0) return d;
        return (b.CreatedAt || "").localeCompare(a.CreatedAt || "");
      });

      return filtered.map(shapeHeader);
    }),

  getById: orgProcedure
    .input(z.object({ quotationId: z.string() }))
    .query(async ({ ctx, input }) => {
      const sheets = await getSheetsService(ctx.org.orgId);
      const header = await sheets.getQuotationById(input.quotationId);
      if (!header) return null;
      const lines = await sheets.getQuotationLines(input.quotationId);
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

  create: permissionProcedure("manageQuotations")
    .input(QuotationCreateInput)
    .mutation(async ({ ctx, input }) => {
      const sheets = await getSheetsService(ctx.org.orgId);
      await sheets.ensureAllTabsExist();

      // 1. Snapshot customer
      const customer = await sheets.getCustomerById(input.customerId);
      if (!customer) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "ไม่พบลูกค้า",
        });
      }

      const quotationId = GoogleSheetsService.generateId("QT");
      const year = new Date(input.docDate).getFullYear() || new Date().getFullYear();
      const docNumber = await computeNextDocNumber(
        sheets,
        "QT",
        year,
        SHEET_TABS.QUOTATIONS
      );

      const totals = computeQuotationTotals(
        input.lines,
        input.vatIncluded,
        input.discountAmount
      );

      const now = new Date().toISOString();

      // 2. Header write — wrap whole flow in try/catch + cleanup
      try {
        await sheets.appendRowByHeaders(SHEET_TABS.QUOTATIONS, {
          QuotationID: quotationId,
          DocNumber: docNumber,
          DocDate: input.docDate,
          ValidUntil: input.validUntil,
          CustomerID: customer.CustomerID,
          CustomerNameSnapshot: customer.CustomerName || "",
          CustomerTaxIdSnapshot: customer.TaxID || "",
          CustomerAddressSnapshot: customer.Address || "",
          Status: "draft",
          EventID: input.eventId || "",
          ProjectName: input.projectName || "",
          Subtotal: totals.subtotal,
          DiscountAmount: input.discountAmount,
          VATAmount: totals.vatAmount,
          VATIncluded: input.vatIncluded ? "TRUE" : "FALSE",
          GrandTotal: totals.grandTotal,
          Notes: input.notes || "",
          Terms: input.terms || "",
          PreparedBy: ctx.session.displayName || "",
          PreparedByUserId: ctx.session.userId,
          CreatedAt: now,
          UpdatedAt: now,
          PdfUrl: "",
        });

        // 3. Lines
        for (let i = 0; i < input.lines.length; i++) {
          const l = input.lines[i];
          await sheets.appendRowByHeaders(SHEET_TABS.QUOTATION_LINES, {
            LineID: GoogleSheetsService.generateId("QTL"),
            QuotationID: quotationId,
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
        // Cleanup: try to delete header to avoid orphan
        try {
          await sheets.deleteById(
            SHEET_TABS.QUOTATIONS,
            "QuotationID",
            quotationId
          );
          // Best-effort delete of any lines that were written
          const orphanLines = await sheets.getQuotationLines(quotationId);
          for (const ol of orphanLines) {
            await sheets.deleteById(
              SHEET_TABS.QUOTATION_LINES,
              "LineID",
              ol.LineID
            );
          }
        } catch {
          /* ignore cleanup errors */
        }
        throw e;
      }

      // 4. Audit
      await prisma.auditLog.create({
        data: {
          orgId: ctx.org.orgId,
          userId: ctx.session.userId,
          action: "create",
          entityType: "quotation",
          entityRef: quotationId,
          summary: `สร้างใบเสนอราคา ${docNumber}`,
        },
      });

      return { success: true, quotationId, docNumber };
    }),

  /**
   * Update — only allowed when Status === "draft"
   * Replace strategy: header update + delete-and-reinsert lines (simpler than diff)
   */
  update: permissionProcedure("manageQuotations")
    .input(
      z.object({ quotationId: z.string() }).merge(QuotationCreateInput)
    )
    .mutation(async ({ ctx, input }) => {
      const sheets = await getSheetsService(ctx.org.orgId);
      const existing = await sheets.getQuotationById(input.quotationId);
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบใบเสนอราคา" });
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

      const totals = computeQuotationTotals(
        input.lines,
        input.vatIncluded,
        input.discountAmount
      );

      // Update header
      await sheets.updateById(
        SHEET_TABS.QUOTATIONS,
        "QuotationID",
        input.quotationId,
        {
          DocDate: input.docDate,
          ValidUntil: input.validUntil,
          CustomerID: customer.CustomerID,
          CustomerNameSnapshot: customer.CustomerName || "",
          CustomerTaxIdSnapshot: customer.TaxID || "",
          CustomerAddressSnapshot: customer.Address || "",
          EventID: input.eventId || "",
          ProjectName: input.projectName || "",
          Subtotal: totals.subtotal,
          DiscountAmount: input.discountAmount,
          VATAmount: totals.vatAmount,
          VATIncluded: input.vatIncluded ? "TRUE" : "FALSE",
          GrandTotal: totals.grandTotal,
          Notes: input.notes || "",
          Terms: input.terms || "",
          UpdatedAt: new Date().toISOString(),
        }
      );

      // Delete existing lines + reinsert
      const oldLines = await sheets.getQuotationLines(input.quotationId);
      for (const ol of oldLines) {
        await sheets.deleteById(
          SHEET_TABS.QUOTATION_LINES,
          "LineID",
          ol.LineID
        );
      }
      for (let i = 0; i < input.lines.length; i++) {
        const l = input.lines[i];
        await sheets.appendRowByHeaders(SHEET_TABS.QUOTATION_LINES, {
          LineID: GoogleSheetsService.generateId("QTL"),
          QuotationID: input.quotationId,
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
          entityType: "quotation",
          entityRef: input.quotationId,
          summary: `แก้ไขใบเสนอราคา ${existing.DocNumber}`,
        },
      });

      return { success: true };
    }),

  // ===== State transitions =====

  send: permissionProcedure("manageQuotations")
    .input(z.object({ quotationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return transitionStatus(ctx, input.quotationId, "draft", "sent", "ส่ง");
    }),

  accept: permissionProcedure("manageQuotations")
    .input(z.object({ quotationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return transitionStatus(
        ctx,
        input.quotationId,
        "sent",
        "accepted",
        "ลูกค้ายืนยัน"
      );
    }),

  reject: permissionProcedure("manageQuotations")
    .input(z.object({ quotationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return transitionStatus(
        ctx,
        input.quotationId,
        "sent",
        "rejected",
        "ลูกค้าปฏิเสธ"
      );
    }),

  void: permissionProcedure("manageQuotations")
    .input(z.object({ quotationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const sheets = await getSheetsService(ctx.org.orgId);
      const existing = await sheets.getQuotationById(input.quotationId);
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "ไม่พบใบเสนอราคา",
        });
      }
      if (existing.Status === "void" || existing.Status === "converted") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `ยกเลิกไม่ได้ — สถานะปัจจุบัน: ${existing.Status}`,
        });
      }
      await sheets.updateById(
        SHEET_TABS.QUOTATIONS,
        "QuotationID",
        input.quotationId,
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
          entityType: "quotation",
          entityRef: input.quotationId,
          summary: `ยกเลิกใบเสนอราคา ${existing.DocNumber}`,
        },
      });
      return { success: true };
    }),
});

// ===== Helper: state transition =====

async function transitionStatus(
  ctx: { org: { orgId: string }; session: { userId: string } },
  quotationId: string,
  expected: string,
  next: string,
  actionLabel: string
) {
  const sheets = await getSheetsService(ctx.org.orgId);
  const existing = await sheets.getQuotationById(quotationId);
  if (!existing) {
    throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบใบเสนอราคา" });
  }
  if (existing.Status !== expected) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `${actionLabel}ไม่ได้ — สถานะปัจจุบัน: ${existing.Status}`,
    });
  }
  await sheets.updateById(SHEET_TABS.QUOTATIONS, "QuotationID", quotationId, {
    Status: next,
    UpdatedAt: new Date().toISOString(),
  });
  await prisma.auditLog.create({
    data: {
      orgId: ctx.org.orgId,
      userId: ctx.session.userId,
      action: "update",
      entityType: "quotation",
      entityRef: quotationId,
      summary: `${actionLabel}ใบเสนอราคา ${existing.DocNumber} (${expected} → ${next})`,
    },
  });
  return { success: true };
}
