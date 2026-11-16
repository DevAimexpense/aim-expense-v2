// ===========================================
// PUR-11: ใบลดหนี้ / ใบเพิ่มหนี้ที่ได้รับจากผู้ขาย (ม.82/9-10)
// อ้างรายการจ่ายที่จ่ายแล้ว · ภาษีซื้อปรับในเดือนที่ "ได้รับ" ใบ · รายการเดิมไม่ถูกแก้
// ยกเลิกได้ (ต้องระบุเหตุผล) · เดือนที่ได้รับต้องยังไม่ปิดงวด
// ===========================================

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, orgProcedure, permissionProcedure, type TRPCContext } from "../trpc";
import { getSheetsService, ensureTabsCached } from "../lib/sheets-context";
import { GoogleSheetsService, SHEET_TABS } from "../services/google-sheets.service";
import { withLock } from "../lib/lock";
import { invalidateTab } from "../lib/cache";
import { safeAuditLog } from "@/server/lib/audit";
import { assertPeriodOpen } from "../lib/period-lock";
import { filedVatPeriodWarning } from "../lib/vat-period";
import { todayBangkok } from "@/lib/utils/date";
import { roundMoney } from "@/lib/money";
import { scopedEventIds } from "@/lib/permissions";
import {
  PURCHASE_NOTE_TITLE,
  SETTLED_FOR_NOTE,
  priorPurchaseAdjustment,
  validatePurchaseNote,
  type PurchaseNoteKind,
} from "@/lib/purchase-note";

type Row = Record<string, string>;
const num = (v: string | undefined) => {
  const n = parseFloat(v || "");
  return Number.isFinite(n) ? n : 0;
};
const ISO_DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "วันที่ไม่ถูกต้อง");

function shapePurchaseNote(r: Row) {
  const kind = (r.Kind === "debit" ? "debit" : "credit") as PurchaseNoteKind;
  return {
    noteId: r.NoteID,
    kind,
    title: PURCHASE_NOTE_TITLE[kind],
    paymentId: r.PaymentID || "",
    payeeId: r.PayeeID || "",
    vendorName: r.VendorNameSnapshot || "",
    vendorTaxId: r.VendorTaxIdSnapshot || "",
    vendorDocNumber: r.VendorDocNumber || "",
    vendorDocDate: r.VendorDocDate || "",
    receivedDate: r.ReceivedDate || "",
    refInvoiceNumber: r.RefInvoiceNumber || "",
    baseAmount: num(r.BaseAmount),
    vatAmount: num(r.VATAmount),
    reason: r.Reason || "",
    fileUrl: r.FileURL || "",
    eventId: r.EventID || "",
    status: (r.Status === "void" ? "void" : "active") as "active" | "void",
    voidReason: r.VoidReason || "",
    createdBy: r.CreatedBy || "",
    createdAt: r.CreatedAt || "",
  };
}

/** ปรับยอดรายการที่จ่ายแล้ว = แก้หลังอนุมัติ → ต้องมีสิทธิ์เดียวกับ CTRL-05 */
function assertCanAdjust(ctx: TRPCContext) {
  if (ctx.org?.role !== "admin" && !ctx.org?.permissions.editPaymentAfterApproval) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "บันทึก/ยกเลิกใบลด/เพิ่มหนี้จากผู้ขายได้เฉพาะผู้มีสิทธิ์แก้ไขหลังอนุมัติ",
    });
  }
}

function inScope(ctx: TRPCContext, eventId: string | undefined): boolean {
  const scope = scopedEventIds(ctx.org);
  return scope === null || scope.includes((eventId || "").trim());
}

