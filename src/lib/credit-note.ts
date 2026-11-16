// ===========================================
// SALE-02: ใบลดหนี้ / ใบเพิ่มหนี้ — ตามประมวลรัษฎากร (Pim 16/11/2569: "เอาที่ถูกต้อง")
//
// ม.82/10 + ม.86/10 ใบลดหนี้ — ออกเมื่อมูลค่าลดลงหลังออกใบกำกับ เพราะ:
//   ลดราคาสินค้า (ไม่ตรงตามตัวอย่าง/คำพรรณนา/ชำรุด/บกพร่อง) · ลดราคาบริการ (ไม่ตรงตามสัญญา/บกพร่อง)
//   รับคืนสินค้า · คำนวณราคาผิดพลาดสูงกว่าที่เป็นจริง · คืนเงินมัดจำ/เงินล่วงหน้า (บริการ)
//   ลดราคาเพราะเหตุอื่นตามที่อธิบดีกำหนด
// ม.82/9 + ม.86/9 ใบเพิ่มหนี้ — มูลค่าเพิ่มขึ้นเพราะ: สินค้าเกินกว่าที่ตกลง · บริการเกินกว่าที่ตกลง
//   · คำนวณราคาผิดพลาดต่ำกว่าที่เป็นจริง · เพิ่มราคาเพราะเหตุอื่นตามที่อธิบดีกำหนด
//
// รายการที่ต้องมี (ม.86/9-10): คำว่า "ใบลดหนี้"/"ใบเพิ่มหนี้" · ชื่อ ที่อยู่ เลขผู้เสียภาษี (+สาขา) ผู้ออก
//   · ชื่อ ที่อยู่ ผู้ซื้อ (+เลข/สาขา) · เลขที่และวันที่ออก · เลขที่/วันที่ใบกำกับเดิม · มูลค่าตามใบกำกับเดิม
//   · มูลค่าที่ถูกต้อง · ผลต่าง · ภาษีของผลต่าง · คำอธิบายเหตุ
// งวดภาษี: ผู้ออกนำไปลด/เพิ่มภาษีขายในเดือนที่ **ออกใบ** (ไม่ย้อนแก้เดือนของใบกำกับเดิม)
// ===========================================

import { roundMoney } from "@/lib/money";
export type NoteKind = "credit" | "debit";

export const CREDIT_NOTE_REASONS = [
  { value: "goods_defect", label: "ลดราคาสินค้า — ไม่ตรงตามตัวอย่าง/คำพรรณนา หรือชำรุดบกพร่อง" },
  { value: "service_defect", label: "ลดราคาค่าบริการ — ไม่ตรงตามสัญญา หรือบกพร่อง" },
  { value: "goods_returned", label: "รับคืนสินค้า" },
  { value: "overcharged", label: "คำนวณราคาผิดพลาด สูงกว่าที่เป็นจริง" },
  { value: "deposit_refund", label: "คืนเงินมัดจำ/เงินรับล่วงหน้า (ค่าบริการ)" },
  { value: "other", label: "เหตุอื่นตามที่อธิบดีกำหนด (ระบุในคำอธิบาย)" },
] as const;

export const DEBIT_NOTE_REASONS = [
  { value: "goods_excess", label: "เพิ่มราคาสินค้า — ส่งมอบเกินกว่าที่ตกลง" },
  { value: "service_excess", label: "เพิ่มราคาค่าบริการ — ให้บริการเกินกว่าที่ตกลง" },
  { value: "undercharged", label: "คำนวณราคาผิดพลาด ต่ำกว่าที่เป็นจริง" },
  { value: "other", label: "เหตุอื่นตามที่อธิบดีกำหนด (ระบุในคำอธิบาย)" },
] as const;

export function noteReasons(kind: NoteKind) {
  return kind === "credit" ? CREDIT_NOTE_REASONS : DEBIT_NOTE_REASONS;
}

export function noteReasonLabel(kind: NoteKind, code: string): string {
  return (noteReasons(kind) as readonly { value: string; label: string }[]).find((r) => r.value === code)?.label || "";
}

