// ===========================================
// SALE-01: ภาษีขายจากใบเสร็จรับเงินที่ออกตรง (ไม่มีใบวางบิล) ที่มี VAT
//
// รายงานภาษีขาย/ภ.พ.30 เดิมอ่านแค่แท็บ TaxInvoices → ใบเสร็จออกตรงแบบมี VAT หลุดจากรายงาน
// กติกา "นับครั้งเดียว":
//   - ใบเสร็จที่มีใบกำกับภาษีคู่ (TaxInvoices.SourceBillingID = BillingID) ที่ออกเลขแล้ว → นับที่ใบกำกับ ไม่นับซ้ำ
//   - ไม่มีใบกำกับที่ออกเลขแล้ว (โหมดรวม = ใบเสร็จ/ใบกำกับ หรือโหมดแยกที่ออกใบกำกับคู่ไม่ได้) → นับที่ใบเสร็จ
//   - ใบเสร็จที่ยกเลิก / ไม่มี VAT → ไม่นับ
// ===========================================

type Row = Record<string, string>;

export type ReceiptOutputVatRow = {
  billingId: string;
  docNumber: string;
  date: string;
  customerId: string;
  customerName: string;
  customerTaxId: string;
  eventId: string;
  projectName: string;
  baseAmount: number;
  vatAmount: number;
  /** combined = ใบเสร็จ/ใบกำกับ · separate = ยังไม่มีใบกำกับคู่ที่ออกเลขแล้ว (ต้องตามออก) */
  mode: "combined" | "separate";
};

const num = (v: string | undefined) => {
  const n = parseFloat(v || "");
  return Number.isFinite(n) ? n : 0;
};

export function receiptOutputVatRows(billings: Row[], taxInvoices: Row[]): ReceiptOutputVatRow[] {
  const covered = new Set(
    taxInvoices.filter((t) => t.Status === "issued" && t.SourceBillingID).map((t) => t.SourceBillingID),
  );
  const out: ReceiptOutputVatRow[] = [];
  for (const b of billings) {
    if (b.DocKind !== "receipt") continue;
    if (b.Status === "void") continue;
    if (b.IsVAT === "FALSE") continue;
    const vat = num(b.VATAmount);
    if (vat <= 0) continue;
    if (covered.has(b.BillingID)) continue;
    const date = (b.ReceiptDate || b.DocDate || "").slice(0, 10);
    if (!date) continue;
    out.push({
      billingId: b.BillingID,
      docNumber: b.ReceiptNumber || b.DocNumber || "",
      date,
      customerId: b.CustomerID || "",
      customerName: b.CustomerNameSnapshot || b.CustomerID || "—",
      customerTaxId: b.CustomerTaxIdSnapshot || "",
      eventId: (b.EventID || "").trim(),
      projectName: b.ProjectName || "",
      baseAmount: num(b.Subtotal),
      vatAmount: vat,
      mode: b.TaxDocMode === "combined" ? "combined" : "separate",
    });
  }
  return out;
}

export type LinkCandidate = { taxInvoiceId: string; docNumber: string; date: string };

/**
 * SALE-01c: ใบกำกับภาษีที่ออกไว้แยก (ไม่ผูกเอกสารต้นทาง) ของลูกค้าเดียวกัน VAT เท่ากัน
 * = น่าจะเป็นใบเดียวกับใบเสร็จ/ใบวางบิลนี้ → ภ.พ.30 นับซ้ำ จนกว่าจะผูก (detective)
 */
export function linkableTaxInvoices(customerId: string, vatAmount: number, taxInvoices: Row[]): LinkCandidate[] {
  if (!customerId || !(vatAmount > 0)) return [];
  return taxInvoices
    .filter(
      (t) =>
        t.Status === "issued" &&
        !t.SourceBillingID &&
        t.CustomerID === customerId &&
        Math.abs(num(t.VATAmount) - vatAmount) < 0.01,
    )
    .map((t) => ({ taxInvoiceId: t.TaxInvoiceID, docNumber: t.DocNumber || "", date: (t.DocDate || "").slice(0, 10) }));
}

