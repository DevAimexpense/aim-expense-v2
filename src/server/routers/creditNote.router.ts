// ===========================================
// SALE-02: ใบลดหนี้ / ใบเพิ่มหนี้ (ม.82/9-10, ม.86/9-10)
// อ้างใบกำกับภาษีที่ออกเลขแล้ว หรือใบเสร็จรับเงิน/ใบกำกับภาษี (โหมดรวม) · เก็บในแท็บ CreditNotes
// ภาษีขายลด/เพิ่มในเดือนที่ออกใบ (ไม่แก้ใบกำกับเดิม) · ยกเลิกได้ (เลขคงอยู่) — ต้องระบุเหตุผล
// ===========================================

import { roundMoney } from "@/lib/money";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, featureProcedure } from "../trpc";
import { getSheetsService, ensureTabsCached } from "../lib/sheets-context";
import { GoogleSheetsService, SHEET_TABS } from "../services/google-sheets.service";
import { computeNextDocNumber, withDocNumberLock } from "../lib/doc-number";
import { withLock } from "../lib/lock";
import { invalidateTab } from "../lib/cache";
import { isDocInScope } from "../lib/doc-scope";
import { assertVatAllowed } from "../lib/org-vat";
import { safeAuditLog } from "@/server/lib/audit";
import { todayBangkok } from "@/lib/utils/date";
import {
  computeNote,
  priorAdjustment,
  noteReasons,
  noteReasonLabel,
  NOTE_TITLE,
  type NoteKind,
} from "@/lib/credit-note";
import { filedVatPeriodWarning } from "../lib/vat-period";
import { assertPeriodOpen } from "../lib/period-lock";

type Row = Record<string, string>;
const num = (v: string | undefined) => {
  const n = parseFloat(v || "");
  return Number.isFinite(n) ? n : 0;
};

const SourceType = z.enum(["tax_invoice", "receipt"]);

/** ข้อมูลเอกสารต้นทางที่ใบลด/เพิ่มหนี้อ้างถึง (ต้องเป็นใบกำกับภาษีที่ใช้ได้อยู่) */
async function loadSource(
  sheets: GoogleSheetsService,
  sourceType: "tax_invoice" | "receipt",
  sourceId: string,
): Promise<{
  row: Row;
  docNumber: string;
  docDate: string;
  subtotal: number;
  customerId: string;
  customerName: string;
  customerTaxId: string;
  customerBranch: string;
  customerAddress: string;
  issuerBranch: string;
  issuerAddress: string;
  eventId: string;
  projectName: string;
  preparedByUserId: string;
}> {
  if (sourceType === "tax_invoice") {
    const t = await sheets.getTaxInvoiceById(sourceId);
    if (!t) throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบใบกำกับภาษี" });
    if (t.Status !== "issued") {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "ออกใบลด/เพิ่มหนี้ได้เฉพาะใบกำกับภาษีที่ออกเลขแล้วและยังไม่ยกเลิก" });
    }
    return {
      row: t,
      docNumber: t.DocNumber || "",
      docDate: (t.DocDate || "").slice(0, 10),
      subtotal: num(t.Subtotal),
      customerId: t.CustomerID || "",
      customerName: t.CustomerNameSnapshot || "",
      customerTaxId: t.CustomerTaxIdSnapshot || "",
      customerBranch: t.CustomerBranchSnapshot || "",
      customerAddress: t.CustomerAddressSnapshot || "",
      issuerBranch: t.IssuerBranchSnapshot || "",
      issuerAddress: t.IssuerAddressSnapshot || "",
      eventId: (t.EventID || "").trim(),
      projectName: t.ProjectName || "",
      preparedByUserId: t.PreparedByUserId || "",
    };
  }
  const b = await sheets.getBillingById(sourceId);
  if (!b || b.DocKind !== "receipt" || b.Status === "void") {
    throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบใบเสร็จรับเงิน/ใบกำกับภาษีที่ยังใช้ได้" });
  }
  if (b.TaxDocMode !== "combined") {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "ใบเสร็จนี้ไม่ใช่ใบกำกับภาษี — ออกใบลด/เพิ่มหนี้จากใบกำกับภาษีคู่ (เมนูใบกำกับภาษี)",
    });
  }
  return {
    row: b,
    docNumber: b.ReceiptNumber || b.DocNumber || "",
    docDate: (b.ReceiptDate || b.DocDate || "").slice(0, 10),
    subtotal: num(b.Subtotal),
    customerId: b.CustomerID || "",
    customerName: b.CustomerNameSnapshot || "",
    customerTaxId: b.CustomerTaxIdSnapshot || "",
    customerBranch: b.CustomerBranchSnapshot || "", // SALE-23
    customerAddress: b.CustomerAddressSnapshot || "",
    issuerBranch: b.IssuerBranchSnapshot || "",
    issuerAddress: b.IssuerAddressSnapshot || "",
    eventId: (b.EventID || "").trim(),
    projectName: b.ProjectName || "",
    preparedByUserId: b.PreparedByUserId || "",
  };
}