export const purchaseNoteRouter = router({
  list: orgProcedure.input(z.object({ paymentId: z.string().optional() }).optional()).query(async ({ ctx, input }) => {
    const sheets = await getSheetsService(ctx.org.orgId);
    await ensureTabsCached(sheets, ctx.org.orgId);
    const all = await sheets.getAll(SHEET_TABS.PURCHASE_NOTES);
    return all
      .filter((r) => inScope(ctx, r.EventID))
      .filter((r) => !input?.paymentId || r.PaymentID === input.paymentId)
      .sort((a, b) => (b.ReceivedDate || "").localeCompare(a.ReceivedDate || ""))
      .map(shapePurchaseNote);
  }),

  create: permissionProcedure("updatePayments")
    .input(
      z.object({
        paymentId: z.string().min(1),
        kind: z.enum(["credit", "debit"]),
        vendorDocNumber: z.string().trim().min(1, "กรุณากรอกเลขที่ใบลด/เพิ่มหนี้ของผู้ขาย").max(60),
        vendorDocDate: ISO_DATE,
        receivedDate: ISO_DATE,
        baseAmount: z.number().positive("มูลค่าต้องมากกว่า 0"),
        vatAmount: z.number().min(0),
        reason: z.string().trim().min(3, "กรุณาระบุเหตุ").max(500),
        fileUrl: z.string().url().optional().or(z.literal("")),
        /** PUR-11b: ตรวจอย่างเดียว ไม่บันทึก — หน้าจอเรียกก่อนอัปโหลดไฟล์ (ไม่มีไฟล์ค้างใน Drive ถ้ายอดไม่ผ่าน) */
        dryRun: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertCanAdjust(ctx);
      const today = todayBangkok();
      if (input.receivedDate > today || input.vendorDocDate > today) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "วันที่ต้องไม่เป็นวันในอนาคต" });
      }
      if (input.receivedDate < input.vendorDocDate) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "วันที่ได้รับต้องไม่ก่อนวันที่บนใบ" });
      }
      // CTRL-01: เดือนที่ได้รับ = งวดภาษีซื้อที่ปรับ ต้องยังไม่ปิด
      await assertPeriodOpen(ctx.org.orgId, input.receivedDate, PURCHASE_NOTE_TITLE[input.kind]);
      const sheets = await getSheetsService(ctx.org.orgId);
      await ensureTabsCached(sheets, ctx.org.orgId);

      // lock ต่อรายการจ่าย — 2 ใบลดหนี้พร้อมกันต้องไม่ลดเกินยอดเดิม
      const result = await withLock(
        `pnote:${ctx.org.orgId}:${input.paymentId}`,
        async () => {
          const payment = await sheets.getById(SHEET_TABS.PAYMENTS, "PaymentID", input.paymentId);
          if (!payment || !inScope(ctx, payment.EventID)) {
            throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบรายการจ่าย" });
          }
          if (!SETTLED_FOR_NOTE.has(payment.Status)) {
            throw new TRPCError({ code: "PRECONDITION_FAILED", message: "บันทึกใบลด/เพิ่มหนี้ได้เฉพาะรายการที่จ่ายแล้ว" });
          }
          const invoiceDate = (payment.ReceiptDate || payment.PaymentDate || "").slice(0, 10);
          if (invoiceDate && input.vendorDocDate < invoiceDate) {
            throw new TRPCError({ code: "BAD_REQUEST", message: `วันที่บนใบต้องไม่ก่อนวันที่ใบกำกับเดิม (${invoiceDate})` });
          }
          if (ctx.org.googleSpreadsheetId) await invalidateTab(ctx.org.googleSpreadsheetId, SHEET_TABS.PURCHASE_NOTES);
          const notes = await sheets.getAll(SHEET_TABS.PURCHASE_NOTES);
          const prior = priorPurchaseAdjustment(notes, input.paymentId);
          const check = validatePurchaseNote({
            kind: input.kind,
            base: input.baseAmount,
            vat: input.vatAmount,
            originalBase: num(payment.TTLAmount),
            originalVat: num(payment.VATAmount),
            prior,
          });
          if (!check.ok) throw new TRPCError({ code: "BAD_REQUEST", message: check.error });
          // PUR-06 (กติกาพี่: เตือน ไม่บล็อก): เลขที่ใบเดียวกันของรายการนี้บันทึกไว้แล้ว
          const dup = notes.some(
            (n) =>
              n.PaymentID === input.paymentId &&
              n.Status !== "void" &&
              (n.VendorDocNumber || "").trim().toLowerCase() === input.vendorDocNumber.trim().toLowerCase(),
          );

          if (input.dryRun) return { noteId: "", description: "", dup, dry: true as const };
          const payee = payment.PayeeID ? await sheets.getById(SHEET_TABS.PAYEES, "PayeeID", payment.PayeeID) : null;
          const noteId = GoogleSheetsService.generateId(input.kind === "credit" ? "PCN" : "PDN");
          const now = new Date().toISOString();
          await sheets.appendRowByHeaders(SHEET_TABS.PURCHASE_NOTES, {
            NoteID: noteId,
            Kind: input.kind,
            PaymentID: input.paymentId,
            PayeeID: payment.PayeeID || "",
            VendorNameSnapshot: payee?.PayeeName || "",
            VendorTaxIdSnapshot: payment.VendorTaxIdSnapshot || payee?.TaxID || "",
            VendorDocNumber: input.vendorDocNumber.trim(),
            VendorDocDate: input.vendorDocDate,
            ReceivedDate: input.receivedDate,
            RefInvoiceNumber: payment.ReceiptNumber || payment.InvoiceNumber || "",
            BaseAmount: roundMoney(input.baseAmount),
            VATAmount: roundMoney(input.vatAmount),
            Reason: input.reason,
            FileURL: input.fileUrl || "",
            EventID: payment.EventID || "",
            Status: "active",
            VoidedAt: "",
            VoidReason: "",
            CreatedBy: ctx.session.displayName || "",
            CreatedByUserId: ctx.session.userId,
            CreatedAt: now,
            UpdatedAt: now,
          });
          return { noteId, description: payment.Description || input.paymentId, dup, dry: false as const };
        },
        { ttlMs: 60_000 },
      );

      if (result.dry) return { success: true, noteId: "", warning: undefined, dryRun: true };
      await safeAuditLog({
        data: {
          orgId: ctx.org.orgId,
          userId: ctx.session.userId,
          action: "create",
          entityType: "purchase_note",
          entityRef: result.noteId,
          summary: `บันทึก${PURCHASE_NOTE_TITLE[input.kind]} ${input.vendorDocNumber} (รายการ ${result.description}) · มูลค่า ${roundMoney(input.baseAmount)} VAT ${roundMoney(input.vatAmount)} · ได้รับ ${input.receivedDate} · ${input.reason}`,
        },
      });
      const warnings = [
        result.dup ? `เลขที่ใบ ${input.vendorDocNumber} ของรายการนี้บันทึกไว้แล้ว — ตรวจว่าไม่ได้บันทึกซ้ำ` : "",
        filedVatPeriodWarning(input.receivedDate, todayBangkok()) || "",
      ].filter(Boolean);
      return { success: true, noteId: result.noteId, warning: warnings.join("\n") || undefined };
    }),

  void: permissionProcedure("updatePayments")
    .input(z.object({ noteId: z.string(), reason: z.string().trim().min(3, "กรุณาระบุเหตุผลการยกเลิก").max(500) }))
    .mutation(async ({ ctx, input }) => {
      assertCanAdjust(ctx);
      const sheets = await getSheetsService(ctx.org.orgId);
      await ensureTabsCached(sheets, ctx.org.orgId);
      const note = await sheets.getById(SHEET_TABS.PURCHASE_NOTES, "NoteID", input.noteId);
      if (!note || !inScope(ctx, note.EventID)) throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบเอกสาร" });
      if (note.Status === "void") return { success: true };
      const kind = (note.Kind === "debit" ? "debit" : "credit") as PurchaseNoteKind;
      // CTRL-01: ยกเลิกใบที่ลงงวดปิดแล้ว = รายงานที่ยื่นแล้วเปลี่ยน → ห้าม
      await assertPeriodOpen(ctx.org.orgId, note.ReceivedDate, `ยกเลิก${PURCHASE_NOTE_TITLE[kind]}`);
      const now = new Date().toISOString();
      await sheets.updateById(SHEET_TABS.PURCHASE_NOTES, "NoteID", input.noteId, {
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
          entityType: "purchase_note",
          entityRef: input.noteId,
          summary: `ยกเลิก${PURCHASE_NOTE_TITLE[kind]} ${note.VendorDocNumber}: ${input.reason}`,
        },
      });
      return { success: true };
    }),
});