export const NOTE_TITLE: Record<NoteKind, string> = { credit: "ใบลดหนี้", debit: "ใบเพิ่มหนี้" };

const round2 = roundMoney; // RPT-09

type Row = Record<string, string | undefined>;
const num = (v: string | undefined) => {
  const n = parseFloat(v || "");
  return Number.isFinite(n) ? n : 0;
};

/** ผลรวมการปรับของใบลด/เพิ่มหนี้ที่ออกแล้ว (ไม่นับที่ยกเลิก) ของเอกสารต้นทาง — + เพิ่ม / − ลด */
export function priorAdjustment(notes: Row[], sourceId: string): number {
  return round2(
    notes
      .filter((n) => n.SourceID === sourceId && n.Status === "issued")
      .reduce((s, n) => s + (n.Kind === "debit" ? 1 : -1) * num(n.DiffAmount), 0),
  );
}

/**
 * คำนวณใบลด/เพิ่มหนี้จาก "มูลค่าที่ถูกต้อง" (ก่อน VAT) — คืนผลต่าง + VAT 7% ของผลต่าง หรือข้อความผิดพลาด
 * originalSubtotal = มูลค่าตามใบกำกับเดิม · prior = ปรับไปแล้วโดยใบก่อน ๆ → มูลค่าปัจจุบัน = original + prior
 */
export function computeNote(params: {
  kind: NoteKind;
  originalSubtotal: number;
  prior: number;
  correctSubtotal: number;
  vatRate?: number;
}):
  | { ok: true; currentValue: number; diff: number; vat: number; total: number }
  | { ok: false; error: string } {
  const rate = params.vatRate ?? 0.07;
  const currentValue = round2(params.originalSubtotal + params.prior);
  const correct = round2(params.correctSubtotal);
  if (!Number.isFinite(correct) || correct < 0) return { ok: false, error: "มูลค่าที่ถูกต้องต้องไม่ติดลบ" };
  const diff = round2(params.kind === "credit" ? currentValue - correct : correct - currentValue);
  if (diff <= 0) {
    return {
      ok: false,
      error:
        params.kind === "credit"
          ? `ใบลดหนี้: มูลค่าที่ถูกต้องต้องน้อยกว่ามูลค่าปัจจุบัน (${currentValue.toLocaleString("th-TH")} บาท)`
          : `ใบเพิ่มหนี้: มูลค่าที่ถูกต้องต้องมากกว่ามูลค่าปัจจุบัน (${currentValue.toLocaleString("th-TH")} บาท)`,
    };
  }
  const vat = round2(diff * rate);
  return { ok: true, currentValue, diff, vat, total: round2(diff + vat) };
}

export type NoteOutputVatRow = {
  noteId: string;
  kind: NoteKind;
  docNumber: string;
  date: string;
  sourceDocNumber: string;
  customerId: string;
  customerName: string;
  customerTaxId: string;
  eventId: string;
  /** ลดหนี้ = ติดลบ · เพิ่มหนี้ = บวก */
  baseAmount: number;
  vatAmount: number;
};

/** ภาษีขายจากใบลด/เพิ่มหนี้ — ลงงวดตามวันที่ออกใบ (ม.82/9-10) · ใบที่ยกเลิกไม่นับ */
export function noteOutputVatRows(notes: Row[]): NoteOutputVatRow[] {
  return notes
    .filter((n) => n.Status === "issued" && n.DocDate)
    .map((n) => {
      const sign = n.Kind === "debit" ? 1 : -1;
      return {
        noteId: n.NoteID || "",
        kind: (n.Kind === "debit" ? "debit" : "credit") as NoteKind,
        docNumber: n.DocNumber || "",
        date: (n.DocDate || "").slice(0, 10),
        sourceDocNumber: n.SourceDocNumber || "",
        customerId: n.CustomerID || "",
        customerName: n.CustomerNameSnapshot || "—",
        customerTaxId: n.CustomerTaxIdSnapshot || "",
        eventId: (n.EventID || "").trim(),
        baseAmount: round2(sign * num(n.DiffAmount)),
        vatAmount: round2(sign * num(n.VATAmount)),
      };
    });
}
