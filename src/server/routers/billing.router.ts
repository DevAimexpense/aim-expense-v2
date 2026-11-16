// ===========================================
// Aim Expense — Billing Router (S24)
// ใบวางบิล CRUD + state transitions + recordPayment
// State: draft → sent → partial → paid | void  (overdue = derived)
// ===========================================

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, featureProcedure, createCallerFactory, type TRPCContext } from "../trpc";
import { taxInvoiceRouter } from "./taxInvoice.router";
import {
  receiptVoidPlan,
  receiptEditBlockReason,
  nextReceiptTaxDocMode,
  billingEditBlockReason,
  settledAmountAfterEdit,
} from "../lib/receipt-output-vat";
import { withReplacementNote, receiptReplacementNote } from "../lib/ti-replacement";
import { filedVatPeriodWarning } from "../lib/vat-period";
import { branchCode, combinedReceiptBuyerBranchError } from "@/lib/branch-label";
import { assertPeriodOpen } from "../lib/period-lock";
import { activeNotesFor } from "./creditNote.router";
import { getSheetsService, ensureTabsCached } from "../lib/sheets-context";
import {
  GoogleSheetsService,
  SHEET_TABS,
} from "../services/google-sheets.service";
import { computeNextDocNumber, withDocNumberLock, docPeriod } from "../lib/doc-number";
import { withLock } from "../lib/lock";
import { invalidateTab } from "../lib/cache";
import { assertVatAllowed } from "../lib/org-vat";
import { isDocInScope } from "../lib/doc-scope";
import { todayBangkok } from "@/lib/utils/date";
import { resolveIssuerBranch } from "../lib/issuer-branch";
import { prisma } from "@/lib/prisma";
import { safeAuditLog } from "@/server/lib/audit";
import { hasSpecialFeature, readReceiptMode } from "@/lib/org-settings";

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
  branchId: z.string().optional(), // issuing branch — omit = HQ
  sourceQuotationId: z.string().optional(),
  eventId: z.string().optional(),
  projectName: z.string().max(200).optional(),
  vatIncluded: z.boolean(),
  // false = ไม่มี VAT เลย (ธุรกิจไม่จดทะเบียน VAT) — default true เพื่อไม่กระทบ flow เดิม
  isVat: z.boolean().default(true),
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
  whtPercent: number,
  isVat: boolean = true
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

  if (!isVat) {
    // ไม่มี VAT (ธุรกิจไม่จด VAT) → ไม่มีบรรทัด VAT, GrandTotal = Subtotal
    subtotal = round2(sumLines - discountAmount);
    vatAmount = 0;
    grandTotal = subtotal;
  } else if (vatIncluded) {
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
    // legacy rows (คอลัมน์ว่าง) = มี VAT
    isVat: r.IsVAT !== "FALSE",
    whtPercent: parseFloat(r.WHTPercent) || 0,
    whtAmount: parseFloat(r.WHTAmount) || 0,
    grandTotal,
    amountReceivable: parseFloat(r.AmountReceivable) || 0,
    paidAmount,
    balance: round2(grandTotal - paidAmount),
    paidDate: r.PaidDate || "",
    paymentMethod: r.PaymentMethod || "",
    bankAccountId: r.BankAccountID || "",
    paymentNote: r.PaymentNote || "",
    notes: r.Notes || "",
    terms: r.Terms || "",
    preparedBy: r.PreparedBy || "",
    preparedByUserId: r.PreparedByUserId || "",
    createdAt: r.CreatedAt || "",
    updatedAt: r.UpdatedAt || "",
    pdfUrl: r.PdfUrl || "",
    pdfFor: r.PdfFor || "",
    receiptPdfUrl: r.ReceiptPdfUrl || "",
    receiptPdfFor: r.ReceiptPdfFor || "",
    whtCertUrl: r.WHTCertUrl || "",
    paymentEvidenceUrl: r.PaymentEvidenceUrl || "",
    // ใบเสร็จรับเงิน (ออกเมื่อรับเงินครบ)
    receiptNumber: r.ReceiptNumber || "",
    receiptDate: r.ReceiptDate || "",
    // "receipt" = ใบเสร็จที่ออกโดยตรง ไม่มีใบวางบิล
    docKind: (r.DocKind === "receipt" ? "receipt" : "billing") as
      | "billing"
      | "receipt",
    // SALE-01: วิธีออกเอกสารภาษีที่ snapshot ไว้บนใบเสร็จออกตรง ("" = ไม่มี VAT / ใบเก่า)
    taxDocMode: (r.TaxDocMode === "combined" || r.TaxDocMode === "separate" ? r.TaxDocMode : "") as
      | ""
      | "combined"
      | "separate",
    voidReason: r.VoidReason || "",
  };
}

