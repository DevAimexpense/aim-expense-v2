// UAT ข้อค้างจาก audit (SALE-01c, SALE-01d, RPT-02, PUR-02c)
// รัน: npx -y tsx scripts/uat_20261116x1528/audit-open-items.test.ts
(async () => {
  const { linkableTaxInvoices, linkSourceBlockReason, uncoveredBillingReceipts, receiptOutputVatRows } = await import(
    "../../src/server/lib/receipt-output-vat"
  );
  const { computeDashboardPL } = await import("../../src/lib/dashboard-pl");
  const { allocateInvoiceVat, calculatePayment } = await import("../../src/lib/calculations");

  // ---- SALE-01c: ใบเสร็จเก่า + ใบกำกับที่ลูกค้าออกแยกเอง (ไม่ผูก) ----
  const tis: Record<string, string>[] = [
    { TaxInvoiceID: "TIA", DocNumber: "TI-2026-10-002", Status: "issued", CustomerID: "C1", VATAmount: "700", SourceBillingID: "", DocDate: "2026-10-05" },
    { TaxInvoiceID: "TIB", DocNumber: "TI-2026-10-003", Status: "issued", CustomerID: "C2", VATAmount: "700", SourceBillingID: "" },
    { TaxInvoiceID: "TIC", DocNumber: "TI-2026-10-004", Status: "issued", CustomerID: "C1", VATAmount: "350", SourceBillingID: "" },
    { TaxInvoiceID: "TID", DocNumber: "TI-2026-10-005", Status: "issued", CustomerID: "C1", VATAmount: "700", SourceBillingID: "BLX" },
    { TaxInvoiceID: "TIQ", DocNumber: "TI-2026-10-006", Status: "issued", CustomerID: "C3", VATAmount: "140", SourceQuotationID: "Q1" },
  ];
  const oldReceipt = { BillingID: "RC1", DocKind: "receipt", Status: "paid", CustomerID: "C1", IsVAT: "TRUE", VATAmount: "700", TaxDocMode: "" };
  const cands = linkableTaxInvoices("C1", 700, tis).map((c) => c.docNumber);
  const rowsBefore = receiptOutputVatRows([{ ...oldReceipt, ReceiptNumber: "RC-2026-10-001", ReceiptDate: "2026-10-05", Subtotal: "10000" }], tis);
  const linkedTis = tis.map((t) => (t.TaxInvoiceID === "TIA" ? { ...t, SourceBillingID: "RC1" } : t));
  const rowsAfter = receiptOutputVatRows([{ ...oldReceipt, ReceiptNumber: "RC-2026-10-001", ReceiptDate: "2026-10-05", Subtotal: "10000" }], linkedTis);

  // ---- SALE-01d: ใบเสร็จจากใบวางบิล ----
  const billings: Record<string, string>[] = [
    { BillingID: "BL1", DocNumber: "BL-2026-11-001", ReceiptNumber: "RC-2026-11-001", ReceiptDate: "2026-11-03", Status: "paid", IsVAT: "TRUE", VATAmount: "70", Subtotal: "1000", CustomerID: "C1" },
    { BillingID: "BL2", DocNumber: "BL-2026-11-002", ReceiptNumber: "RC-2026-11-002", ReceiptDate: "2026-11-04", Status: "paid", IsVAT: "TRUE", VATAmount: "70", Subtotal: "1000", CustomerID: "C1" },
    { BillingID: "BL3", DocNumber: "BL-2026-11-003", ReceiptNumber: "RC-2026-11-003", ReceiptDate: "2026-11-05", Status: "paid", IsVAT: "FALSE", VATAmount: "0", Subtotal: "1000" },
    { BillingID: "BL4", DocNumber: "BL-2026-11-004", ReceiptNumber: "", Status: "sent", IsVAT: "TRUE", VATAmount: "70", Subtotal: "1000" },
    { BillingID: "BL5", DocNumber: "BL-2026-11-005", ReceiptNumber: "RC-2026-11-005", ReceiptDate: "2026-11-06", Status: "paid", IsVAT: "TRUE", VATAmount: "140", Subtotal: "2000", SourceQuotationID: "Q1", CustomerID: "C3" },
  ];
  const tis01d = [...tis, { TaxInvoiceID: "TIE", DocNumber: "TI-2026-11-001", Status: "issued", SourceBillingID: "BL2", CustomerID: "C1", VATAmount: "70" }];
  const uncovered = uncoveredBillingReceipts(billings, tis01d).map((r) => r.billingId);

  // ---- RPT-02 ----
  const pl = computeDashboardPL({
    payments: [],
    billings: [
      { eventId: "E1", status: "paid", docDate: "2026-11-02", subtotal: 1000, sourceQuotationId: "Q1" },
    ],
    taxInvoices: [
      { eventId: "E1", status: "issued", docDate: "2026-11-03", subtotal: 50000, sourceBillingId: "", sourceQuotationId: "" }, // สร้างเอง → นับ
      { eventId: "E1", status: "issued", docDate: "2026-11-03", subtotal: 1000, sourceBillingId: "BL1", sourceQuotationId: "" }, // มีใบวางบิล → ไม่นับซ้ำ
      { eventId: "E1", status: "issued", docDate: "2026-11-03", subtotal: 1000, sourceBillingId: "", sourceQuotationId: "Q1" }, // ใบเสนอราคาเดียวกับใบวางบิล → ไม่นับซ้ำ
      { eventId: "E1", status: "issued", docDate: "2026-11-04", subtotal: 3000, sourceBillingId: "", sourceQuotationId: "Q9" }, // จากใบเสนอราคาที่ไม่มีใบวางบิล → นับ
      { eventId: "E1", status: "void", docDate: "2026-11-04", subtotal: 9999, sourceBillingId: "", sourceQuotationId: "" }, // ยกเลิก → ไม่นับ
      { eventId: "E1", status: "issued", docDate: "2026-10-30", subtotal: 7000, sourceBillingId: "", sourceQuotationId: "" }, // คนละเดือน
    ],
    month: "2026-11",
    eventId: "all",
    vatRegistered: true,
  });

  // ---- PUR-02c ----
  const items = [
    { amount: 1070, hasVat: true },
    { amount: 500, hasVat: false },
    { amount: 2140, hasVat: true },
  ];
  const alloc = allocateInvoiceVat(items, 150);
  const editCalc = calculatePayment({ costPerUnit: 1200, days: 1, numberOfPeople: 1, pctWTH: 0, isVatPayee: true, vatOverride: 35 });

  const CASES: { name: string; got: unknown; want: unknown }[] = [
    { name: "SALE-01c: ใบกำกับที่ออกแยก ลูกค้า+VAT ตรง → เสนอผูก (ไม่เสนอใบคนละลูกค้า/ยอด/ผูกแล้ว)", got: cands, want: ["TI-2026-10-002"] },
    { name: "SALE-01c: ก่อนผูก ใบเสร็จถูกนับ (คู่กับใบกำกับ = นับซ้ำ)", got: rowsBefore.length, want: 1 },
    { name: "SALE-01c: หลังผูก ใบเสร็จไม่ถูกนับ (นับที่ใบกำกับครั้งเดียว)", got: rowsAfter.length, want: 0 },
    { name: "SALE-01c: ผูกได้เมื่อเงื่อนไขครบ", got: linkSourceBlockReason(tis[0], oldReceipt, tis), want: null },
    { name: "SALE-01c: ผูกไม่ได้ — คนละลูกค้า", got: linkSourceBlockReason(tis[1], oldReceipt, tis) !== null, want: true },
    { name: "SALE-01c: ผูกไม่ได้ — ใบกำกับผูกเอกสารอื่นแล้ว", got: linkSourceBlockReason(tis[3], oldReceipt, tis) !== null, want: true },
    { name: "SALE-01c: ผูกไม่ได้ — ใบเสร็จโหมดรวม (เป็นใบกำกับอยู่แล้ว)", got: linkSourceBlockReason(tis[0], { ...oldReceipt, TaxDocMode: "combined" }, tis) !== null, want: true },
    { name: "SALE-01c: ผูกไม่ได้ — ใบกำกับยังไม่ออกเลข", got: linkSourceBlockReason({ ...tis[0], Status: "draft" }, oldReceipt, tis) !== null, want: true },
    { name: "SALE-01d: ใบเสร็จจากใบวางบิลมี VAT ไม่มีใบกำกับ → อยู่ในรายการยกเว้น · มีใบกำกับ/ไม่มี VAT/ยังไม่ออกใบเสร็จ/ใบกำกับจากใบเสนอราคาเดียวกัน → ไม่อยู่", got: uncovered, want: ["BL1"] },
    { name: "RPT-02: รายได้ = ใบวางบิล 1,000 + ใบกำกับไม่มีใบวางบิล 50,000 + 3,000 (ไม่นับซ้ำ/ยกเลิก/คนละเดือน)", got: [pl.revenue, pl.revenueFromTaxInvoices], want: [54000, 53000] },
    { name: "RPT-02: ไม่ส่งใบกำกับ → รายได้เท่าเดิม (ไม่ regress)", got: computeDashboardPL({ payments: [], billings: [{ eventId: "E1", status: "paid", docDate: "2026-11-02", subtotal: 1000 }], month: "2026-11", eventId: "all", vatRegistered: true }).revenue, want: 1000 },
    { name: "PUR-02c: กระจาย VAT ตามใบ 150 ตามสัดส่วน (รายการไม่มี VAT = 0) ผลรวมตรงใบ", got: [alloc, Math.round(alloc.reduce((a, b) => a + b, 0) * 100) / 100], want: [[50, 0, 100], 150] },
    { name: "PUR-02c: ไม่มีรายการ VAT → 0 ทั้งหมด", got: allocateInvoiceVat([{ amount: 100, hasVat: false }], 7), want: [0] },
    { name: "PUR-02c: แก้ยอดเป็น 1,200 โดยคง VAT ตามใบ 35 → VAT 35 (เดิมกลายเป็น 84)", got: [editCalc.vatAmount, editCalc.gttlAmount], want: [35, 1235] },
  ];
  let fail = 0;
  for (const c of CASES) {
    const ok = JSON.stringify(c.got) === JSON.stringify(c.want);
    if (!ok) fail++;
    console.log(`${ok ? "✅" : "❌"} ${c.name}${ok ? "" : `\n     got  ${JSON.stringify(c.got)}\n     want ${JSON.stringify(c.want)}`}`);
  }
  console.log(`\nผ่าน ${CASES.length - fail} · ไม่ผ่าน ${fail}`);
  process.exit(fail ? 1 : 0);
})();
