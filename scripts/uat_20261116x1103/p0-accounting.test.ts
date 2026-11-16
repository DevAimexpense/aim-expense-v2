// UAT P0 จาก AUDIT_ACCOUNTING_20261116x1027 — รัน: npx -y tsx scripts/uat_20261116x1103/p0-accounting.test.ts
// ฟังก์ชันล้วน ไม่แตะ DB/Google: WHT-10/11/12 · PUR-02 · RPT-01 · SALE-01
(async () => {
  const { WTH_TYPES } = await import("../../src/lib/wth-types");
  const { whtPeriodDate, resolveWhtCertDate } = await import("../../src/lib/wht-doc-utils");
  const { calculatePayment, assertVatOverride } = await import("../../src/lib/calculations");
  const { computeDashboardPL, monthRange } = await import("../../src/lib/dashboard-pl");
  const { receiptOutputVatRows } = await import("../../src/server/lib/receipt-output-vat");

  const throws = (fn: () => unknown) => { try { fn(); return false; } catch { return true; } };
  const ids = WTH_TYPES.map((t) => t.id);
  const rate = (id: string) => WTH_TYPES.find((t) => t.id === id)?.rate;

  // --- RPT-01 fixtures ---
  const pay = (o: Partial<Record<string, string | number>>) => ({
    eventId: "E1", status: "paid", ttlAmount: 1000, vatAmount: 70, documentType: "tax_invoice",
    receiptDate: "2026-11-05", paymentDate: "2026-11-05", dueDate: "", createdAt: "2026-11-05T03:00:00Z", ...o,
  }) as never;
  const bill = (o: Partial<Record<string, string | number>>) => ({ eventId: "E1", status: "paid", docDate: "2026-11-10", subtotal: 100000, ...o }) as never;
  const pl = computeDashboardPL({
    payments: [
      pay({}), // 1,000 (VAT ขอคืนได้ ไม่ใช่ต้นทุน)
      pay({ documentType: "receipt" }), // 1,070 (VAT ขอคืนไม่ได้ = ต้นทุน)
      pay({ status: "pending" }), // ไม่นับ
      pay({ status: "rejected" }), // ไม่นับ
      pay({ receiptDate: "2026-10-30", paymentDate: "2026-10-30" }), // คนละเดือน
    ],
    billings: [bill({}), bill({ status: "void" }), bill({ status: "draft" }), bill({ docDate: "2026-10-01" })],
    month: "2026-11", eventId: "all", vatRegistered: true,
  });
  const plNonVat = computeDashboardPL({ payments: [pay({})], billings: [], month: "", eventId: "all", vatRegistered: false });

  // --- SALE-01 fixtures ---
  const rc = (o: Record<string, string>) => ({ BillingID: "RC1", DocKind: "receipt", Status: "paid", IsVAT: "TRUE", VATAmount: "7000", Subtotal: "100000", ReceiptNumber: "RC-2026-11-001", ReceiptDate: "2026-11-12", DocDate: "2026-11-12", ...o });
  const out = receiptOutputVatRows(
    [
      rc({ BillingID: "RC1", TaxDocMode: "combined" }), // นับ (ใบเสร็จ/ใบกำกับ)
      rc({ BillingID: "RC2", TaxDocMode: "separate" }), // มีใบกำกับคู่ issued → ไม่นับซ้ำ
      rc({ BillingID: "RC3", TaxDocMode: "separate" }), // ใบกำกับคู่ยังเป็น draft → นับที่ใบเสร็จ
      rc({ BillingID: "RC4", Status: "void" }), // ยกเลิก → ไม่นับ
      rc({ BillingID: "RC5", IsVAT: "FALSE", VATAmount: "0" }), // ไม่มี VAT
      rc({ BillingID: "BIL1", DocKind: "" }), // ใบวางบิล → ไม่อยู่ในกติกานี้
    ],
    [
      { TaxInvoiceID: "TI2", SourceBillingID: "RC2", Status: "issued" },
      { TaxInvoiceID: "TI3", SourceBillingID: "RC3", Status: "draft" },
    ],
  );

  const CASES: { name: string; got: unknown; want: unknown }[] = [
    // WHT-10/11/12
    { name: "WHT-10: ไม่มีประเภท 'บริการ 1%' แล้ว", got: ids.includes("service-1"), want: false },
    { name: "WHT-11: ค่าวิชาชีพอิสระ = 3% (ไม่ใช่ 5%)", got: [ids.includes("professional-5"), rate("professional-3")], want: [false, 3] },
    { name: "WHT-12: งวด ภ.ง.ด. ใช้วันที่เดียวกับ 50 ทวิ", got: whtPeriodDate({ PaymentDate: "2026-11-02", ReceiptDate: "2026-10-28" }), want: resolveWhtCertDate({ PaymentDate: "2026-11-02", ReceiptDate: "2026-10-28" }) },
    { name: "WHT-12: ไม่มีวันที่จ่าย/ใบเสร็จ → ตกไป PaidAt", got: whtPeriodDate({ PaidAt: "2026-11-03T05:00:00Z" }), want: "2026-11-03" },
    // PUR-02
    { name: "PUR-02: ไม่มี VAT ตามใบ → 7% ของฐาน", got: calculatePayment({ costPerUnit: 1000, days: 1, numberOfPeople: 1, pctWTH: 3, isVatPayee: true }), want: { ttlAmount: 1000, wthAmount: 30, vatAmount: 70, gttlAmount: 1040 } },
    { name: "PUR-02: ใบมีของยกเว้น VAT ปน → ใช้ VAT ตามใบ 35", got: calculatePayment({ costPerUnit: 1000, days: 1, numberOfPeople: 1, pctWTH: 0, isVatPayee: true, vatOverride: 35 }), want: { ttlAmount: 1000, wthAmount: 0, vatAmount: 35, gttlAmount: 1035 } },
    { name: "PUR-02: ผู้รับเงินไม่จด VAT → VAT ตามใบถูกเมิน", got: calculatePayment({ costPerUnit: 1000, days: 1, numberOfPeople: 1, pctWTH: 0, isVatPayee: false, vatOverride: 35 }).vatAmount, want: 0 },
    { name: "PUR-02: VAT เกิน 7% ของฐาน → ปฏิเสธ (กันขอภาษีซื้อเกิน)", got: [throws(() => assertVatOverride(1000, 80)), throws(() => assertVatOverride(1000, 70.5)), throws(() => assertVatOverride(1000, -1))], want: [true, false, true] },
    // RPT-01
    { name: "RPT-01: รายได้ = ก่อน VAT · ไม่นับ void/draft/เดือนอื่น", got: pl.revenue, want: 100000 },
    { name: "RPT-01: ค่าใช้จ่าย = อนุมัติแล้ว · VAT ขอคืนได้ไม่ใช่ต้นทุน", got: pl.expense, want: 2070 },
    { name: "RPT-01: รายการรออนุมัติแยกแสดง ไม่นับในกำไร", got: [pl.pendingCount, pl.profit], want: [1, 97930] },
    { name: "RPT-01: ไม่จด VAT → VAT ซื้อเป็นต้นทุน", got: plNonVat.expense, want: 1070 },
    { name: "RPT-01: ช่วงเดือนสำหรับ ภ.พ.30", got: [monthRange("2026-02"), monthRange("")], want: [{ from: "2026-02-01", to: "2026-02-28" }, null] },
    // SALE-01
    { name: "SALE-01: ใบเสร็จมี VAT เข้าภาษีขายครั้งเดียว (รวม/ยังไม่มีใบกำกับคู่)", got: out.map((r) => `${r.billingId}:${r.mode}`), want: ["RC1:combined", "RC3:separate"] },
    { name: "SALE-01: ฐาน/ภาษีมาจากใบเสร็จ", got: [out[0].baseAmount, out[0].vatAmount, out[0].date, out[0].docNumber], want: [100000, 7000, "2026-11-12", "RC-2026-11-001"] },
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
