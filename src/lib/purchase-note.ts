// ===========================================
// PUR-11: ใบลดหนี้ / ใบเพิ่มหนี้ที่ "ได้รับจากผู้ขาย" (ฝั่งซื้อ)
//
// ม.82/10 + ม.82/9: ผู้ซื้อที่ได้รับใบลดหนี้ ต้องนำภาษีตามใบลดหนี้ไปหักออกจากภาษีซื้อ
//   "ในเดือนภาษีที่ได้รับใบลดหนี้" · ใบเพิ่มหนี้ = ภาษีซื้อเพิ่มในเดือนที่ได้รับ
// ไม่แก้รายการจ่ายเดิม (รายงานเดือนเดิมที่ยื่นแล้วต้องไม่เปลี่ยน) — เก็บเป็นเอกสารแยกในแท็บ PurchaseNotes
// ผลต่อภาษีซื้อเฉพาะเมื่อรายการเดิมเป็นภาษีซื้อที่ขอคืนได้ · ผลต่อต้นทุน (P&L) ทุกรายการ
// ===========================================

import { roundMoney } from "@/lib/money";
import { isInputVatClaimable } from "./input-vat-rules";

export type PurchaseNoteKind = "credit" | "debit";

export const PURCHASE_NOTE_TITLE: Record<PurchaseNoteKind, string> = {
  credit: "ใบลดหนี้จากผู้ขาย",
  debit: "ใบเพิ่มหนี้จากผู้ขาย",
};

type Row = Record<string, string | undefined>;
const num = (v: string | number | undefined) => {
  const n = typeof v === "number" ? v : parseFloat(v || "");
  return Number.isFinite(n) ? n : 0;
};

export const SETTLED_FOR_NOTE = new Set(["paid", "cleared"]);

/** ยอดที่ปรับไปแล้วของรายการจ่ายนี้ (ใบที่ยังใช้อยู่) — ลบ = ลดหนี้สุทธิ */
export function priorPurchaseAdjustment(notes: Row[], paymentId: string): { base: number; vat: number } {
  let base = 0;
  let vat = 0;
  for (const n of notes) {
    if (n.PaymentID !== paymentId || n.Status === "void") continue;
    const sign = n.Kind === "debit" ? 1 : -1;
    base += sign * num(n.BaseAmount);
    vat += sign * num(n.VATAmount);
  }
  return { base: roundMoney(base), vat: roundMoney(vat) };
}

/**
 * ตรวจยอดใบลด/เพิ่มหนี้
 *   - ฐาน > 0 · VAT ≥ 0
 *   - รายการเดิมไม่มี VAT → ใบนี้ต้องไม่มี VAT
 *   - VAT ไม่เกิน 7% ของฐาน (+ เศษปัด 1 บาท — ตามใบจริงของผู้ขาย)
 *   - ใบลดหนี้: ลดรวมแล้วต้องไม่ทำให้ยอดติดลบ (ฐานและ VAT)
 */
export function validatePurchaseNote(p: {
  kind: PurchaseNoteKind;
  base: number;
  vat: number;
  originalBase: number;
  originalVat: number;
  prior: { base: number; vat: number };
}): { ok: true } | { ok: false; error: string } {
  const base = roundMoney(p.base);
  const vat = roundMoney(p.vat);
  if (!(base > 0)) return { ok: false, error: "มูลค่าที่ลด/เพิ่ม (ก่อน VAT) ต้องมากกว่า 0" };
  if (vat < 0) return { ok: false, error: "ภาษีต้องไม่ติดลบ" };
  if (p.originalVat <= 0 && vat > 0) return { ok: false, error: "รายการเดิมไม่มี VAT — ใบลด/เพิ่มหนี้ต้องไม่มี VAT" };
  if (vat > roundMoney(base * 0.07) + 1) {
    return { ok: false, error: `ภาษีเกิน 7% ของมูลค่าที่ลด/เพิ่ม (ไม่เกิน ${roundMoney(base * 0.07).toFixed(2)} บาท)` };
  }
  if (p.kind === "credit") {
    const remainingBase = roundMoney(p.originalBase + p.prior.base);
    const remainingVat = roundMoney(p.originalVat + p.prior.vat);
    if (base > remainingBase + 0.005) {
      return { ok: false, error: `ลดได้ไม่เกินมูลค่าคงเหลือ ${remainingBase.toFixed(2)} บาท (หักใบลดหนี้ก่อนหน้าแล้ว)` };
    }
    if (vat > remainingVat + 0.005) {
      return { ok: false, error: `ลดภาษีได้ไม่เกิน ${remainingVat.toFixed(2)} บาท (หักใบลดหนี้ก่อนหน้าแล้ว)` };
    }
  }
  return { ok: true };
}