function shapeNote(r: Row) {
  const kind = (r.Kind === "debit" ? "debit" : "credit") as NoteKind;
  return {
    noteId: r.NoteID,
    kind,
    title: NOTE_TITLE[kind],
    docNumber: r.DocNumber || "",
    docDate: r.DocDate || "",
    sourceType: (r.SourceType === "receipt" ? "receipt" : "tax_invoice") as "tax_invoice" | "receipt",
    sourceId: r.SourceID || "",
    sourceDocNumber: r.SourceDocNumber || "",
    sourceDocDate: r.SourceDocDate || "",
    originalSubtotal: num(r.OriginalSubtotal),
    priorAdjustment: num(r.PriorAdjustment),
    correctSubtotal: num(r.CorrectSubtotal),
    diffAmount: num(r.DiffAmount),
    vatAmount: num(r.VATAmount),
    grandTotal: num(r.GrandTotal),
    reasonCode: r.ReasonCode || "",
    reasonLabel: noteReasonLabel(kind, r.ReasonCode || ""),
    reason: r.Reason || "",
    description: r.Description || "",
    customerId: r.CustomerID || "",
    customerNameSnapshot: r.CustomerNameSnapshot || "",
    customerTaxIdSnapshot: r.CustomerTaxIdSnapshot || "",
    customerBranchSnapshot: r.CustomerBranchSnapshot || "",
    customerAddressSnapshot: r.CustomerAddressSnapshot || "",
    eventId: r.EventID || "",
    projectName: r.ProjectName || "",
    status: (r.Status === "void" ? "void" : "issued") as "issued" | "void",
    voidReason: r.VoidReason || "",
    preparedBy: r.PreparedBy || "",
    createdAt: r.CreatedAt || "",
    updatedAt: r.UpdatedAt || "",
    pdfUrl: r.PdfUrl || "",
  };
}

