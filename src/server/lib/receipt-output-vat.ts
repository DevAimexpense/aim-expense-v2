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