/** SALE-01c/01d: เงื่อนไขผูกใบกำกับที่ออกแยกกับใบเสร็จ/ใบวางบิล — null = ผูกได้ */
export function linkSourceBlockReason(
  ti: Row | undefined,
  doc: Row | null | undefined,
  taxInvoices: Row[],
): string | null {
  if (!ti) return "ไม่พบใบกำกับภาษี";
  if (!doc) return "ไม่พบใบเสร็จ/ใบวางบิล";
  if (ti.Status !== "issued") return "ผูกได้เฉพาะใบกำกับภาษีที่ออกเลขแล้ว";
  if (ti.SourceBillingID) return `ใบกำกับ ${ti.DocNumber} ผูกกับเอกสารอื่นอยู่แล้ว`;
  if (doc.Status === "void") return "เอกสารนี้ถูกยกเลิกแล้ว";
  if (doc.DocKind === "receipt" && doc.TaxDocMode === "combined") {
    return "ใบนี้เป็นใบเสร็จรับเงิน/ใบกำกับภาษีอยู่แล้ว — มีใบกำกับ 2 ใบสำหรับรายการเดียว ให้ยกเลิกใบใดใบหนึ่ง";
  }
  if (doc.IsVAT === "FALSE" || !(num(doc.VATAmount) > 0)) return "เอกสารนี้ไม่มี VAT";
  if (ti.CustomerID !== doc.CustomerID) return "ลูกค้าของใบกำกับไม่ตรงกับเอกสาร";
  const already = taxInvoices.find((t) => t.SourceBillingID === doc.BillingID && t.Status === "issued");
  if (already) return `เอกสารนี้มีใบกำกับภาษี ${already.DocNumber} ผูกอยู่แล้ว`;
  return null;
}

export type UncoveredBillingReceipt = {
  billingId: string;
  billingNumber: string;
  receiptNumber: string;
  date: string;
  customerId: string;
  customerName: string;
  customerTaxId: string;
  eventId: string;
  baseAmount: number;
  vatAmount: number;
};

/**
 * SALE-01d: ใบเสร็จที่ออกจากใบวางบิล (มี VAT) แต่ยังไม่มีใบกำกับภาษีที่ออกเลขแล้ว
 * — ไม่ผูกกับใบวางบิลนี้ และไม่ได้ออกจากใบเสนอราคาต้นทางเดียวกัน (กันนับซ้ำ)
 * ไม่รวมในยอดภาษีขาย (ต้องออกใบกำกับก่อน) แต่ต้องแสดงเป็นรายการยกเว้นให้ตามออก
 */
export function uncoveredBillingReceipts(billings: Row[], taxInvoices: Row[]): UncoveredBillingReceipt[] {
  const issued = taxInvoices.filter((t) => t.Status === "issued");
  const bySource = new Set(issued.map((t) => t.SourceBillingID).filter(Boolean));
  const byQuotation = new Set(issued.map((t) => t.SourceQuotationID).filter(Boolean));
  const out: UncoveredBillingReceipt[] = [];
  for (const b of billings) {
    if (b.DocKind === "receipt") continue;
    if (!b.ReceiptNumber || b.Status === "void") continue;
    if (b.IsVAT === "FALSE") continue;
    const vat = num(b.VATAmount);
    if (vat <= 0) continue;
    if (bySource.has(b.BillingID)) continue;
    if (b.SourceQuotationID && byQuotation.has(b.SourceQuotationID)) continue;
    const date = (b.ReceiptDate || b.PaidDate || "").slice(0, 10);
    if (!date) continue;
    out.push({
      billingId: b.BillingID,
      billingNumber: b.DocNumber || "",
      receiptNumber: b.ReceiptNumber,
      date,
      customerId: b.CustomerID || "",
      customerName: b.CustomerNameSnapshot || b.CustomerID || "—",
      customerTaxId: b.CustomerTaxIdSnapshot || "",
      eventId: (b.EventID || "").trim(),
      baseAmount: num(b.Subtotal),
      vatAmount: vat,
    });
  }
  return out;
}

/**
 * SALE-01b: เงื่อนไขการยกเลิกใบเสร็จออกตรง — ใบกำกับคู่ (issued/draft) ต้องจัดการก่อน
 * และต้องมีเหตุผลเมื่อใบเสร็จเป็นใบกำกับภาษีด้วย (โหมดรวม) หรือมีใบกำกับคู่ที่ออกเลขแล้ว
 */
export function receiptVoidPlan(receipt: Row, taxInvoices: Row[]) {
  const paired = taxInvoices.filter(
    (t) => t.SourceBillingID === receipt.BillingID && (t.Status === "issued" || t.Status === "draft"),
  );
  const issued = paired.find((t) => t.Status === "issued");
  return {
    /** ใบกำกับคู่ที่ต้องยกเลิก (issued) หรือลบ (draft) ก่อนยกเลิกใบเสร็จ */
    paired,
    issued,
    reasonRequired: receipt.TaxDocMode === "combined" || !!issued,
  };
}