export const creditNoteRouter = router({
  list: featureProcedure("revenueModule")
    .input(z.object({ sourceId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const sheets = await getSheetsService(ctx.org.orgId);
      await ensureTabsCached(sheets, ctx.org.orgId);
      const all = await sheets.getAll(SHEET_TABS.CREDIT_NOTES);
      return all
        .filter((r) => isDocInScope(ctx.org, ctx.session.userId, r.EventID, r.PreparedByUserId))
        .filter((r) => !input?.sourceId || r.SourceID === input.sourceId)
        .sort((a, b) => (b.DocDate || "").localeCompare(a.DocDate || "") || (b.DocNumber || "").localeCompare(a.DocNumber || ""))
        .map(shapeNote);
    }),

  /** ข้อมูลตั้งต้นของฟอร์ม: เอกสารเดิม + ปรับไปแล้วเท่าไร + เหตุตามกฎหมาย */
  sourceInfo: featureProcedure("revenueModule", "manageTaxInvoices")
    .input(z.object({ sourceType: SourceType, sourceId: z.string() }))
    .query(async ({ ctx, input }) => {
      const sheets = await getSheetsService(ctx.org.orgId);
      await ensureTabsCached(sheets, ctx.org.orgId);
      const src = await loadSource(sheets, input.sourceType, input.sourceId);
      if (!isDocInScope(ctx.org, ctx.session.userId, src.eventId, src.preparedByUserId)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบเอกสาร" });
      }
      const notes = await sheets.getAll(SHEET_TABS.CREDIT_NOTES);
      const prior = priorAdjustment(notes, input.sourceId);
      return {
        docNumber: src.docNumber,
        docDate: src.docDate,
        customerName: src.customerName,
        originalSubtotal: src.subtotal,
        prior,
        currentValue: roundMoney((src.subtotal + prior)),
        notes: notes.filter((n) => n.SourceID === input.sourceId).map(shapeNote),
        creditReasons: noteReasons("credit"),
        debitReasons: noteReasons("debit"),
      };
    }),

  create: featureProcedure("revenueModule", "manageTaxInvoices")
    .input(
      z.object({
        kind: z.enum(["credit", "debit"]),
        sourceType: SourceType,
        sourceId: z.string(),
        docDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "วันที่ไม่ถูกต้อง"),
        correctSubtotal: z.number().min(0),
        reasonCode: z.string().min(1, "กรุณาเลือกเหตุ"),
        reason: z.string().trim().min(3, "กรุณาอธิบายเหตุ").max(500),
        description: z.string().trim().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertVatAllowed(ctx.org.orgId, true, NOTE_TITLE[input.kind]);
      if (input.docDate > todayBangkok()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "ออกใบลด/เพิ่มหนี้ล่วงหน้าไม่ได้ (วันที่ในอนาคต)" });
      }
      if (!(noteReasons(input.kind) as readonly { value: string }[]).some((r) => r.value === input.reasonCode)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "เหตุไม่ตรงกับกรณีที่กฎหมายกำหนด" });
      }
      // CTRL-01: ห้ามออกเอกสารลงวันที่ในงวดที่ปิดแล้ว
      await assertPeriodOpen(ctx.org.orgId, input.docDate, NOTE_TITLE[input.kind]);
      const sheets = await getSheetsService(ctx.org.orgId);
      await ensureTabsCached(sheets, ctx.org.orgId);

      // lock ต่อเอกสารต้นทาง — 2 ใบลดหนี้พร้อมกันต้องไม่ลดเกินมูลค่า
      const result = await withLock(`note-src:${ctx.org.orgId}:${input.sourceId}`, async () => {
        const src = await loadSource(sheets, input.sourceType, input.sourceId);
        if (!isDocInScope(ctx.org, ctx.session.userId, src.eventId, src.preparedByUserId)) {
          throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบเอกสาร" });
        }
        if (input.docDate < src.docDate) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `วันที่ต้องไม่ก่อนวันที่ใบกำกับเดิม (${src.docDate})` });
        }
        if (ctx.org.googleSpreadsheetId) await invalidateTab(ctx.org.googleSpreadsheetId, SHEET_TABS.CREDIT_NOTES);
        const prior = priorAdjustment(await sheets.getAll(SHEET_TABS.CREDIT_NOTES), input.sourceId);
        const calc = computeNote({
          kind: input.kind,
          originalSubtotal: src.subtotal,
          prior,
          correctSubtotal: input.correctSubtotal,
        });
        if (!calc.ok) throw new TRPCError({ code: "BAD_REQUEST", message: calc.error });

        const noteId = GoogleSheetsService.generateId(input.kind === "credit" ? "CN" : "DN");
        const now = new Date().toISOString();
        const prefixType = input.kind === "credit" ? "CN" : "DN";
        const docNumber = await withDocNumberLock(ctx.org.orgId, prefixType, input.docDate, async () => {
          const no = await computeNextDocNumber(
            sheets,
            prefixType,
            input.docDate,
            SHEET_TABS.CREDIT_NOTES,
            undefined,
            "DocNumber",
            { spreadsheetId: ctx.org.googleSpreadsheetId },
          );
          await sheets.appendRowByHeaders(SHEET_TABS.CREDIT_NOTES, {
            NoteID: noteId,
            Kind: input.kind,
            DocNumber: no,
            DocDate: input.docDate,
            SourceType: input.sourceType,
            SourceID: input.sourceId,
            SourceDocNumber: src.docNumber,
            SourceDocDate: src.docDate,
            OriginalSubtotal: src.subtotal,
            PriorAdjustment: prior,
            CorrectSubtotal: roundMoney(input.correctSubtotal),
            DiffAmount: calc.diff,
            VATAmount: calc.vat,
            GrandTotal: calc.total,
            ReasonCode: input.reasonCode,
            Reason: input.reason,
            Description: input.description || "",
            CustomerID: src.customerId,
            CustomerNameSnapshot: src.customerName,
            CustomerTaxIdSnapshot: src.customerTaxId,
            CustomerBranchSnapshot: src.customerBranch,
            CustomerAddressSnapshot: src.customerAddress,
            IssuerBranchSnapshot: src.issuerBranch,
            IssuerAddressSnapshot: src.issuerAddress,
            EventID: src.eventId,
            ProjectName: src.projectName,
            Status: "issued",
            VoidedAt: "",
            VoidReason: "",
            PreparedBy: ctx.session.displayName || "",
            PreparedByUserId: ctx.session.userId,
            CreatedAt: now,
            UpdatedAt: now,
            PdfUrl: "",
          });
          return no;
        });
        return { noteId, docNumber, calc, sourceDocNumber: src.docNumber };
      }, { ttlMs: 60_000 });

      await safeAuditLog({
        data: {
          orgId: ctx.org.orgId,
          userId: ctx.session.userId,
          action: "create",
          entityType: "credit_note",
          entityRef: result.noteId,
          summary: `ออก${NOTE_TITLE[input.kind]} ${result.docNumber} อ้าง ${result.sourceDocNumber} · ผลต่าง ${result.calc.diff} VAT ${result.calc.vat} · ${input.reason}`,
        },
      });
      return {
        success: true,
        noteId: result.noteId,
        docNumber: result.docNumber,
        // CTRL-13: ลงวันที่ในงวดที่เลยกำหนดยื่นแล้ว → เตือน
        warning: filedVatPeriodWarning(input.docDate, todayBangkok()),
      };
    }),

  void: featureProcedure("revenueModule", "manageTaxInvoices")
    .input(z.object({ noteId: z.string(), reason: z.string().trim().min(3, "กรุณาระบุเหตุผลการยกเลิก").max(500) }))
    .mutation(async ({ ctx, input }) => {
      const sheets = await getSheetsService(ctx.org.orgId);
      await ensureTabsCached(sheets, ctx.org.orgId);
      const note = await sheets.getById(SHEET_TABS.CREDIT_NOTES, "NoteID", input.noteId);
      if (!note) throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบเอกสาร" });
      if (!isDocInScope(ctx.org, ctx.session.userId, note.EventID, note.PreparedByUserId)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบเอกสาร" });
      }
      if (note.Status === "void") return { success: true };
      const kind = (note.Kind === "debit" ? "debit" : "credit") as NoteKind;
      // CTRL-01: ยกเลิกใบในงวดที่ปิดแล้ว = แก้รายงานที่ยื่นไปแล้ว → ห้าม
      await assertPeriodOpen(ctx.org.orgId, note.DocDate, `ยกเลิก${NOTE_TITLE[kind]}`);
      const now = new Date().toISOString();
      await sheets.updateById(SHEET_TABS.CREDIT_NOTES, "NoteID", input.noteId, {
        Status: "void",
        VoidedAt: now,
        VoidReason: input.reason,
        UpdatedAt: now,
      });
      await safeAuditLog({
        data: {
          orgId: ctx.org.orgId,
          userId: ctx.session.userId,
          action: "void",
          entityType: "credit_note",
          entityRef: input.noteId,
          summary: `ยกเลิก${NOTE_TITLE[kind]} ${note.DocNumber}: ${input.reason}`,
        },
      });
      return { success: true };
    }),
});

/** SALE-02: เอกสารต้นทางมีใบลด/เพิ่มหนี้ที่ยังใช้อยู่ไหม (ห้ามยกเลิกใบกำกับเดิมก่อนยกเลิกใบเหล่านั้น) */
export async function activeNotesFor(sheets: GoogleSheetsService, sourceId: string): Promise<string[]> {
  const notes = await sheets.getAll(SHEET_TABS.CREDIT_NOTES).catch(() => [] as Row[]);
  return notes.filter((n) => n.SourceID === sourceId && n.Status === "issued").map((n) => n.DocNumber || "");
}
