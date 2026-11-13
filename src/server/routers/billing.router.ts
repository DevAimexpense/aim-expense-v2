// ===========================================
// Aim Expense — Billing Router (S24)
// ใบวางบิล CRUD + state transitions + recordPayment
// State: draft → sent → partial → paid | void  (overdue = derived)
// ===========================================

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, featureProcedure } from "../trpc";
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
    whtCertUrl: r.WHTCertUrl || "",
    // ใบเสร็จรับเงิน (ออกเมื่อรับเงินครบ)
    receiptNumber: r.ReceiptNumber || "",
    receiptDate: r.ReceiptDate || "",
    // "receipt" = ใบเสร็จที่ออกโดยตรง ไม่มีใบวางบิล
    docKind: (r.DocKind === "receipt" ? "receipt" : "billing") as
      | "billing"
      | "receipt",
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
      // แก้ไขได้ทุกสถานะยกเว้นยกเลิก (เดิมแก้ได้เฉพาะ draft) — ใบเสร็จรับเงินที่ออกจาก
      // ใบวางบิลนี้อ่านข้อมูลจากแถวเดียวกัน จึงเปลี่ยนตามทันที
      if (existing.Status === "void") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "ใบวางบิลนี้ถูกยกเลิกแล้ว แก้ไขไม่ได้",
        });
      }
      if (existing.DocKind === "receipt") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "เอกสารนี้เป็นใบเสร็จรับเงิน — แก้ไขจากเมนูใบเสร็จรับเงิน",
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
        input.whtPercent,
        input.isVat
      );

      // ยอดรับเงินหลังแก้ไข:
      //   รับครบแล้ว (paid)  → ยังถือว่ารับครบ: ยอดรับ = ยอดรวมใหม่
      //   รับบางส่วน (partial) → คงยอดที่บันทึกรับไว้ แล้วคิดสถานะใหม่จากยอดรวมใหม่
      const paidBefore = parseFloat(existing.PaidAmount) || 0;
      const paymentPatch: Record<string, string | number> = {};
      if (existing.Status === "paid") {
        paymentPatch.PaidAmount = totals.grandTotal;
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
      await safeAuditLog({
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
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertVatAllowed(ctx.org.orgId, input.isVat, "ใบเสร็จรับเงิน"); // DOC-06
      const sheets = await getSheetsService(ctx.org.orgId);
      await ensureTabsCached(sheets, ctx.org.orgId);

      const customer = await sheets.getCustomerById(input.customerId);
      if (!customer) {
        throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบลูกค้า" });
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
            CustomerAddressSnapshot:
              customer.BillingAddress || customer.Address || "",
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
            Notes: input.notes || "",
            Terms: "",
            PreparedBy: ctx.session.displayName || "",
            PreparedByUserId: ctx.session.userId,
            CreatedAt: now,
            UpdatedAt: now,
            PdfUrl: "",
            ReceiptNumber: no,
            ReceiptDate: input.docDate,
            DocKind: "receipt",
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
          summary: `สร้างใบเสร็จรับเงิน ${receiptNumber}`,
        },
      });

      return { success: true, billingId, receiptNumber };
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
    .mutation(async ({ ctx, input }) => {
      await assertVatAllowed(ctx.org.orgId, input.isVat, "ใบเสร็จรับเงิน"); // DOC-06
      const sheets = await getSheetsService(ctx.org.orgId);
      await ensureTabsCached(sheets, ctx.org.orgId);
      const existing = await sheets.getBillingById(input.billingId);
      if (!existing || existing.DocKind !== "receipt") {
        throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบใบเสร็จรับเงิน" });
      }
      if (existing.Status === "void") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "ใบเสร็จรับเงินนี้ถูกยกเลิกแล้ว แก้ไขไม่ได้",
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
        input.whtPercent,
        input.isVat
      );

      await sheets.updateById(SHEET_TABS.BILLINGS, "BillingID", input.billingId, {
        DocDate: input.docDate,
        DueDate: input.docDate,
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

      return {
        success: true,
        billingId: input.billingId,
        // ย้าย DocDate ข้ามเดือนหลังมีเลขแล้ว: คงเลขเดิม แต่เตือนผู้ใช้ (DOC-07)
        warning: monthMoveWarning(existing.DocDate, input.docDate, existing.ReceiptNumber || existing.DocNumber),
      };
    }),

  /** ยกเลิกใบเสร็จรับเงินที่ออกโดยตรง (เลขที่ยังคงอยู่ ไม่นำกลับมาใช้ซ้ำ) */
  voidReceipt: featureProcedure("revenueModule", "manageBillings")
    .input(z.object({ billingId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const sheets = await getSheetsService(ctx.org.orgId);
      const existing = await sheets.getBillingById(input.billingId);
      if (!existing || existing.DocKind !== "receipt") {
        throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบใบเสร็จรับเงิน" });
      }
      if (existing.Status === "void") {
        return { success: true };
      }
      await sheets.updateById(SHEET_TABS.BILLINGS, "BillingID", input.billingId, {
        Status: "void",
        UpdatedAt: new Date().toISOString(),
      });
      await safeAuditLog({
        data: {
          orgId: ctx.org.orgId,
          userId: ctx.session.userId,
          action: "update",
          entityType: "receipt",
          entityRef: input.billingId,
          summary: `ยกเลิกใบเสร็จรับเงิน ${existing.ReceiptNumber || existing.DocNumber}`,
        },
      });
      return { success: true };
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

      const receiptDate =
        input.receiptDate ||
        existing.PaidDate ||
        todayBangkok(); // DOC-05
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