/** SALE-13: ใบเสร็จออกตรงที่แก้ไม่ได้แล้ว — คืนข้อความเหตุผล หรือ null = แก้ได้ */
export function receiptEditBlockReason(receipt: Row, taxInvoices: Row[]): string | null {
  if (receipt.Status === "void") return "ใบเสร็จรับเงินนี้ถูกยกเลิกแล้ว แก้ไขไม่ได้";
  // ใบเสร็จรับเงิน/ใบกำกับภาษี (โหมดรวม) = ใบกำกับภาษีที่ส่งลูกค้าแล้ว — แก้ยอด/ลูกค้า/วันที่ไม่ได้ (ม.86/9-10)
  if (receipt.TaxDocMode === "combined") {
    return "ใบนี้เป็นใบเสร็จรับเงิน/ใบกำกับภาษี — แก้ไขไม่ได้ ให้ยกเลิก (ระบุเหตุผล) แล้วออกใบใหม่";
  }
  const issued = taxInvoices.find((t) => t.SourceBillingID === receipt.BillingID && t.Status === "issued");
  if (issued) {
    return `ใบเสร็จนี้มีใบกำกับภาษีคู่ ${issued.DocNumber} แล้ว — แก้ไขไม่ได้ ให้ยกเลิกใบกำกับภาษีก่อน (หรือออกใบลดหนี้/เพิ่มหนี้)`;
  }
  return null;
}

/**
 * SALE-19: ใบวางบิลที่แก้ไม่ได้แล้ว — ออกใบเสร็จ หรือมีใบกำกับภาษีที่ออกเลขแล้ว (เอกสารที่ส่งลูกค้าไปแล้ว
 * อ่านข้อมูลจากแถวนี้ / ต้องตรงกับแถวนี้) · คืนข้อความเหตุผล หรือ null = แก้ได้
 */
export function billingEditBlockReason(billing: Row, taxInvoices: Row[]): string | null {
  if (billing.Status === "void") return "ใบวางบิลนี้ถูกยกเลิกแล้ว แก้ไขไม่ได้";
  if (billing.DocKind === "receipt") return "เอกสารนี้เป็นใบเสร็จรับเงิน — แก้ไขจากเมนูใบเสร็จรับเงิน";
  if (billing.ReceiptNumber) {
    return `ใบวางบิลนี้ออกใบเสร็จรับเงิน ${billing.ReceiptNumber} แล้ว — แก้ไขไม่ได้ (ใบเสร็จที่ส่งลูกค้าแล้วต้องไม่เปลี่ยน) · ยกเลิกใบเสร็จที่เมนูใบเสร็จรับเงินก่อน แล้วแก้ใบวางบิลและออกใบเสร็จใหม่`;
  }
  const issued = taxInvoices.find((t) => t.SourceBillingID === billing.BillingID && t.Status === "issued");
  if (issued) {
    return `ใบวางบิลนี้มีใบกำกับภาษี ${issued.DocNumber} แล้ว — แก้ไขไม่ได้ ให้ยกเลิกใบกำกับภาษีก่อน (หรือออกใบลดหนี้/เพิ่มหนี้)`;
  }
  return null;
}

/**
 * SALE-19: ใบวางบิลรับเงินครบ (ยังไม่มีเอกสารตาม) แล้วแก้ยอด — ยอดรับเงินเดิมเป็นฐานไหน
 * (บุคคล/รายรับที่หักภาษี = ยอดรับจริงหลังหัก · ปกติ = ยอดรวม) → ยอดใหม่คิดฐานเดียวกัน
 */
export function settledAmountAfterEdit(
  existing: Row,
  totals: { grandTotal: number; amountReceivable: number },
): number {
  const paid = parseFloat(existing.PaidAmount || "") || 0;
  const oldGrand = parseFloat(existing.GrandTotal || "") || 0;
  const oldReceivable = parseFloat(existing.AmountReceivable || "") || 0;
  const onReceivable = Math.abs(paid - oldReceivable) < 0.005 && Math.abs(oldReceivable - oldGrand) >= 0.005;
  return onReceivable ? totals.amountReceivable : totals.grandTotal;
}

/** SALE-14: โหมดเอกสารภาษีของใบเสร็จออกตรงหลังแก้ */
export function nextReceiptTaxDocMode(
  current: string,
  hasVatNow: boolean,
  hadVatBefore: boolean,
  orgMode: "combined" | "separate",
): "" | "combined" | "separate" {
  if (!hasVatNow) return "";
  if (current === "combined" || current === "separate") return current;
  // ใบเก่าที่มี VAT อยู่แล้วก่อนมีโหมด (ออกก่อน SALE-01) → คงเดิม ไม่เปลี่ยนหัว/ไม่ออกใบกำกับคู่ย้อนหลัง
  // (ลูกค้าอาจออกใบกำกับแยกเองไว้แล้ว — ออกซ้ำ = ภาษีขายนับซ้ำ)
  if (hadVatBefore) return "";
  return orgMode;
}
