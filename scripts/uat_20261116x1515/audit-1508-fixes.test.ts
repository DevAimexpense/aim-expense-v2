// UAT แก้ AUDIT_ACCOUNTING_20261116x1508 (SALE-19, SALE-17b, CTRL-13)
// รัน: npx -y tsx scripts/uat_20261116x1515/audit-1508-fixes.test.ts
(async () => {
  const { billingEditBlockReason, settledAmountAfterEdit } = await import("../../src/server/lib/receipt-output-vat");
  const { receiptReplacementNote } = await import("../../src/server/lib/ti-replacement");
  const { filedVatPeriodWarning } = await import("../../src/server/lib/vat-period");

  const tis = [
    { TaxInvoiceID: "TI1", SourceBillingID: "BL1", Status: "issued", DocNumber: "TI-2026-11-006" },
    { TaxInvoiceID: "TI2", SourceBillingID: "BL2", Status: "void", DocNumber: "TI-2026-11-004" },
    { TaxInvoiceID: "TI3", SourceBillingID: "BL3", Status: "draft", DocNumber: "" },
  ];
  const blocked = (r: Record<string, string>) => billingEditBlockReason(r, tis) !== null;

  const CASES: { name: string; got: unknown; want: unknown }[] = [
    // SALE-19
    { name: "SALE-19: ออกใบเสร็จแล้ว → แก้ใบวางบิลไม่ได้", got: blocked({ BillingID: "BL9", Status: "paid", ReceiptNumber: "RC-2026-11-010" }), want: true },
    { name: "SALE-19: มีใบกำกับออกเลขแล้ว → แก้ไม่ได้", got: blocked({ BillingID: "BL1", Status: "sent" }), want: true },
    { name: "SALE-19: ใบกำกับถูกยกเลิกแล้ว → แก้ได้", got: blocked({ BillingID: "BL2", Status: "sent" }), want: false },
    { name: "SALE-19: ใบกำกับยังเป็นร่าง → แก้ได้", got: blocked({ BillingID: "BL3", Status: "partial" }), want: false },
    { name: "SALE-19: รับเงินครบ ยังไม่ออกใบเสร็จ/ใบกำกับ → แก้ได้ (เหมือนเดิม)", got: blocked({ BillingID: "BL8", Status: "paid" }), want: false },
    { name: "SALE-19: ยกเลิกแล้ว / เป็นใบเสร็จออกตรง → แก้ไม่ได้ (เหมือนเดิม)", got: [blocked({ BillingID: "X", Status: "void" }), blocked({ BillingID: "Y", Status: "paid", DocKind: "receipt" })], want: [true, true] },
    {
      name: "SALE-19: นิติบุคคล รับครบตามยอดรวม → ยอดรับใหม่ = ยอดรวมใหม่",
      got: settledAmountAfterEdit({ PaidAmount: "107000", GrandTotal: "107000", AmountReceivable: "104000" }, { grandTotal: 53500, amountReceivable: 52000 }),
      want: 53500,
    },
    {
      name: "SALE-19: รายรับบุคคลหักภาษี (ยอดรับ = หลังหัก) → ยอดรับใหม่ = หลังหักของยอดใหม่ (เดิมกลายเป็นยอดรวม)",
      got: settledAmountAfterEdit({ PaidAmount: "9700", GrandTotal: "10000", AmountReceivable: "9700" }, { grandTotal: 20000, amountReceivable: 19400 }),
      want: 19400,
    },
    {
      name: "SALE-19: ไม่มีหัก ณ ที่จ่าย (ยอดรวม = ยอดรับ) → ยอดรวมใหม่",
      got: settledAmountAfterEdit({ PaidAmount: "5000", GrandTotal: "5000", AmountReceivable: "5000" }, { grandTotal: 6000, amountReceivable: 6000 }),
      want: 6000,
    },
    // SALE-17b
    {
      name: "SALE-17b: โหมดรวม → อ้างใบเสร็จรับเงิน/ใบกำกับภาษีฉบับเดิม + เหตุผล",
      got: receiptReplacementNote({ ReceiptNumber: "RC-2026-11-003", TaxDocMode: "combined", VoidReason: "ยอดผิด" }),
      want: "ออกแทนใบเสร็จรับเงิน/ใบกำกับภาษีเลขที่ RC-2026-11-003 ซึ่งยกเลิกแล้ว (เหตุผล: ยอดผิด)",
    },
    {
      name: "SALE-17b: โหมดแยก → อ้างใบเสร็จเดิม + ใบกำกับคู่เดิม",
      got: receiptReplacementNote({ ReceiptNumber: "RC-2026-11-005", TaxDocMode: "separate", VoidReason: "ชื่อลูกค้าผิด" }, "TI-2026-11-009"),
      want: "ออกแทนใบเสร็จรับเงินเลขที่ RC-2026-11-005 และใบกำกับภาษีเลขที่ TI-2026-11-009 ซึ่งยกเลิกแล้ว (เหตุผล: ชื่อลูกค้าผิด)",
    },
    // CTRL-13
    { name: "CTRL-13: ใบลงวันที่ ต.ค. ออกวันที่ 15 พ.ย. (ยังไม่เลยกำหนด) → ไม่เตือน", got: filedVatPeriodWarning("2026-10-20", "2026-11-15"), want: undefined },
    { name: "CTRL-13: ใบลงวันที่ ต.ค. ออกวันที่ 16 พ.ย. → เตือนงวด ต.ค. 2569", got: (filedVatPeriodWarning("2026-10-20", "2026-11-16") || "").includes("ต.ค. 2569"), want: true },
    { name: "CTRL-13: ใบเดือนปัจจุบัน → ไม่เตือน", got: filedVatPeriodWarning("2026-11-02", "2026-11-16"), want: undefined },
    { name: "CTRL-13: ข้ามปี — ใบ ธ.ค. ออก 16 ม.ค. → เตือน", got: !!filedVatPeriodWarning("2026-12-28", "2027-01-16"), want: true },
    { name: "CTRL-13: ใบ ธ.ค. ออก 10 ม.ค. → ไม่เตือน", got: filedVatPeriodWarning("2026-12-28", "2027-01-10"), want: undefined },
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
