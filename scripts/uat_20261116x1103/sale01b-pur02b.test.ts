// UAT SALE-01b + PUR-02b (AUDIT_ACCOUNTING_20261116x1155) — รัน: npx -y tsx scripts/uat_20261116x1103/sale01b-pur02b.test.ts
(async () => {
  const { receiptVoidPlan } = await import("../../src/server/lib/receipt-output-vat");
  const { calculatePayment, assertVatOverride } = await import("../../src/lib/calculations");
  const throws = (fn: () => unknown) => { try { fn(); return false; } catch { return true; } };

  const tis: Record<string, string>[] = [
    { TaxInvoiceID: "TI1", SourceBillingID: "RC1", Status: "issued", DocNumber: "TI-2026-11-005" },
    { TaxInvoiceID: "TI2", SourceBillingID: "RC2", Status: "draft", DocNumber: "" },
    { TaxInvoiceID: "TI3", SourceBillingID: "RC3", Status: "void" },
  ];
  const p1 = receiptVoidPlan({ BillingID: "RC1", TaxDocMode: "separate" }, tis);
  const p2 = receiptVoidPlan({ BillingID: "RC2", TaxDocMode: "separate" }, tis);
  const p3 = receiptVoidPlan({ BillingID: "RC3", TaxDocMode: "separate" }, tis);
  const p4 = receiptVoidPlan({ BillingID: "RC4", TaxDocMode: "combined" }, tis);
  const p5 = receiptVoidPlan({ BillingID: "RC5", TaxDocMode: "" }, tis);

  // PUR-02b: ใบเสร็จซูเปอร์ฯ ยอดชำระ 1,000 · VAT ตามใบ 32.71 → ฐาน = 967.29 (สูตรหน้า "บันทึกค่าใช้จ่าย")
  const total = 1000, vat = 32.71;
  const base = Math.round((total - vat) * 100) / 100;
  const calc = calculatePayment({ costPerUnit: base, days: 1, numberOfPeople: 1, pctWTH: 0, isVatPayee: true, vatOverride: vat });

  const CASES: { name: string; got: unknown; want: unknown }[] = [
    { name: "SALE-01b: มีใบกำกับคู่ออกเลขแล้ว → ต้องยกเลิกใบกำกับด้วย + ต้องมีเหตุผล", got: [p1.paired.map((t) => t.TaxInvoiceID), p1.issued?.DocNumber, p1.reasonRequired], want: [["TI1"], "TI-2026-11-005", true] },
    { name: "SALE-01b: ใบกำกับคู่ยังเป็นร่าง → ลบร่าง · ไม่บังคับเหตุผล", got: [p2.paired.map((t) => t.TaxInvoiceID), p2.reasonRequired], want: [["TI2"], false] },
    { name: "SALE-01b: ใบกำกับคู่ยกเลิกไปแล้ว → ไม่ต้องทำอะไรเพิ่ม", got: [p3.paired.length, p3.reasonRequired], want: [0, false] },
    { name: "SALE-01b: โหมดรวม (ใบเสร็จ/ใบกำกับ) → ต้องมีเหตุผล", got: p4.reasonRequired, want: true },
    { name: "SALE-01b: ใบเสร็จธรรมดา → ไม่บังคับเหตุผล", got: p5.reasonRequired, want: false },
    { name: "PUR-02b: VAT ตามใบ 32.71 ถูกบันทึก (เดิม 65.42)", got: [calc.ttlAmount, calc.vatAmount, calc.gttlAmount], want: [967.29, 32.71, 1000] },
    { name: "PUR-02b: VAT ตามใบไม่เกิน 7% ของฐาน → ผ่าน", got: throws(() => assertVatOverride(base, vat)), want: false },
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