/** ผลต่อภาษีซื้อ (มีเครื่องหมาย) — 0 ถ้ารายการเดิมขอคืนภาษีซื้อไม่ได้ */
export function purchaseNoteVatEffect(note: Row, payment: Row | undefined): number {
  if (!payment || note.Status === "void") return 0;
  if (!isInputVatClaimable(payment)) return 0;
  return (note.Kind === "debit" ? 1 : -1) * num(note.VATAmount);
}

/** ผลต่อต้นทุน (มีเครื่องหมาย) — ฐาน + VAT ที่ขอคืนไม่ได้ (เหมือน expenseCostOf) */
export function purchaseNoteCostEffect(
  note: { kind: string; status: string; baseAmount: number; vatAmount: number },
  payment: { documentType?: string; nonDeductibleVat?: string; categoryMain?: string } | undefined,
  vatRegistered: boolean,
): number {
  if (note.status === "void") return 0;
  const claimable =
    vatRegistered &&
    !!payment &&
    isInputVatClaimable({ DocumentType: payment.documentType, NonDeductibleVat: payment.nonDeductibleVat, CategoryMain: payment.categoryMain });
  return (note.kind === "debit" ? 1 : -1) * ((note.baseAmount || 0) + (claimable ? 0 : note.vatAmount || 0));
}

/** รายการจ่ายนี้มีใบลด/เพิ่มหนี้ที่ยังใช้อยู่ (ห้ามยกเลิก/ลบรายการเดิมก่อน) */
export function activePurchaseNotes(notes: Row[], paymentId: string): Row[] {
  return notes.filter((n) => n.PaymentID === paymentId && n.Status !== "void");
}

/**
 * แถวปรับภาษีซื้อจากใบลด/เพิ่มหนี้ (สำหรับ ภ.พ.30 / รายงานภาษีซื้อ)
 * เฉพาะใบที่ยังใช้อยู่ + รายการเดิมเป็นภาษีซื้อที่ขอคืนได้ · ยอดมีเครื่องหมาย (ลดหนี้ = ลบ)
 */
export function purchaseNoteInputRows<N extends Row, P extends Row>(
  notes: N[],
  paymentsById: Map<string, P>,
): { note: N; payment: P; date: string; base: number; vat: number; kind: "credit_note" | "debit_note" }[] {
  const out: { note: N; payment: P; date: string; base: number; vat: number; kind: "credit_note" | "debit_note" }[] = [];
  for (const n of notes) {
    if (n.Status === "void" || !n.ReceivedDate) continue;
    const payment = paymentsById.get(n.PaymentID || "");
    if (!payment || !isInputVatClaimable(payment)) continue;
    const sign = n.Kind === "debit" ? 1 : -1;
    out.push({
      note: n,
      payment,
      date: (n.ReceivedDate || "").slice(0, 10),
      base: roundMoney(sign * num(n.BaseAmount)),
      vat: roundMoney(sign * num(n.VATAmount)),
      kind: n.Kind === "debit" ? "debit_note" : "credit_note",
    });
  }
  return out;
}
