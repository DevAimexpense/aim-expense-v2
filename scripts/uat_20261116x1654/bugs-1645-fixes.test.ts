// UAT แก้ BUGS_20261116x1645 — CTRL-15, SALE-22/23, PUR-04b, PUR-06b, PUR-09b (+ CTRL-14/16/17 ตรวจด้วยการอ่านโค้ด)
// รัน: npx -y tsx scripts/uat_20261116x1654/bugs-1645-fixes.test.ts
(async () => {
  const { reapprovalSnapshot, revertReapproval, materialChanges } = await import("../../src/lib/payment-reapproval");
  const { classifyOcrPurchaseDoc } = await import("../../src/lib/input-vat-rules");
  const { findDuplicateBills } = await import("../../src/lib/duplicate-bill");
  const { vendorTaxIdFor, paymentReportDates, isDateInClosedPeriod } = await import("../../src/lib/period-close");
  const { branchCode, branchDisplay } = await import("../../src/lib/branch-label");

  // CTRL-15: จ่ายแล้ว 10,300 → แก้เป็น 13,000 → ปฏิเสธ = คืนค่าเดิม
  const paid: Record<string, string> = {
    PaymentID: "P1", Status: "paid", TTLAmount: "10000", VATAmount: "700", WTHAmount: "300", GTTLAmount: "10400",
    PayeeID: "V1", CompanyBankID: "B1", ExpenseType: "account", DocumentType: "tax_invoice", EventID: "E1",
    CostPerUnit: "10000", Days: "1", NoOfPPL: "1", PctWTH: "3", ApprovedBy: "หัวหน้า", ApprovedAt: "2026-11-01T02:00:00Z",
    ReceiptDate: "2026-10-30", PaymentDate: "2026-11-01",
  };
  const snap = reapprovalSnapshot(paid);
  const edited = { ...paid, Status: "pending", ReapprovalOf: "paid", ReapprovalSnapshot: snap, TTLAmount: "12500", GTTLAmount: "13000", ApprovedBy: "", ApprovedAt: "" };
  const reverted = revertReapproval(edited);
  const editedTwice = { ...edited, TTLAmount: "14000" };

  const pays: Record<string, string>[] = [
    { PaymentID: "L1", Status: "pending", VendorTaxIdSnapshot: "0105556000001", InvoiceNumber: "INV-55", Description: "บรรทัด 1", GTTLAmount: "100" },
    { PaymentID: "OLD", Status: "paid", VendorTaxIdSnapshot: "0105556000001", InvoiceNumber: "INV-55", Description: "เดือนก่อน", GTTLAmount: "500" },
  ];

  const CASES: { name: string; got: unknown; want: unknown }[] = [
    // CTRL-15
    { name: "CTRL-15: ปฏิเสธการแก้ → คืนยอด/สถานะ/ผู้อนุมัติเดิม", got: [reverted.Status, reverted.TTLAmount, reverted.GTTLAmount, reverted.ApprovedBy, reverted.ReapprovalOf, reverted.ReapprovalSnapshot], want: ["paid", "10000", "10400", "หัวหน้า", "", ""] },
    { name: "CTRL-15: แก้ซ้ำก่อนอนุมัติ → snapshot ยังเป็นค่าที่เคยอนุมัติจริง (ครั้งแรก)", got: JSON.parse(reapprovalSnapshot(editedTwice)).GTTLAmount, want: "10400" },
    { name: "CTRL-15: ไม่มี snapshot (ข้อมูลเก่า) → คืนแค่สถานะ", got: revertReapproval({ Status: "pending", ReapprovalOf: "cleared" }).Status, want: "cleared" },
    { name: "CTRL-15: คืนค่าแล้วไม่เหลือส่วนต่างสาระสำคัญจากค่าเดิม", got: materialChanges(paid, reverted), want: [] },
    // CTRL-16 (ฟังก์ชันที่ approve ใช้ตรวจ): รายการที่จะคืนเป็นจ่ายแล้วมีวันที่รายงาน ต.ค. → อยู่ในงวดปิด
    { name: "CTRL-16: คืนเป็นจ่ายแล้ว → ตรวจวันที่ใบเสร็จ/วันจ่าย กับงวดที่ปิด", got: paymentReportDates({ ...edited, Status: "paid" }).some((d) => isDateInClosedPeriod(d, "2026-10")), want: true },
    // PUR-04b
    { name: "PUR-04b: ใบกำกับไม่มีเลขผู้ซื้อ (ปั๊ม/ร้านสะดวกซื้อ) → อย่างย่อ", got: classifyOcrPurchaseDoc("tax_invoice", null, "0105560000009").documentType, want: "tax_invoice_abbr" },
    { name: "PUR-04b: เลขผู้ซื้อเป็นของกิจการ → เต็มรูป ขอคืนได้", got: classifyOcrPurchaseDoc("tax_invoice", "0-1055-60000-00-9", "0105560000009"), want: { documentType: "tax_invoice", nonDeductibleVat: "" } },
    { name: "PUR-04b: เลขผู้ซื้อเป็นของคนอื่น → ต้องห้าม (ใบกำกับไม่ถูกต้อง)", got: classifyOcrPurchaseDoc("tax_invoice", "1234567890123", "0105560000009"), want: { documentType: "tax_invoice", nonDeductibleVat: "invalid_tax_invoice" } },
    { name: "PUR-04b: ใบเสร็จธรรมดา → receipt", got: classifyOcrPurchaseDoc("receipt", null, null).documentType, want: "receipt" },
    // PUR-06b
    { name: "PUR-06b: บรรทัดจากใบเดียวกันในรอบเดียวกัน → ไม่เตือนกันเอง แต่ยังเจอบิลเดือนก่อน", got: findDuplicateBills(pays, { vendorTaxId: "0105556000001", docNumbers: ["INV-55"], excludePaymentIds: ["L1"] }).map((h) => h.paymentId), want: ["OLD"] },
    // PUR-09b
    { name: "PUR-09b: งวดที่ยังเปิด → ทะเบียนปัจจุบัน (แก้เลขพิมพ์ผิดแล้วตาม)", got: vendorTaxIdFor("0105556000009", "0105556000001", "2026-11-05", "2026-10"), want: "0105556000001" },
    { name: "PUR-09b: งวดที่ปิดแล้ว → ตามที่บันทึกตอนจ่าย (รายงานที่ยื่นไม่เปลี่ยน)", got: vendorTaxIdFor("0105556000009", "0105556000001", "2026-10-05", "2026-10"), want: "0105556000009" },
    { name: "PUR-09b: ไม่มีค่าฝั่งใดฝั่งหนึ่ง → ใช้อีกฝั่ง", got: [vendorTaxIdFor("", "X", "2026-10-05", "2026-10"), vendorTaxIdFor("S", "", "2026-11-05", "2026-10")], want: ["X", "S"] },
    // SALE-22/23
    { name: "SALE-22: รหัสสาขาผู้ซื้อ — สำนักงานใหญ่ / สาขา / ไม่ระบุ", got: [branchCode("HQ", ""), branchCode("Branch", "2"), branchCode("", "")], want: ["00000", "00002", ""] },
    { name: "SALE-22: ข้อความบนเอกสาร", got: [branchDisplay("00000"), branchDisplay("00002"), branchDisplay("")], want: ["สำนักงานใหญ่ (00000)", "สาขาที่ 00002", ""] },
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