/** ลบใบกำกับภาษีคู่ที่ยังเป็นร่าง (ยังไม่มีเลข = ไม่มีผลทางภาษี) — ใช้ตอนแก้/ยกเลิกใบเสร็จ (SALE-14/15) */
async function deleteDraftPairedTaxInvoices(
  sheets: GoogleSheetsService,
  drafts: Record<string, string>[],
  audit: { orgId: string; userId: string; receiptNo: string; because: string },
): Promise<void> {
  for (const ti of drafts) {
    if (ti.Status !== "draft") continue;
    await sheets.deleteById(SHEET_TABS.TAX_INVOICES, "TaxInvoiceID", ti.TaxInvoiceID);
    await sheets.deleteRowsWhere(SHEET_TABS.TAX_INVOICE_LINES, "TaxInvoiceID", ti.TaxInvoiceID);
    // SALE-18: ร่างไม่มีเลข/ไม่มีผลภาษี แต่ต้องมี trail เหมือนลบผ่าน taxInvoice.delete
    await safeAuditLog({
      data: {
        orgId: audit.orgId,
        userId: audit.userId,
        action: "delete",
        entityType: "tax_invoice",
        entityRef: ti.TaxInvoiceID,
        summary: `ลบใบกำกับภาษี draft (คู่กับใบเสร็จ ${audit.receiptNo}) — ${audit.because}`,
      },
    });
  }
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

/**
 * แก้วันที่เอกสารข้ามเดือนหลังมีเลขแล้ว → เลขยังเป็นของเดือนเดิม (ไม่ renumber เพราะเลขอาจถูก
 * ส่งให้ลูกค้าแล้ว) — คืนข้อความเตือนให้ UI แสดง; undefined = ไม่ต้องเตือน (DOC-07)
 */
function monthMoveWarning(
  oldDate: string | undefined,
  newDate: string,
  docNumber: string | undefined
): string | undefined {
  if (!docNumber || !oldDate) return undefined;
  const a = docPeriod(oldDate);
  const b = docPeriod(newDate);
  if (a.yyyy === b.yyyy && a.mm === b.mm) return undefined;
  return `วันที่เอกสารถูกย้ายไปเดือนอื่น แต่เลขที่ ${docNumber} ยังเป็นเลขรันของเดือนเดิม (${a.mm}/${a.yyyy})`;
}

// ===== Router =====

/**
 * SALE-01: ออกใบกำกับภาษีคู่กับใบเสร็จรับเงินที่ออกตรง (โหมด "ออกแยก")
 * ใช้ procedure ของ taxInvoice (convertFromBilling → issue) ผ่าน caller — สิทธิ์/แพ็กเกจ/เลขรัน/lock
 * ชุดเดียวกับการกดออกเองจากหน้าเอกสาร · ไม่ throw (ใบเสร็จออกไปแล้ว)
 */
async function issuePairedTaxInvoice(
  ctx: TRPCContext,
  billingId: string,
  docDate: string,
  customer: Record<string, string>,
): Promise<{ taxInvoiceId?: string; docNumber?: string; warning?: string }> {
  const followUp = "ใบเสร็จนี้ยังนับในรายงานภาษีขายตามปกติ — ออกใบกำกับภาษีได้ที่เมนูใบกำกับภาษี";
  if (!customer.TaxID || !customer.BranchType) {
    return {
      warning: `ยังไม่ได้ออกใบกำกับภาษีคู่ — ลูกค้าไม่มีเลขประจำตัวผู้เสียภาษี/ข้อมูลสาขา\n${followUp}`,
    };
  }
  let taxInvoiceId: string | undefined;
  try {
    const caller = createCallerFactory(taxInvoiceRouter)(ctx);
    const created = await caller.convertFromBilling({ billingId, docDate });
    taxInvoiceId = created.taxInvoiceId;
    const issued = await caller.issue({ taxInvoiceId });
    // CTRL-13: เตือนงวด ภ.พ.30 ที่เลยกำหนดยื่น (ออกแทน/ย้อนหลัง)
    return { taxInvoiceId, docNumber: issued.docNumber, warning: issued.warning };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[billing.createReceipt] paired tax invoice", billingId, msg);
    return {
      taxInvoiceId,
      warning: `ยังออกใบกำกับภาษีคู่ไม่สำเร็จ: ${msg}\n${followUp}`,
    };
  }
}

export const billingRouter = router({
  list: featureProcedure("revenueModule")
    .input(
      z
        .object({
          status: BillingStatus.optional(),
          customerId: z.string().optional(),
          from: z.string().optional(),
          to: z.string().optional(),
          // "billing" = เฉพาะใบวางบิล (ไม่รวมใบเสร็จที่ออกโดยตรง) · ไม่ส่ง = ทั้งหมด
          kind: z.enum(["billing", "receipt"]).optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const sheets = await getSheetsService(ctx.org.orgId);
      await ensureTabsCached(sheets, ctx.org.orgId);
      const all = await sheets.getBillings();
      // project_manager เห็นเฉพาะเอกสารของโปรเจกต์ในขอบเขตตัวเอง หรือที่ตัวเองสร้าง (CO-07/CO-07b)

      const filtered = all.filter((r) => {
        if (!isDocInScope(ctx.org, ctx.session.userId, r.EventID, r.PreparedByUserId)) return false;
        if (input?.kind) {
          const k = r.DocKind === "receipt" ? "receipt" : "billing";
          if (k !== input.kind) return false;
        }
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

  getById: featureProcedure("revenueModule")
    .input(z.object({ billingId: z.string() }))
    .query(async ({ ctx, input }) => {
      const sheets = await getSheetsService(ctx.org.orgId);
      // batchGet — fetch header tab + lines tab in 1 HTTP call
      const batch = await sheets.getAllBatch([
        SHEET_TABS.BILLINGS,
        SHEET_TABS.BILLING_LINES,
      ]);
      const header = (batch[SHEET_TABS.BILLINGS] || []).find(
        (r) => r.BillingID === input.billingId
      );
      if (!header) return null;
      // project_manager: นอกขอบเขตและไม่ใช่ของตัวเอง = ไม่พบ (CO-07/CO-07b)
      if (!isDocInScope(ctx.org, ctx.session.userId, header.EventID, header.PreparedByUserId)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบใบวางบิล" });
      }
      const lines = (batch[SHEET_TABS.BILLING_LINES] || [])
        .filter((r) => r.BillingID === input.billingId)
        .sort(
          (a, b) =>
            (parseInt(a.LineNumber, 10) || 0) -
            (parseInt(b.LineNumber, 10) || 0)
        );
      return {
        header: shapeHeader(header),
        lines: lines.map(shapeLine),
      };
    }),

  create: featureProcedure("revenueModule", "manageBillings")
    .input(BillingCreateInput)
    .mutation(async ({ ctx, input }) => {
      // org ไม่จด VAT ออกเอกสารมี VAT ไม่ได้ — บังคับฝั่ง server (DOC-06)
      await assertVatAllowed(ctx.org.orgId, input.isVat, "ใบวางบิล");
      await assertPeriodOpen(ctx.org.orgId, input.docDate, "สร้างใบวางบิล"); // CTRL-01
      const sheets = await getSheetsService(ctx.org.orgId);
      await ensureTabsCached(sheets, ctx.org.orgId);

      const customer = await sheets.getCustomerById(input.customerId);
      if (!customer) {
        throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบลูกค้า" });
      }

      const billingId = GoogleSheetsService.generateId("BIL");
      let docNumber = "";

      const totals = computeBillingTotals(
        input.lines,
        input.vatIncluded,
        input.discountAmount,
        input.whtPercent,
        input.isVat
      );

      const issuer = await resolveIssuerBranch(ctx.org.orgId, input.branchId);

      const now = new Date().toISOString();

      try {
        // เลขเอกสาร: อ่าน max สด + append header ภายใน lock ต่อ org/ประเภท/เดือน (DOC-03 / CO-04)
        docNumber = await withDocNumberLock(ctx.org.orgId, "BIL", input.docDate, async () => {
          const no = await computeNextDocNumber(
            sheets,
            "BIL",
            input.docDate,
            SHEET_TABS.BILLINGS,
            undefined,
            "DocNumber",
            { spreadsheetId: ctx.org.googleSpreadsheetId }
          );
          await sheets.appendRowByHeaders(SHEET_TABS.BILLINGS, {
            BillingID: billingId,
            DocNumber: no,
            DocDate: input.docDate,
            DueDate: input.dueDate,
            CustomerID: customer.CustomerID,
            CustomerNameSnapshot: customer.CustomerName || "",
            CustomerTaxIdSnapshot: customer.TaxID || "",
            CustomerAddressSnapshot:
              customer.BillingAddress || customer.Address || "",
            IssuerBranchSnapshot: issuer.branchLabel,
            IssuerAddressSnapshot: issuer.address,
            SourceQuotationID: input.sourceQuotationId || "",
            EventID: input.eventId || "",
            ProjectName: input.projectName || "",
            Status: "draft",
            Subtotal: totals.subtotal,
            DiscountAmount: input.discountAmount,
            VATAmount: totals.vatAmount,
            VATIncluded: input.vatIncluded ? "TRUE" : "FALSE",
            IsVAT: input.isVat ? "TRUE" : "FALSE",
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
          return no;
        });

        await sheets.appendRowsByHeaders(
          SHEET_TABS.BILLING_LINES,
          input.lines.map((l, i) => ({
            LineID: GoogleSheetsService.generateId("BILL"),
            BillingID: billingId,
            LineNumber: i + 1,
            Description: l.description,
            Quantity: l.quantity,
            UnitPrice: l.unitPrice,
            DiscountPercent: l.discountPercent,
            LineTotal: totals.lineTotals[i],
            Notes: l.notes || "",
          }))
        );
      } catch (e) {
        // Cleanup orphan
        try {
          await sheets.deleteById(SHEET_TABS.BILLINGS, "BillingID", billingId);
          await sheets.deleteRowsWhere(
            SHEET_TABS.BILLING_LINES,
            "BillingID",
            billingId
          );
        } catch {
          /* ignore */
        }
        throw e;
      }

      await safeAuditLog({
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

  /**
   * Quick income entry (บันทึกรายรับ) — lightweight path for individuals
   * (บุคคลธรรมดา) who just want to log money received + the WHT cert (50ทวิ)
   * the payer issued, without building a full invoice. Reuses the Billings tab:
   * - no formal Customer record (free-text payer name snapshot)
   * - single synthetic line, no VAT (individuals aren't VAT-registered)
   * - recorded as already-paid (income received), net of WHT
   * WHTCertUrl is attached afterwards via /api/billings/upload.
   */
  quickIncome: featureProcedure("revenueModule", "manageBillings")
    .input(
      z.object({
        payerName: z.string().trim().min(1, "กรุณากรอกชื่อผู้จ่าย").max(200),
        payerTaxId: z.string().trim().max(20).optional(),
        // รายรับฝั่งบุคคลต้องผูกโปรเจกต์ (ก้อนเงินที่จะเบิกใช้ทีหลัง)
        eventId: z.string().trim().min(1, "กรุณาเลือกโปรเจกต์"),
        eventName: z.string().trim().max(200).optional(),
        docDate: z.string().min(1),
        amount: z.number().min(0.01, "จำนวนเงินต้องมากกว่า 0"),
        whtPercent: z.number().min(0).max(15).default(0),
        // เงินเดือน (40(1)) หักแบบขั้นบันได → ผู้ใช้กรอกยอดภาษีหักเป็นบาทตรงๆ
        // ได้ ถ้าส่งมาจะใช้ค่านี้แทนการคำนวณจาก whtPercent
        whtAmount: z.number().min(0).optional(),
        // ประเภทเงินได้: salary | service | rent | transport | other
        incomeType: z.string().trim().max(40).optional(),
        notes: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertPeriodOpen(ctx.org.orgId, input.docDate, "บันทึกรายรับ"); // CTRL-01
      const sheets = await getSheetsService(ctx.org.orgId);
      await ensureTabsCached(sheets, ctx.org.orgId);

      const billingId = GoogleSheetsService.generateId("BIL");
      let docNumber = "";

      // Personal income is not VAT-registered → no VAT. Compute totals locally
      // instead of computeBillingTotals (which always adds 7% VAT). WHT can be
      // given as a baht amount (salary, stepped withholding) or derived from %.
      const lineDescription = input.notes?.trim() || "รายรับ";
      const subtotal = round2(input.amount);
      const lineTotal = subtotal;
      const vatAmount = 0;
      const grandTotal = subtotal;
      const whtAmount =
        input.whtAmount !== undefined
          ? round2(input.whtAmount)
          : round2((subtotal * input.whtPercent) / 100);
      const amountReceivable = round2(grandTotal - whtAmount);
      const issuer = await resolveIssuerBranch(ctx.org.orgId, undefined);
      const now = new Date().toISOString();

      try {
        // เลขเอกสาร: อ่าน max สด + append header ภายใน lock ต่อ org/ประเภท/เดือน (DOC-03 / CO-04)
        docNumber = await withDocNumberLock(ctx.org.orgId, "BIL", input.docDate, async () => {
          const no = await computeNextDocNumber(
            sheets,
            "BIL",
            input.docDate,
            SHEET_TABS.BILLINGS,
            undefined,
            "DocNumber",
            { spreadsheetId: ctx.org.googleSpreadsheetId }
          );
          await sheets.appendRowByHeaders(SHEET_TABS.BILLINGS, {
            BillingID: billingId,
            DocNumber: no,
            DocDate: input.docDate,
            DueDate: input.docDate,
            CustomerID: "",
            CustomerNameSnapshot: input.payerName,
            CustomerTaxIdSnapshot: input.payerTaxId || "",
            CustomerAddressSnapshot: "",
            IssuerBranchSnapshot: issuer.branchLabel,
            IssuerAddressSnapshot: issuer.address,
            SourceQuotationID: "",
            EventID: input.eventId,
            ProjectName: input.eventName || "",
            Status: "paid",
            Subtotal: subtotal,
            DiscountAmount: 0,
            VATAmount: vatAmount,
            VATIncluded: "FALSE",
            IsVAT: "FALSE",
            WHTPercent: input.whtPercent,
            WHTAmount: whtAmount,
            GrandTotal: grandTotal,
            AmountReceivable: amountReceivable,
            PaidAmount: amountReceivable,
            PaidDate: input.docDate,
            PaymentMethod: "",
            BankAccountID: "",
            Notes: input.notes || "",
            Terms: "",
            PreparedBy: ctx.session.displayName || "",
            PreparedByUserId: ctx.session.userId,
            CreatedAt: now,
            UpdatedAt: now,
            PdfUrl: "",
            WHTCertUrl: "",
            IncomeType: input.incomeType || "",
          });
          return no;
        });

        await sheets.appendRowByHeaders(SHEET_TABS.BILLING_LINES, {
          LineID: GoogleSheetsService.generateId("BILL"),
          BillingID: billingId,
          LineNumber: 1,
          Description: lineDescription,
          Quantity: 1,
          UnitPrice: input.amount,
          DiscountPercent: 0,
          LineTotal: lineTotal,
          Notes: "",
        });
      } catch (e) {
        try {
          await sheets.deleteById(SHEET_TABS.BILLINGS, "BillingID", billingId);
          await sheets.deleteRowsWhere(
            SHEET_TABS.BILLING_LINES,
            "BillingID",
            billingId
          );
        } catch {
          /* ignore */
        }
        throw e;
      }

      await safeAuditLog({
        data: {
          orgId: ctx.org.orgId,
          userId: ctx.session.userId,
          action: "create",
          entityType: "billing",
          entityRef: billingId,
          summary: `บันทึกรายรับ ${docNumber} จาก ${input.payerName}`,
        },
      });

      return { success: true, billingId, docNumber };
    }),

  update: featureProcedure("revenueModule", "manageBillings")
    .input(z.object({ billingId: z.string() }).merge(BillingCreateInput))
    .mutation(async ({ ctx, input }) => {
      await assertVatAllowed(ctx.org.orgId, input.isVat, "ใบวางบิล"); // DOC-06
      const sheets = await getSheetsService(ctx.org.orgId);
      await ensureTabsCached(sheets, ctx.org.orgId); // IsVAT column on older sheets
      const existing = await sheets.getBillingById(input.billingId);
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบใบวางบิล" });
      }
      await assertPeriodOpen(ctx.org.orgId, [existing.DocDate, input.docDate], "แก้ไขใบวางบิล"); // CTRL-01
      // แก้ไขได้ทุกสถานะยกเว้นยกเลิก (เดิมแก้ได้เฉพาะ draft)
      // SALE-19: แต่ห้ามเมื่อออกใบเสร็จ (ใบเสร็จอ่านจากแถวนี้ — แก้แล้วใบที่ลูกค้าถือเปลี่ยน เลขเดิม)
      // หรือมีใบกำกับภาษีที่ออกเลขแล้ว (ยอดใบวางบิล ≠ ใบกำกับ) — ต้องยกเลิกเอกสารนั้นก่อน
      if (ctx.org.googleSpreadsheetId) await invalidateTab(ctx.org.googleSpreadsheetId, SHEET_TABS.TAX_INVOICES);
      const editBlocked = billingEditBlockReason(existing, await sheets.getAll(SHEET_TABS.TAX_INVOICES));
      if (editBlocked) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: editBlocked });
      }

      const customer = await sheets.getCustomerById(input.customerId);
      if (!customer) {
        throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบลูกค้า" });
      }

      const totals = computeBillingTotals(
        input.lines,
        input.vatIncluded,
        input.discountAmount,
        input.whtPercent,
        input.isVat
      );

      // ยอดรับเงินหลังแก้ไข:
      //   รับครบแล้ว (paid)  → ยังถือว่ารับครบ: ยอดรับ = ยอดรวมใหม่
      //   รับบางส่วน (partial) → คงยอดที่บันทึกรับไว้ แล้วคิดสถานะใหม่จากยอดรวมใหม่
      const paidBefore = parseFloat(existing.PaidAmount) || 0;
      const paymentPatch: Record<string, string | number> = {};
      if (existing.Status === "paid") {
        // SALE-19: ยอดรับใหม่คิดฐานเดียวกับที่บันทึกไว้ (รายรับบุคคลหักภาษี = ยอดรับจริงหลังหัก)
        // + จดประวัติในบันทึกการรับเงิน (ยอดที่รับไว้เดิมต้องตรวจย้อนได้)
        const newPaid = settledAmountAfterEdit(existing, totals);
        paymentPatch.PaidAmount = newPaid;
        if (Math.abs(newPaid - paidBefore) >= 0.005) {
          paymentPatch.PaymentNote = [
            existing.PaymentNote,
            `แก้ยอดใบวางบิลหลังรับเงินครบ: ยอดรับ ${paidBefore.toLocaleString("th-TH", { minimumFractionDigits: 2 })} → ${newPaid.toLocaleString("th-TH", { minimumFractionDigits: 2 })} (${todayBangkok()} โดย ${ctx.session.displayName || "-"})`,
          ]
            .filter(Boolean)
            .join("\n");
        }
      } else if (existing.Status === "partial") {
        if (paidBefore > totals.grandTotal) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `ยอดรวมใหม่ (${totals.grandTotal}) น้อยกว่ายอดที่รับเงินไว้แล้ว (${paidBefore})`,
          });
        }
        paymentPatch.Status =
          paidBefore >= totals.grandTotal ? "paid" : "partial";
      }

      await sheets.updateById(
        SHEET_TABS.BILLINGS,
        "BillingID",
        input.billingId,
        {
          ...paymentPatch,
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
          IsVAT: input.isVat ? "TRUE" : "FALSE",
          WHTPercent: input.whtPercent,
          WHTAmount: totals.whtAmount,
          GrandTotal: totals.grandTotal,
          AmountReceivable: totals.amountReceivable,
          Notes: input.notes || "",
          Terms: input.terms || "",
          UpdatedAt: new Date().toISOString(),
        }
      );

      await sheets.deleteRowsWhere(
            SHEET_TABS.BILLING_LINES,
            "BillingID",
            input.billingId
          );
      await sheets.appendRowsByHeaders(
          SHEET_TABS.BILLING_LINES,
          input.lines.map((l, i) => ({
          LineID: GoogleSheetsService.generateId("BILL"),
          BillingID: input.billingId,
          LineNumber: i + 1,
          Description: l.description,
          Quantity: l.quantity,
          UnitPrice: l.unitPrice,
          DiscountPercent: l.discountPercent,
          LineTotal: totals.lineTotals[i],
          Notes: l.notes || "",
        }))
        );

      await safeAuditLog({
        data: {
          orgId: ctx.org.orgId,
          userId: ctx.session.userId,
          action: "update",
          entityType: "billing",
          entityRef: input.billingId,
          summary: `แก้ไขใบวางบิล ${existing.DocNumber}`,
        },
      });

      // ย้าย DocDate ข้ามเดือนหลังมีเลขแล้ว: คงเลขเดิม แต่เตือนผู้ใช้ (DOC-07)
      return { success: true, warning: monthMoveWarning(existing.DocDate, input.docDate, existing.DocNumber) };
    }),

  // ===== State transitions =====

  send: featureProcedure("revenueModule", "manageBillings")
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
      await safeAuditLog({
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

  void: featureProcedure("revenueModule", "manageBillings")
    .input(z.object({ billingId: z.string(), reason: z.string().trim().max(500).optional() }))
    .mutation(async ({ ctx, input }) => {
      const sheets = await getSheetsService(ctx.org.orgId);
      await ensureTabsCached(sheets, ctx.org.orgId); // คอลัมน์ VoidReason
      const existing = await sheets.getBillingById(input.billingId);
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบใบวางบิล" });
      }
      await assertPeriodOpen(ctx.org.orgId, existing.DocDate, "ยกเลิกใบวางบิล"); // CTRL-01
      if (existing.Status === "void" || existing.Status === "paid") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `ยกเลิกไม่ได้ — สถานะปัจจุบัน: ${existing.Status}`,
        });
      }
      // RPT-08: รับเงินบางส่วนแล้ว → ต้องมีเหตุผล + จดยอดที่รับไว้ (รายได้หายจากรายงาน แต่เงินที่รับต้องตามได้
      // ว่าคืนลูกค้า/โอนไปใบอื่น) · ยังไม่มีระบบคืนเงิน/ใบลดหนี้ จึงไม่บล็อก
      const paidBefore = parseFloat(existing.PaidAmount) || 0;
      const reason = (input.reason || "").trim();
      if (existing.Status === "partial" && reason.length < 3) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `ใบวางบิลนี้รับเงินแล้ว ${paidBefore.toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท — กรุณาระบุเหตุผลและการจัดการเงินที่รับไว้ (คืนลูกค้า/โอนไปใบอื่น)`,
        });
      }
      await sheets.updateById(
        SHEET_TABS.BILLINGS,
        "BillingID",
        input.billingId,
        {
          Status: "void",
          ...(reason ? { VoidReason: reason } : {}),
          ...(paidBefore > 0
            ? {
                PaymentNote: [
                  existing.PaymentNote,
                  `ยกเลิกใบวางบิลหลังรับเงิน ${paidBefore.toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท: ${reason}`,
                ]
                  .filter(Boolean)
                  .join("\n"),
              }
            : {}),
          UpdatedAt: new Date().toISOString(),
        }
      );
      await safeAuditLog({
        data: {
          orgId: ctx.org.orgId,
          userId: ctx.session.userId,
          action: "update",
          entityType: "billing",
          entityRef: input.billingId,
          summary: `ยกเลิกใบวางบิล ${existing.DocNumber}${paidBefore > 0 ? ` (รับเงินแล้ว ${paidBefore})` : ""}${reason ? `: ${reason}` : ""}`,
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
  /**
   * สร้างใบเสร็จรับเงินโดยตรง — ไม่ต้องมีใบวางบิล (ขายแล้วรับเงินเลย)
   * เก็บใน Billings tab เดียวกัน (รายรับ/รายงานนับรวมอัตโนมัติ) โดย
   *   DocKind = "receipt", DocNumber = ReceiptNumber = RC-{ปี}-{0001}
   *   Status = paid, PaidAmount = GrandTotal (นิยามเดียวกับ recordPayment)
   * ใช้เลขรัน RC ชุดเดียวกับใบเสร็จที่ออกจากใบวางบิล
   */
  createReceipt: featureProcedure("revenueModule", "manageBillings")
    .input(
      BillingCreateInput.omit({ dueDate: true, sourceQuotationId: true, terms: true }).extend({
        paymentMethod: PaymentMethod.default("transfer"),
        // SALE-17b: ออกแทนใบเสร็จออกตรงที่ยกเลิกแล้ว → อ้างเลขเดิม + เหตุผลในหมายเหตุ
        replacesBillingId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertVatAllowed(ctx.org.orgId, input.isVat, "ใบเสร็จรับเงิน"); // DOC-06
      await assertPeriodOpen(ctx.org.orgId, input.docDate, "ออกใบเสร็จรับเงิน"); // CTRL-01
      const sheets = await getSheetsService(ctx.org.orgId);
      await ensureTabsCached(sheets, ctx.org.orgId);

      const customer = await sheets.getCustomerById(input.customerId);
      if (!customer) {
        throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบลูกค้า" });
      }

      let replaceNote = "";
      if (input.replacesBillingId) {
        const old = await sheets.getBillingById(input.replacesBillingId);
        if (!old || old.DocKind !== "receipt" || old.Status !== "void") {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "ใบเสร็จที่จะออกแทนต้องเป็นใบเสร็จออกตรงที่ยกเลิกแล้ว",
          });
        }
        const oldPairedTi = (await sheets.getAll(SHEET_TABS.TAX_INVOICES)).find(
          (t) => t.SourceBillingID === old.BillingID && t.Status === "void" && t.DocNumber,
        );
        replaceNote = receiptReplacementNote(old, oldPairedTi?.DocNumber);
      }

      const billingId = GoogleSheetsService.generateId("RC");
      let receiptNumber = "";
      const totals = computeBillingTotals(
        input.lines,
        input.vatIncluded,
        input.discountAmount,
        input.whtPercent,
        input.isVat
      );
      const issuer = await resolveIssuerBranch(ctx.org.orgId, input.branchId);
      const now = new Date().toISOString();
      // SALE-01: ใบเสร็จมี VAT ของธุรกิจจด VAT (assertVatAllowed ผ่านแล้ว) → ออกตามวิธีที่ตั้งค่าองค์กรไว้
      // snapshot ลงเอกสาร — เปลี่ยนตั้งค่าทีหลังไม่ทำให้หัวเอกสารเก่าเปลี่ยน
      const taxDocMode: "" | "combined" | "separate" =
        input.isVat && totals.vatAmount > 0
          ? readReceiptMode(
              (await prisma.organization.findUnique({ where: { id: ctx.org.orgId }, select: { settings: true } }))
                ?.settings,
            )
          : "";
      // SALE-24: ใบเสร็จรับเงิน/ใบกำกับภาษี ให้ผู้ซื้อที่มีเลขผู้เสียภาษี ต้องระบุสาขาผู้ซื้อ
      const missingBranch = combinedReceiptBuyerBranchError(taxDocMode, customer);
      if (missingBranch) throw new TRPCError({ code: "PRECONDITION_FAILED", message: missingBranch });

      try {
        // เลขเอกสาร: อ่าน max สด + append header ภายใน lock ต่อ org/ประเภท/เดือน (DOC-03 / CO-04)
        receiptNumber = await withDocNumberLock(ctx.org.orgId, "RC", input.docDate, async () => {
          const no = await computeNextDocNumber(
            sheets,
            "RC",
            input.docDate,
            SHEET_TABS.BILLINGS,
            undefined,
            "ReceiptNumber",
            { spreadsheetId: ctx.org.googleSpreadsheetId }
          );
          await sheets.appendRowByHeaders(SHEET_TABS.BILLINGS, {
            BillingID: billingId,
            DocNumber: no,
            DocDate: input.docDate,
            DueDate: input.docDate,
            CustomerID: customer.CustomerID,
            CustomerNameSnapshot: customer.CustomerName || "",
            CustomerTaxIdSnapshot: customer.TaxID || "",
            // SALE-09: โหมดรวม = ใบกำกับภาษี → ที่อยู่ตาม ภ.พ.20 ก่อนที่อยู่ส่งบิล
            CustomerAddressSnapshot:
              (taxDocMode === "combined" ? customer.Address || customer.BillingAddress : customer.BillingAddress || customer.Address) || "",
            CustomerBranchSnapshot: branchCode(customer.BranchType, customer.BranchNumber), // SALE-22
            IssuerBranchSnapshot: issuer.branchLabel,
            IssuerAddressSnapshot: issuer.address,
            SourceQuotationID: "",
            EventID: input.eventId || "",
            ProjectName: input.projectName || "",
            Status: "paid",
            Subtotal: totals.subtotal,
            DiscountAmount: input.discountAmount,
            VATAmount: totals.vatAmount,
            VATIncluded: input.vatIncluded ? "TRUE" : "FALSE",
            IsVAT: input.isVat ? "TRUE" : "FALSE",
            WHTPercent: input.whtPercent,
            WHTAmount: totals.whtAmount,
            GrandTotal: totals.grandTotal,
            AmountReceivable: totals.amountReceivable,
            // ชำระครบ = PaidAmount เท่ากับ GrandTotal (ตามนิยาม balance = GrandTotal - PaidAmount)
            PaidAmount: totals.grandTotal,
            PaidDate: input.docDate,
            PaymentMethod: input.paymentMethod,
            BankAccountID: "",
            Notes: withReplacementNote(input.notes || "", replaceNote), // SALE-17b
            Terms: "",
            PreparedBy: ctx.session.displayName || "",
            PreparedByUserId: ctx.session.userId,
            CreatedAt: now,
            UpdatedAt: now,
            PdfUrl: "",
            ReceiptNumber: no,
            ReceiptDate: input.docDate,
            DocKind: "receipt",
            TaxDocMode: taxDocMode,
          });
          return no;
        });

        await sheets.appendRowsByHeaders(
          SHEET_TABS.BILLING_LINES,
          input.lines.map((l, i) => ({
            LineID: GoogleSheetsService.generateId("BILL"),
            BillingID: billingId,
            LineNumber: i + 1,
            Description: l.description,
            Quantity: l.quantity,
            UnitPrice: l.unitPrice,
            DiscountPercent: l.discountPercent,
            LineTotal: totals.lineTotals[i],
            Notes: l.notes || "",
          }))
        );
      } catch (e) {
        // Cleanup orphan
        try {
          await sheets.deleteById(SHEET_TABS.BILLINGS, "BillingID", billingId);
          await sheets.deleteRowsWhere(
            SHEET_TABS.BILLING_LINES,
            "BillingID",
            billingId
          );
        } catch {
          /* ignore */
        }
        throw e;
      }

      await safeAuditLog({
        data: {
          orgId: ctx.org.orgId,
          userId: ctx.session.userId,
          action: "create",
          entityType: "receipt",
          entityRef: billingId,
          summary: `สร้างใบเสร็จรับเงิน ${receiptNumber}${taxDocMode === "combined" ? " (ใบเสร็จรับเงิน/ใบกำกับภาษี)" : ""}`,
        },
      });

      // SALE-01 โหมดแยก: ออกใบกำกับภาษีคู่ลงวันที่เดียวกับใบเสร็จ (จุดความรับผิด ม.78/1) อัตโนมัติ
      // ออกไม่ได้ (ลูกค้าไม่มีเลขผู้เสียภาษี/สาขา, ไม่มีสิทธิ์ออกใบกำกับ ฯลฯ) → ใบเสร็จยังถูกนับในรายงานภาษีขาย
      // (receipt-output-vat.ts) และแจ้งให้ตามออกใบกำกับ — ไม่ล้มการออกใบเสร็จ
      let taxInvoiceId: string | undefined;
      let taxInvoiceNumber: string | undefined;
      let warning: string | undefined;
      if (taxDocMode === "separate") {
        const paired = await issuePairedTaxInvoice(ctx, billingId, input.docDate, customer);
        taxInvoiceId = paired.taxInvoiceId;
        taxInvoiceNumber = paired.docNumber;
        warning = paired.warning;
      } else if (taxDocMode === "combined") {
        // CTRL-13b: ใบเสร็จ/ใบกำกับ ลงวันที่ในงวด ภ.พ.30 ที่เลยกำหนด (เช่นออกใหม่แทนใบเดือนก่อน) → เตือนยื่นเพิ่มเติม
        warning = filedVatPeriodWarning(input.docDate, todayBangkok());
      }

      return { success: true, billingId, receiptNumber, taxInvoiceId, taxInvoiceNumber, warning };
    }),

  /**
   * แก้ไขใบเสร็จรับเงินที่ออกโดยตรง — เลขที่ใบเสร็จคงเดิม
   * (ใบเสร็จที่ออกจากใบวางบิลแก้ที่นี่ไม่ได้ — เนื้อหามาจากใบวางบิล)
   */
  updateReceipt: featureProcedure("revenueModule", "manageBillings")
    .input(
      BillingCreateInput.omit({ dueDate: true, sourceQuotationId: true, terms: true }).extend({
        billingId: z.string(),
        paymentMethod: PaymentMethod.default("transfer"),
      })
    )
    // SALE-16: lock ต่อใบ (key เดียวกับ voidReceipt / issueReceiptTaxInvoice) — 2 คนแก้พร้อมกัน
    // ห้ามได้ใบกำกับคู่ที่สร้างจากยอดของอีกคน
    .mutation(({ ctx, input }) => withLock(`receipt-ti:${ctx.org.orgId}:${input.billingId}`, async () => {
      await assertVatAllowed(ctx.org.orgId, input.isVat, "ใบเสร็จรับเงิน"); // DOC-06
      const sheets = await getSheetsService(ctx.org.orgId);
      await ensureTabsCached(sheets, ctx.org.orgId);
      if (ctx.org.googleSpreadsheetId) await invalidateTab(ctx.org.googleSpreadsheetId, SHEET_TABS.BILLINGS);
      const existing = await sheets.getBillingById(input.billingId);
      if (!existing || existing.DocKind !== "receipt") {
        throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบใบเสร็จรับเงิน" });
      }
      await assertPeriodOpen(ctx.org.orgId, [existing.ReceiptDate || existing.DocDate, input.docDate], "แก้ไขใบเสร็จรับเงิน"); // CTRL-01
      // SALE-13: โหมดรวม (= ใบกำกับภาษี) แก้ไม่ได้ · SALE-01: มีใบกำกับคู่ที่ออกเลขแล้ว → แก้ใบเสร็จฝั่งเดียว
      // จะทำให้ 2 เอกสารไม่ตรงกัน (ภาษีขายนับจากใบกำกับ) — ต้องยกเลิกใบกำกับก่อน แล้วค่อยแก้
      if (ctx.org.googleSpreadsheetId) await invalidateTab(ctx.org.googleSpreadsheetId, SHEET_TABS.TAX_INVOICES);
      const pairedTis = (await sheets.getAll(SHEET_TABS.TAX_INVOICES)).filter(
        (t) => t.SourceBillingID === input.billingId,
      );
      const blocked = receiptEditBlockReason(existing, pairedTis);
      if (blocked) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: blocked });
      }
      const customer = await sheets.getCustomerById(input.customerId);
      if (!customer) {
        throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบลูกค้า" });
      }

      const totals = computeBillingTotals(
        input.lines,
        input.vatIncluded,
        input.discountAmount,
        input.whtPercent,
        input.isVat
      );
      // SALE-14: แก้จากไม่มี VAT → มี VAT ต้องได้โหมดตามตั้งค่าองค์กร (snapshot ครั้งแรกที่เป็นเอกสารภาษี)
      // · แก้เป็นไม่มี VAT → ล้างโหมด · ใบกำกับคู่ที่เป็นร่าง (ยอดเก่า) ลบทิ้ง แล้วออกใหม่จากยอดล่าสุด
      const hasVatNow = input.isVat && totals.vatAmount > 0;
      const hadVatBefore = existing.IsVAT !== "FALSE" && (parseFloat(existing.VATAmount) || 0) > 0;
      const taxDocMode = nextReceiptTaxDocMode(
        existing.TaxDocMode || "",
        hasVatNow,
        hadVatBefore,
        hasVatNow && !hadVatBefore && !existing.TaxDocMode
          ? readReceiptMode(
              (await prisma.organization.findUnique({ where: { id: ctx.org.orgId }, select: { settings: true } }))
                ?.settings,
            )
          : "separate",
      );
      const missingBranch = combinedReceiptBuyerBranchError(taxDocMode, customer); // SALE-24
      if (missingBranch) throw new TRPCError({ code: "PRECONDITION_FAILED", message: missingBranch });
      await deleteDraftPairedTaxInvoices(sheets, pairedTis, {
        orgId: ctx.org.orgId,
        userId: ctx.session.userId,
        receiptNo: existing.ReceiptNumber || existing.DocNumber,
        because: "แก้ใบเสร็จ (ร่างใช้ยอดเก่า)",
      });

      await sheets.updateById(SHEET_TABS.BILLINGS, "BillingID", input.billingId, {
        TaxDocMode: taxDocMode,
        DocDate: input.docDate,
        DueDate: input.docDate,
        CustomerID: customer.CustomerID,
        CustomerNameSnapshot: customer.CustomerName || "",
        CustomerTaxIdSnapshot: customer.TaxID || "",
        // SALE-09: โหมดรวม = ใบกำกับภาษี → ที่อยู่ตาม ภ.พ.20 ก่อนที่อยู่ส่งบิล
        CustomerAddressSnapshot:
          (taxDocMode === "combined" ? customer.Address || customer.BillingAddress : customer.BillingAddress || customer.Address) || "",
        CustomerBranchSnapshot: branchCode(customer.BranchType, customer.BranchNumber), // SALE-22
        EventID: input.eventId || "",
        ProjectName: input.projectName || "",
        Subtotal: totals.subtotal,
        DiscountAmount: input.discountAmount,
        VATAmount: totals.vatAmount,
        VATIncluded: input.vatIncluded ? "TRUE" : "FALSE",
        IsVAT: input.isVat ? "TRUE" : "FALSE",
        WHTPercent: input.whtPercent,
        WHTAmount: totals.whtAmount,
        GrandTotal: totals.grandTotal,
        AmountReceivable: totals.amountReceivable,
        PaidAmount: totals.grandTotal,
        PaidDate: input.docDate,
        PaymentMethod: input.paymentMethod,
        Notes: input.notes || "",
        ReceiptDate: input.docDate,
        UpdatedAt: new Date().toISOString(),
      });

      await sheets.deleteRowsWhere(
            SHEET_TABS.BILLING_LINES,
            "BillingID",
            input.billingId
          );
      await sheets.appendRowsByHeaders(
          SHEET_TABS.BILLING_LINES,
          input.lines.map((l, i) => ({
          LineID: GoogleSheetsService.generateId("BILL"),
          BillingID: input.billingId,
          LineNumber: i + 1,
          Description: l.description,
          Quantity: l.quantity,
          UnitPrice: l.unitPrice,
          DiscountPercent: l.discountPercent,
          LineTotal: totals.lineTotals[i],
          Notes: l.notes || "",
        }))
        );

      await safeAuditLog({
        data: {
          orgId: ctx.org.orgId,
          userId: ctx.session.userId,
          action: "update",
          entityType: "receipt",
          entityRef: input.billingId,
          summary: `แก้ไขใบเสร็จรับเงิน ${existing.ReceiptNumber || existing.DocNumber}`,
        },
      });

      // SALE-14: โหมดแยก → ออกใบกำกับภาษีคู่จากยอดล่าสุด (ใบเดิมถูกยกเลิก/ร่างถูกลบไปแล้ว)
      let taxInvoiceId: string | undefined;
      let taxInvoiceNumber: string | undefined;
      let pairedWarning: string | undefined;
      if (taxDocMode === "separate") {
        const paired = await issuePairedTaxInvoice(ctx, input.billingId, input.docDate, customer);
        taxInvoiceId = paired.taxInvoiceId;
        taxInvoiceNumber = paired.docNumber;
        pairedWarning = paired.warning;
      }

      // ย้าย DocDate ข้ามเดือนหลังมีเลขแล้ว: คงเลขเดิม แต่เตือนผู้ใช้ (DOC-07)
      const warning =
        [monthMoveWarning(existing.DocDate, input.docDate, existing.ReceiptNumber || existing.DocNumber), pairedWarning]
          .filter(Boolean)
          .join("\n\n") || undefined;
      return { success: true, billingId: input.billingId, taxInvoiceId, taxInvoiceNumber, warning };
    }, { ttlMs: 60_000 })),

  /** ยกเลิกใบเสร็จรับเงินที่ออกโดยตรง (เลขที่ยังคงอยู่ ไม่นำกลับมาใช้ซ้ำ) */
  voidReceipt: featureProcedure("revenueModule", "manageBillings")
    .input(z.object({ billingId: z.string(), reason: z.string().trim().max(500).optional() }))
    // SALE-16: lock เดียวกับ updateReceipt — ยกเลิกระหว่างที่อีกคนกำลังแก้/ออกใบกำกับคู่ ต้องรอกัน
    .mutation(({ ctx, input }) => withLock(`receipt-ti:${ctx.org.orgId}:${input.billingId}`, async () => {
      const sheets = await getSheetsService(ctx.org.orgId);
      await ensureTabsCached(sheets, ctx.org.orgId); // คอลัมน์ VoidReason ในชีตเดิม
      if (ctx.org.googleSpreadsheetId) await invalidateTab(ctx.org.googleSpreadsheetId, SHEET_TABS.BILLINGS);
      const existing = await sheets.getBillingById(input.billingId);
      if (!existing || existing.DocKind !== "receipt") {
        throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบใบเสร็จรับเงิน" });
      }
      await assertPeriodOpen(ctx.org.orgId, existing.ReceiptDate || existing.DocDate, "ยกเลิกใบเสร็จรับเงิน"); // CTRL-01
      // SALE-02: ใบเสร็จ/ใบกำกับ (โหมดรวม) ที่มีใบลด/เพิ่มหนี้ใช้อยู่ → ยกเลิกใบเหล่านั้นก่อน
      const activeNotes = await activeNotesFor(sheets, input.billingId);
      if (activeNotes.length > 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `ใบนี้มีใบลด/เพิ่มหนี้ ${activeNotes.join(", ")} — ยกเลิกใบเหล่านั้นก่อน`,
        });
      }
      if (existing.Status === "void") {
        return { success: true, voidedTaxInvoice: undefined as string | undefined };
      }
      const receiptNo = existing.ReceiptNumber || existing.DocNumber;
      const reason = (input.reason || "").trim();

      // SALE-01b: ใบกำกับภาษีคู่ (โหมดแยก) ต้องถูกยกเลิกพร้อมกัน — ไม่งั้นรายได้หายแต่ภาษีขายยังนับใน ภ.พ.30
      if (ctx.org.googleSpreadsheetId) await invalidateTab(ctx.org.googleSpreadsheetId, SHEET_TABS.TAX_INVOICES);
      // ใบเสร็จที่เป็นใบกำกับภาษีด้วย (โหมดรวม) หรือมีใบกำกับคู่ → ต้องมีเหตุผล (เหมือนยกเลิกใบกำกับภาษี)
      const plan = receiptVoidPlan(existing, await sheets.getAll(SHEET_TABS.TAX_INVOICES));
      const pairedTis = plan.paired;
      const issuedTi = plan.issued;
      if (plan.reasonRequired && reason.length < 3) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: issuedTi
            ? `กรุณาระบุเหตุผลการยกเลิก — ใบกำกับภาษีคู่ ${issuedTi.DocNumber} จะถูกยกเลิกพร้อมกัน`
            : "กรุณาระบุเหตุผลการยกเลิก — ใบนี้เป็นใบเสร็จรับเงิน/ใบกำกับภาษี",
        });
      }

      const tiCaller = createCallerFactory(taxInvoiceRouter)(ctx);
      // SALE-15: ร่าง (ยังไม่มีเลข) ไม่มีผลทางภาษี → ลบตรง ไม่ต้องใช้สิทธิ์ใบกำกับภาษี
      // · ที่ออกเลขแล้วต้องยกเลิกผ่าน taxInvoice.void (สิทธิ์ manageTaxInvoices) เท่านั้น
      try {
        await deleteDraftPairedTaxInvoices(sheets, pairedTis, {
          orgId: ctx.org.orgId,
          userId: ctx.session.userId,
          receiptNo,
          because: "ยกเลิกใบเสร็จ",
        });
      } catch (e) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `ลบใบกำกับภาษีคู่ (ร่าง) ไม่สำเร็จ — ใบเสร็จยังไม่ถูกยกเลิก: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
      for (const ti of pairedTis) {
        if (ti.Status !== "issued") continue;
        try {
          await tiCaller.void({ taxInvoiceId: ti.TaxInvoiceID, reason: `${reason} (ยกเลิกพร้อมใบเสร็จ ${receiptNo})` });
        } catch (e) {
          const forbidden = e instanceof TRPCError && e.code === "FORBIDDEN";
          throw new TRPCError({
            code: forbidden ? "FORBIDDEN" : "INTERNAL_SERVER_ERROR",
            message: forbidden
              ? `ใบเสร็จนี้มีใบกำกับภาษีคู่ ${ti.DocNumber || "(ร่าง)"} — ต้องให้ผู้มีสิทธิ์ยกเลิกใบกำกับภาษีเป็นผู้ยกเลิก`
              : `ยกเลิกใบกำกับภาษีคู่ ${ti.DocNumber || "(ร่าง)"} ไม่สำเร็จ — ใบเสร็จยังไม่ถูกยกเลิก: ${e instanceof Error ? e.message : String(e)}`,
          });
        }
      }

      await sheets.updateById(SHEET_TABS.BILLINGS, "BillingID", input.billingId, {
        Status: "void",
        VoidReason: reason,
        UpdatedAt: new Date().toISOString(),
      });
      await safeAuditLog({
        data: {
          orgId: ctx.org.orgId,
          userId: ctx.session.userId,
          action: "update",
          entityType: "receipt",
          entityRef: input.billingId,
          summary: `ยกเลิกใบเสร็จรับเงิน ${receiptNo}${issuedTi ? ` + ใบกำกับภาษี ${issuedTi.DocNumber}` : ""}${reason ? `: ${reason}` : ""}`,
        },
      });
      return { success: true, voidedTaxInvoice: issuedTi?.DocNumber };
    }, { ttlMs: 60_000 })),

  /**
   * SALE-14: ออกใบกำกับภาษีคู่ให้ใบเสร็จออกตรงโหมดแยกที่ยังไม่มีใบกำกับที่ออกเลขแล้ว
   * (ตอนออกใบเสร็จลูกค้ายังไม่มีเลขผู้เสียภาษี / ยกเลิกใบกำกับคู่เพื่อแก้ใบเสร็จ ฯลฯ)
   * ลงวันที่เดียวกับใบเสร็จ (จุดความรับผิด ม.78/1) · ร่างเก่าถูกลบแล้วสร้างใหม่จากยอดล่าสุด
   */
  issueReceiptTaxInvoice: featureProcedure("revenueModule", "manageBillings")
    .input(z.object({ billingId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const sheets = await getSheetsService(ctx.org.orgId);
      await ensureTabsCached(sheets, ctx.org.orgId);
      const existing = await sheets.getBillingById(input.billingId);
      if (!existing || existing.DocKind !== "receipt") {
        throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบใบเสร็จรับเงิน" });
      }
      await assertPeriodOpen(ctx.org.orgId, existing.ReceiptDate || existing.DocDate, "ออกใบกำกับภาษีคู่"); // CTRL-01
      if (existing.Status === "void") {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "ใบเสร็จรับเงินนี้ถูกยกเลิกแล้ว" });
      }
      if (existing.TaxDocMode !== "separate" || existing.IsVAT === "FALSE" || !((parseFloat(existing.VATAmount) || 0) > 0)) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "ใบเสร็จนี้ไม่ได้ออกแบบแยกใบกำกับภาษี (ไม่มี VAT หรือเป็นใบเสร็จรับเงิน/ใบกำกับภาษีอยู่แล้ว)",
        });
      }
      return withLock(`receipt-ti:${ctx.org.orgId}:${input.billingId}`, async () => {
        if (ctx.org.googleSpreadsheetId) await invalidateTab(ctx.org.googleSpreadsheetId, SHEET_TABS.TAX_INVOICES);
        const pairedTis = (await sheets.getAll(SHEET_TABS.TAX_INVOICES)).filter(
          (t) => t.SourceBillingID === input.billingId,
        );
        const issued = pairedTis.find((t) => t.Status === "issued");
        if (issued) {
          return { success: true, taxInvoiceId: issued.TaxInvoiceID, taxInvoiceNumber: issued.DocNumber, existing: true };
        }
        const customer = await sheets.getCustomerById(existing.CustomerID);
        if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบลูกค้า" });
        await deleteDraftPairedTaxInvoices(sheets, pairedTis, {
          orgId: ctx.org.orgId,
          userId: ctx.session.userId,
          receiptNo: existing.ReceiptNumber || existing.DocNumber,
          because: "สร้างใหม่จากยอดล่าสุดก่อนออกเลข",
        });
        const docDate = (existing.ReceiptDate || existing.DocDate || "").slice(0, 10) || todayBangkok();
        const paired = await issuePairedTaxInvoice(ctx, input.billingId, docDate, customer);
        if (!paired.docNumber) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: (paired.warning || "ออกใบกำกับภาษีคู่ไม่สำเร็จ").split("\n")[0],
          });
        }
        return {
          success: true,
          taxInvoiceId: paired.taxInvoiceId,
          taxInvoiceNumber: paired.docNumber,
          existing: false,
          warning: paired.warning, // CTRL-13
        };
      }, { ttlMs: 60_000 });
    }),

  /**
   * ออกใบเสร็จรับเงิน — 1 ใบต่อ 1 ใบวางบิล ออกได้เมื่อรับเงินครบ (Status = paid)
   * เลขรันแยก RC-{ปี}-{0001} เก็บในคอลัมน์ ReceiptNumber ของแถวใบวางบิลเดิม
   * ใช้ได้ทั้งธุรกิจจด VAT และไม่จด VAT (ไม่จด VAT = เอกสารรับเงินหลักแทนใบกำกับภาษี)
   * เรียกซ้ำได้ — ถ้าออกแล้วจะคืนเลขเดิม
   */
  issueReceipt: featureProcedure("revenueModule", "manageBillings")
    .input(
      z.object({
        billingId: z.string(),
        receiptDate: z.string().optional(), // default = วันที่รับเงินล่าสุด
      })
    )
    .mutation(async ({ ctx, input }) => {
      const sheets = await getSheetsService(ctx.org.orgId);
      await ensureTabsCached(sheets, ctx.org.orgId); // ReceiptNumber column on older sheets
      const existing = await sheets.getBillingById(input.billingId);
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบใบวางบิล" });
      }
      if (existing.ReceiptNumber) {
        return { success: true, receiptNumber: existing.ReceiptNumber };
      }
      if (existing.Status !== "paid") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "ออกใบเสร็จรับเงินได้เมื่อรับเงินครบแล้วเท่านั้น",
        });
      }

      if (input.receiptDate && input.receiptDate > todayBangkok()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "วันที่ใบเสร็จต้องไม่เกินวันนี้" });
      }
      const receiptDate =
        input.receiptDate ||
        existing.PaidDate ||
        todayBangkok(); // DOC-05
      await assertPeriodOpen(ctx.org.orgId, receiptDate, "ออกใบเสร็จรับเงิน"); // CTRL-01
      // อ่าน max สด + เขียนเลข ภายใน lock ต่อ org/RC/เดือน (DOC-03)
      const receiptNumber = await withDocNumberLock(ctx.org.orgId, "RC", receiptDate, async () => {
        const no = await computeNextDocNumber(
          sheets,
          "RC",
          receiptDate,
          SHEET_TABS.BILLINGS,
          undefined,
          "ReceiptNumber",
          { spreadsheetId: ctx.org.googleSpreadsheetId }
        );
        await sheets.updateById(SHEET_TABS.BILLINGS, "BillingID", input.billingId, {
          ReceiptNumber: no,
          ReceiptDate: receiptDate,
          UpdatedAt: new Date().toISOString(),
        });
        return no;
      });

      await safeAuditLog({
        data: {
          orgId: ctx.org.orgId,
          userId: ctx.session.userId,
          action: "create",
          entityType: "receipt",
          entityRef: input.billingId,
          summary: `ออกใบเสร็จรับเงิน ${receiptNumber} (จากใบวางบิล ${existing.DocNumber})`,
        },
      });

      return { success: true, receiptNumber };
    }),

  /**
   * SALE-19: ยกเลิกใบเสร็จรับเงินที่ออกจากใบวางบิล — เพื่อแก้ใบวางบิลแล้วออกใบเสร็จใหม่
   * เลขเดิมเก็บเป็นแถว "ยกเลิก" (ไม่นำกลับมาใช้ · แสดงในรายการใบเสร็จว่าถูกยกเลิก + เหตุผล)
   * ใบวางบิลยังเป็น "รับเงินครบ" (การรับเงินไม่ได้ถูกยกเลิก) → กลับไปอยู่ในรายการรอออกใบเสร็จ
   */
  voidBillingReceipt: featureProcedure("revenueModule", "manageBillings")
    .input(z.object({ billingId: z.string(), reason: z.string().trim().min(3, "กรุณาระบุเหตุผลการยกเลิก").max(500) }))
    .mutation(async ({ ctx, input }) => {
      const sheets = await getSheetsService(ctx.org.orgId);
      await ensureTabsCached(sheets, ctx.org.orgId);
      const row = await withLock(`billing:${ctx.org.orgId}:${input.billingId}`, async () => {
        if (ctx.org.googleSpreadsheetId) await invalidateTab(ctx.org.googleSpreadsheetId, SHEET_TABS.BILLINGS);
        const existing = await sheets.getBillingById(input.billingId);
        if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบใบวางบิล" });
        await assertPeriodOpen(ctx.org.orgId, existing.ReceiptDate || existing.PaidDate, "ยกเลิกใบเสร็จรับเงิน"); // CTRL-01
        if (existing.DocKind === "receipt") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "ใบเสร็จที่ออกโดยตรง ยกเลิกที่ปุ่มยกเลิกของใบนั้น" });
        }
        if (!existing.ReceiptNumber) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "ยังไม่ได้ออกใบเสร็จรับเงิน" });
        }
        const receiptNo = existing.ReceiptNumber;
        const receiptDate = existing.ReceiptDate || existing.PaidDate || existing.DocDate || todayBangkok();
        const now = new Date().toISOString();
        // เลขเดิมคง "ถูกใช้แล้ว" (computeNextDocNumber หา max จากคอลัมน์ ReceiptNumber) — แบบเดียวกับ SALE-11
        await withDocNumberLock(ctx.org.orgId, "RC", receiptDate, async () => {
          await sheets.appendRowByHeaders(SHEET_TABS.BILLINGS, {
            BillingID: GoogleSheetsService.generateId("RCV"),
            DocNumber: receiptNo,
            ReceiptNumber: receiptNo,
            DocDate: receiptDate,
            ReceiptDate: receiptDate,
            DueDate: receiptDate,
            DocKind: "receipt",
            Status: "void",
            CustomerID: existing.CustomerID || "",
            CustomerNameSnapshot: existing.CustomerNameSnapshot || "",
            Subtotal: 0,
            VATAmount: 0,
            GrandTotal: 0,
            PaidAmount: 0,
            IsVAT: existing.IsVAT || "",
            VoidReason: input.reason,
            Notes: `ใบเสร็จของใบวางบิล ${existing.DocNumber} ถูกยกเลิก: ${input.reason} — เก็บเลขไว้ไม่ให้ออกซ้ำ`,
            PreparedBy: "ระบบ",
            PreparedByUserId: ctx.session.userId,
            CreatedAt: now,
            UpdatedAt: now,
          });
          await sheets.updateById(SHEET_TABS.BILLINGS, "BillingID", input.billingId, {
            ReceiptNumber: "",
            ReceiptDate: "",
            ReceiptPdfUrl: "",
            ReceiptPdfFor: "",
            ReceiptPdfContentFor: "",
            PaymentNote: [existing.PaymentNote, `ยกเลิกใบเสร็จ ${receiptNo}: ${input.reason}`].filter(Boolean).join("\n"),
            UpdatedAt: now,
          });
        });
        return existing;
      });
      await safeAuditLog({
        data: {
          orgId: ctx.org.orgId,
          userId: ctx.session.userId,
          action: "update",
          entityType: "receipt",
          entityRef: input.billingId,
          summary: `ยกเลิกใบเสร็จรับเงิน ${row.ReceiptNumber} (จากใบวางบิล ${row.DocNumber}): ${input.reason}`,
        },
      });
      return { success: true, voidedReceiptNumber: row.ReceiptNumber };
    }),

  /**
   * แก้วันที่ใบเสร็จรับเงินที่ออกจากใบวางบิล (= วันที่รับเงิน) — เช่นตอนบันทึกรับเงินลืมเปลี่ยน
   * จาก "วันนี้" เป็นวันที่เงินเข้าจริง · ใบเสร็จที่ออกโดยตรง (DocKind=receipt) แก้ที่ updateReceipt
   * DOC-07: ย้ายข้ามเดือน → คงเลขเดิม (อาจส่งให้ลูกค้าแล้ว) + คืนคำเตือนให้ UI แสดง
   */
  updateReceiptDate: featureProcedure("revenueModule", "manageBillings")
    .input(
      z.object({
        billingId: z.string(),
        receiptDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "วันที่ไม่ถูกต้อง"),
        // ผู้ใช้เลือกเอง: ย้ายข้ามเดือน → ออกเลขใหม่ของเดือนนั้น (ปกติ DOC-07 คงเลขเดิม)
        renumber: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // ฟังก์ชันพิเศษ — ทีมงานเปิดให้รายคนในหลังบ้านเท่านั้น (ไม่ได้เปิดให้ทุก user)
      const orgRow = await prisma.organization.findUnique({
        where: { id: ctx.org.orgId },
        select: { settings: true },
      });
      if (!hasSpecialFeature(orgRow?.settings, "receiptDateEdit", ctx.session.userId)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "ยังไม่ได้เปิดใช้ฟังก์ชันแก้วันที่ใบเสร็จ — ติดต่อทีม Aim Expense",
        });
      }
      if (input.receiptDate > todayBangkok()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "วันที่ใบเสร็จต้องไม่เกินวันนี้" });
      }
      const sheets = await getSheetsService(ctx.org.orgId);
      const existing = await withLock(`billing:${ctx.org.orgId}:${input.billingId}`, async () => {
        if (ctx.org.googleSpreadsheetId) {
          await invalidateTab(ctx.org.googleSpreadsheetId, SHEET_TABS.BILLINGS);
        }
        const existing = await sheets.getBillingById(input.billingId);
        if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบใบวางบิล" });
        await assertPeriodOpen(ctx.org.orgId, [existing.ReceiptDate || existing.PaidDate, input.receiptDate], "แก้วันที่ใบเสร็จ"); // CTRL-01
        if (existing.DocKind === "receipt") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "ใบเสร็จที่ออกโดยตรง แก้ไขได้ที่เมนูใบเสร็จรับเงิน" });
        }
        if (!existing.ReceiptNumber) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "ยังไม่ได้ออกใบเสร็จรับเงิน" });
        }
        const oldDate = existing.ReceiptDate || existing.PaidDate || "";
        const from = docPeriod(oldDate);
        const to = docPeriod(input.receiptDate);
        const crossMonth = from.yyyy !== to.yyyy || from.mm !== to.mm;
        const patch = {
          ReceiptDate: input.receiptDate,
          PaidDate: input.receiptDate, // ใบเสร็จ = วันที่รับเงิน — ให้สองค่าตรงกัน
          PaymentNote: [
            existing.PaymentNote,
            `แก้วันที่รับเงิน/ใบเสร็จ ${oldDate || "-"} → ${input.receiptDate}`,
          ]
            .filter(Boolean)
            .join("\n"),
          UpdatedAt: new Date().toISOString(),
        };
        let newNumber: string | undefined;
        if (input.renumber && crossMonth) {
          // เลขใหม่ของเดือนปลายทาง: อ่าน max สด + เขียนภายใน lock ต่อ org/RC/เดือน (DOC-03)
          newNumber = await withDocNumberLock(ctx.org.orgId, "RC", input.receiptDate, async () => {
            const no = await computeNextDocNumber(
              sheets,
              "RC",
              input.receiptDate,
              SHEET_TABS.BILLINGS,
              undefined,
              "ReceiptNumber",
              { spreadsheetId: ctx.org.googleSpreadsheetId }
            );
            await sheets.updateById(SHEET_TABS.BILLINGS, "BillingID", input.billingId, {
              ...patch,
              ReceiptNumber: no,
              PaymentNote: `${patch.PaymentNote}\nเปลี่ยนเลขใบเสร็จ ${existing.ReceiptNumber} → ${no}`,
            });
            return no;
          });
          // SALE-11: เลขเดิมต้องคง "ถูกใช้แล้ว" — ไม่งั้นใบเสร็จใหม่ของเดือนเดิมได้เลขซ้ำกับใบที่ลูกค้าถืออยู่
          // (computeNextDocNumber หา max จากคอลัมน์ ReceiptNumber) → เก็บเป็นแถวยกเลิกที่อธิบายว่าเลขย้ายไปไหน
          await withDocNumberLock(ctx.org.orgId, "RC", oldDate || input.receiptDate, async () => {
            await sheets.appendRowByHeaders(SHEET_TABS.BILLINGS, {
              BillingID: GoogleSheetsService.generateId("RCV"),
              DocNumber: existing.ReceiptNumber,
              ReceiptNumber: existing.ReceiptNumber,
              DocDate: oldDate,
              ReceiptDate: oldDate,
              DueDate: oldDate,
              DocKind: "receipt",
              Status: "void",
              CustomerID: existing.CustomerID || "",
              CustomerNameSnapshot: existing.CustomerNameSnapshot || "",
              Subtotal: 0,
              VATAmount: 0,
              GrandTotal: 0,
              PaidAmount: 0,
              IsVAT: existing.IsVAT || "",
              Notes: `เลขที่นี้ถูกเปลี่ยนเป็น ${newNumber} (แก้วันที่ใบเสร็จของ ${existing.DocNumber}) — เก็บไว้ไม่ให้ออกซ้ำ`,
              PreparedBy: "ระบบ",
              PreparedByUserId: ctx.session.userId,
              CreatedAt: new Date().toISOString(),
              UpdatedAt: new Date().toISOString(),
            });
          });
        } else {
          await sheets.updateById(SHEET_TABS.BILLINGS, "BillingID", input.billingId, patch);
        }
        return { row: existing, newNumber };
      });
      const { row, newNumber } = existing;

      await safeAuditLog({
        data: {
          orgId: ctx.org.orgId,
          userId: ctx.session.userId,
          action: "update",
          entityType: "receipt",
          entityRef: input.billingId,
          summary: `แก้วันที่ใบเสร็จรับเงิน ${row.ReceiptNumber}: ${row.ReceiptDate || row.PaidDate || "-"} → ${input.receiptDate}${
            newNumber ? ` · เลขใหม่ ${newNumber}` : ""
          }`,
        },
      });

      return {
        success: true,
        receiptNumber: newNumber ?? row.ReceiptNumber,
        renumbered: !!newNumber,
        warning: newNumber
          ? undefined
          : monthMoveWarning(row.ReceiptDate || row.PaidDate, input.receiptDate, row.ReceiptNumber),
      };
    }),

  recordPayment: featureProcedure("revenueModule", "manageBillings")
    .input(
      z.object({
        billingId: z.string(),
        amount: z.number().min(0.01, "จำนวนเงินต้องมากกว่า 0"),
        paidDate: z.string().min(1),
        paymentMethod: PaymentMethod,
        bankAccountId: z.string().optional(),
        notes: z.string().max(500).optional(),
        // แยกยอดแบบ FlowAccount (amount = ยอดตัดหนี้ = cashReceived + whtAmount + adjustmentAmount)
        breakdown: z
          .object({
            cashReceived: z.number().min(0),
            whtPercent: z.number().min(0).max(15),
            whtAmount: z.number().min(0),
            adjustmentType: z.string().max(50).optional(),
            adjustmentAmount: z.number().min(0),
          })
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const b = input.breakdown;
      if (b && Math.abs(round2(b.cashReceived + b.whtAmount + b.adjustmentAmount) - round2(input.amount)) > 0.01) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "ยอดรับจริง + หัก ณ ที่จ่าย + ปรับลด ไม่เท่ากับยอดตัดหนี้" });
      }
      // รายละเอียดเก็บในชีตของลูกค้า (ZDR) — ไม่ใส่ข้อความอิสระลง Postgres
      const fmt = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const noteParts = [
        `${input.paidDate} ตัดหนี้ ${fmt(input.amount)}`,
        b ? `รับจริง ${fmt(b.cashReceived)}` : "",
        b && b.whtAmount > 0 ? `หัก ณ ที่จ่าย ${b.whtPercent}% ${fmt(b.whtAmount)}` : "",
        b && b.adjustmentAmount > 0 ? `${b.adjustmentType || "ปรับลด"} ${fmt(b.adjustmentAmount)}` : "",
        input.notes?.trim() ? `หมายเหตุ: ${input.notes.trim()}` : "",
      ].filter(Boolean);
      const paymentNoteEntry = noteParts.join(" · ");

      const sheets = await getSheetsService(ctx.org.orgId);
      await ensureTabsCached(sheets, ctx.org.orgId); // คอลัมน์ PaymentNote ในชีตเก่า
      // lock ต่อเอกสาร + อ่าน PaidAmount สด (ไม่ใช้ cache 90 วิ) — กดซ้ำ/2 คนพร้อมกันต้องไม่
      // คำนวณยอดรับจากค่าเก่า (CO-04)
      const { existing, newPaid, newStatus, grandTotal } = await withLock(
        `billing:${ctx.org.orgId}:${input.billingId}`,
        async () => {
          if (ctx.org.googleSpreadsheetId) {
            await invalidateTab(ctx.org.googleSpreadsheetId, SHEET_TABS.BILLINGS);
          }
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
              // รับหลายครั้ง → ต่อท้าย (อ่านค่าสดภายใน lock แล้ว)
              PaymentNote: [existing.PaymentNote, paymentNoteEntry].filter(Boolean).join("\n"),
              UpdatedAt: new Date().toISOString(),
            }
          );
          return { existing, newPaid, newStatus, grandTotal };
        }
      );

      await safeAuditLog({
        data: {
          orgId: ctx.org.orgId,
          userId: ctx.session.userId,
          action: "update",
          entityType: "billing",
          entityRef: input.billingId,
          summary: `รับเงิน ${input.amount.toLocaleString()} บาท (${input.paymentMethod}${
            b ? ` · รับจริง ${b.cashReceived.toLocaleString()} · WHT ${b.whtAmount.toLocaleString()} · ปรับลด ${b.adjustmentAmount.toLocaleString()}` : ""
          }) ใบวางบิล ${existing.DocNumber} → ${newStatus}`,
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
