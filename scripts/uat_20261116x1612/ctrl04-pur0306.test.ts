// UAT CTRL-04 (แก้หลังอนุมัติ → รออนุมัติใหม่), PUR-03/04 (ภาษีซื้อต้องห้าม/อย่างย่อ), PUR-06 (บิลซ้ำ เตือน)
// รัน: npx -y tsx scripts/uat_20261116x1612/ctrl04-pur0306.test.ts
(async () => {
  const { materialChanges, statusAfterReapproval } = await import("../../src/lib/payment-reapproval");
  const { resolveNonDeductibleVat, isInputVatClaimable } = await import("../../src/lib/input-vat-rules");
  const { findDuplicateBills, normalizeDocNo, duplicateWarningText } = await import("../../src/lib/duplicate-bill");
  const { expenseCostOf } = await import("../../src/lib/dashboard-pl");

  const paid = { TTLAmount: "1000", VATAmount: "70", WTHAmount: "30", GTTLAmount: "1040", PayeeID: "P1", CompanyBankID: "B1", ExpenseType: "account", DocumentType: "tax_invoice", EventID: "E1" };

  const pays: Record<string, string>[] = [
    { PaymentID: "A", Status: "paid", VendorTaxIdSnapshot: "0105556000001", InvoiceNumber: "INV-2026/0012", ReceiptNumber: "", Description: "ค่าทำความสะอาด", GTTLAmount: "1070" },
    { PaymentID: "B", Status: "cancelled", VendorTaxIdSnapshot: "0105556000001", InvoiceNumber: "INV-0099", Description: "x", GTTLAmount: "10" },
    { PaymentID: "C", Status: "pending", VendorTaxIdSnapshot: "0105556000002", ReceiptNumber: "INV-2026/0012", Description: "y", GTTLAmount: "20" },
  ];
  const base = { eventId: "E1", status: "paid", ttlAmount: 1000, vatAmount: 70, receiptDate: "2026-11-01", paymentDate: "", dueDate: "", createdAt: "" };

  const CASES: { name: string; got: unknown; want: unknown }[] = [
    // CTRL-04
    { name: "CTRL-04: แก้ยอดหลังจ่าย → สาระสำคัญเปลี่ยน", got: materialChanges(paid, { TTLAmount: 1200, VATAmount: 84, WTHAmount: 36, GTTLAmount: 1248 }).length > 0, want: true },
    { name: "CTRL-04: เปลี่ยนผู้รับเงิน / บัญชี / ประเภทเอกสาร → สาระสำคัญ", got: [materialChanges(paid, { PayeeID: "P2" }), materialChanges(paid, { CompanyBankID: "B2" }), materialChanges(paid, { DocumentType: "receipt" })].map((c) => c.length > 0), want: [true, true, true] },
    { name: "CTRL-04: ส่งค่าเดิมทุกช่อง (ฟอร์มแก้ไขส่งครบ) → ไม่ต้องอนุมัติใหม่", got: materialChanges(paid, { TTLAmount: 1000, VATAmount: 70, WTHAmount: 30, GTTLAmount: 1040, PayeeID: "P1", CompanyBankID: "B1", ExpenseType: "account", DocumentType: "tax_invoice", EventID: "E1" }), want: [] },
    { name: "CTRL-04: แก้แค่หมายเหตุ/หมวด → ไม่ต้องอนุมัติใหม่", got: materialChanges(paid, { Notes: "x", CategoryMain: "ค่าเดินทาง" }), want: [] },
    { name: "CTRL-04: อนุมัติใหม่ → คืนสถานะเดิม (จ่ายแล้ว/เคลียร์แล้ว) · อนุมัติแล้ว/ใหม่ → approved", got: [statusAfterReapproval("paid"), statusAfterReapproval("cleared"), statusAfterReapproval("approved"), statusAfterReapproval("")], want: ["paid", "cleared", "approved", "approved"] },
    // PUR-03/04
    { name: "PUR-03: หมวดค่ารับรอง → ต้องห้ามเสมอ (เลือกขอคืนไม่ได้)", got: resolveNonDeductibleVat("ค่ารับรอง", ""), want: "entertainment" },
    { name: "PUR-03: รถยนต์นั่ง (ผู้ใช้เลือก) → ต้องห้าม", got: isInputVatClaimable({ DocumentType: "tax_invoice", NonDeductibleVat: "passenger_car", CategoryMain: "ค่าเดินทาง" }), want: false },
    { name: "PUR-03: ใบกำกับเต็มรูปปกติ → ขอคืนได้", got: isInputVatClaimable({ DocumentType: "tax_invoice", NonDeductibleVat: "", CategoryMain: "ค่าใช้จ่ายสำนักงาน" }), want: true },
    { name: "PUR-03: รหัสที่ไม่รู้จัก → ไม่ถือเป็นต้องห้าม", got: resolveNonDeductibleVat("อื่น ๆ", "xyz"), want: "" },
    { name: "PUR-04: ใบกำกับอย่างย่อ → ขอคืนไม่ได้", got: isInputVatClaimable({ DocumentType: "tax_invoice_abbr" }), want: false },
    { name: "PUR-03: P&L — VAT ต้องห้ามเป็นต้นทุน / ขอคืนได้ไม่เป็นต้นทุน", got: [expenseCostOf({ ...base, documentType: "tax_invoice", categoryMain: "ค่ารับรอง" }, true), expenseCostOf({ ...base, documentType: "tax_invoice" }, true), expenseCostOf({ ...base, documentType: "tax_invoice_abbr" }, true)], want: [1070, 1000, 1070] },
    // PUR-06
    { name: "PUR-06: เลขเดียวกันแต่เขียนต่างกัน (ขีด/ทับ/ช่องว่าง/ตัวเล็ก) → ตรงกัน", got: normalizeDocNo(" inv-2026/0012 ") === normalizeDocNo("INV2026 0012"), want: true },
    { name: "PUR-06: ผู้ขายเดียวกัน + เลขใบเดียวกัน → เตือน (ไม่นับที่ยกเลิก / ผู้ขายอื่น)", got: findDuplicateBills(pays, { vendorTaxId: "0105556000001", docNumbers: ["INV2026/0012"] }).map((h) => h.paymentId), want: ["A"] },
    { name: "PUR-06: ไม่รู้เลขผู้ขาย → ไม่เตือน (กันเตือนมั่ว)", got: findDuplicateBills(pays, { vendorTaxId: "", docNumbers: ["INV-2026/0012"] }).length, want: 0 },
    { name: "PUR-06: ไม่นับตัวเอง (แนบใบเสร็จให้รายการเดิม)", got: findDuplicateBills(pays, { vendorTaxId: "0105556000001", docNumbers: ["INV-2026/0012"], excludePaymentId: "A" }).length, want: 0 },
    { name: "PUR-06: ข้อความเตือนบอกรายการเดิม", got: (duplicateWarningText(findDuplicateBills(pays, { vendorTaxId: "0105556000001", docNumbers: ["INV-2026/0012"] })) || "").includes("ค่าทำความสะอาด"), want: true },
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
