// UAT แก้ BUGS_20261116x1532 (RPT-03, SALE-01e, CTRL-13b helper)
// SALE-20 / SCOPE-01 / VAT-21 = เปลี่ยนที่ UI + query (ตรวจด้วยการอ่านโค้ด)
// รัน: npx -y tsx scripts/uat_20261116x1539/bugs-1532-fixes.test.ts
(async () => {
  const { computeDashboardPL } = await import("../../src/lib/dashboard-pl");
  const { uncoveredBillingReceipts } = await import("../../src/server/lib/receipt-output-vat");
  const { filedVatPeriodWarning } = await import("../../src/server/lib/vat-period");

  const base = { payments: [], month: "2026-10", eventId: "all", vatRegistered: true } as const;
  // ใบเสร็จออกตรงเก่า 10,000 (C1 VAT 700) + ใบกำกับที่ลูกค้าออกเอง ไม่ผูก (C1 VAT 700)
  const legacy = computeDashboardPL({
    ...base,
    billings: [{ billingId: "RC1", eventId: "E1", status: "paid", docDate: "2026-10-05", subtotal: 10000, customerId: "C1", vatAmount: 700 }],
    taxInvoices: [{ eventId: "E1", status: "issued", docDate: "2026-10-05", subtotal: 10000, sourceBillingId: "", sourceQuotationId: "", customerId: "C1", vatAmount: 700 }],
  });
  // ใบกำกับที่ไม่ผูก ของลูกค้าอื่น / ยอดอื่น → นับ
  const other = computeDashboardPL({
    ...base,
    billings: [{ billingId: "RC1", eventId: "E1", status: "paid", docDate: "2026-10-05", subtotal: 10000, customerId: "C1", vatAmount: 700 }],
    taxInvoices: [
      { eventId: "E1", status: "issued", docDate: "2026-10-06", subtotal: 10000, sourceBillingId: "", sourceQuotationId: "", customerId: "C2", vatAmount: 700 },
      { eventId: "E1", status: "issued", docDate: "2026-10-07", subtotal: 5000, sourceBillingId: "", sourceQuotationId: "", customerId: "C1", vatAmount: 350 },
    ],
  });
  // ใบวางบิลที่มีใบกำกับผูกแล้ว (รายเดือนยอดเท่ากัน) ไม่ "กิน" ใบกำกับสร้างเองของเดือนอื่น
  const monthly = computeDashboardPL({
    ...base,
    month: "2026-11",
    billings: [{ billingId: "BL-OCT", eventId: "E1", status: "paid", docDate: "2026-10-01", subtotal: 10000, customerId: "C1", vatAmount: 700 }],
    taxInvoices: [
      { eventId: "E1", status: "issued", docDate: "2026-10-01", subtotal: 10000, sourceBillingId: "BL-OCT", sourceQuotationId: "", customerId: "C1", vatAmount: 700 },
      { eventId: "E1", status: "issued", docDate: "2026-11-01", subtotal: 10000, sourceBillingId: "", sourceQuotationId: "", customerId: "C1", vatAmount: 700 },
    ],
  });
  // 2 ใบเสร็จ + 2 ใบกำกับสร้างเอง ยอดเท่ากัน → จับคู่ 1:1 · ใบกำกับใบที่ 3 → นับ
  const many = computeDashboardPL({
    ...base,
    billings: [
      { billingId: "A", eventId: "E1", status: "paid", docDate: "2026-10-01", subtotal: 1000, customerId: "C1", vatAmount: 70 },
      { billingId: "B", eventId: "E1", status: "paid", docDate: "2026-10-02", subtotal: 1000, customerId: "C1", vatAmount: 70 },
    ],
    taxInvoices: [1, 2, 3].map((d) => ({
      eventId: "E1", status: "issued", docDate: `2026-10-0${d}`, subtotal: 1000, sourceBillingId: "", sourceQuotationId: "", customerId: "C1", vatAmount: 70,
    })),
  });

  // SALE-01e: ใบกำกับมัดจำจากใบเสนอราคา (VAT 210) ไม่ครอบใบวางบิลยอดเต็ม (VAT 700)
  const tisQ = [{ TaxInvoiceID: "TQ", Status: "issued", SourceQuotationID: "Q1", SourceBillingID: "", VATAmount: "210" }];
  const bl = (id: string, vat: string, date: string) => ({
    BillingID: id, DocNumber: id, ReceiptNumber: `RC-${id}`, ReceiptDate: date, Status: "paid", IsVAT: "TRUE", VATAmount: vat, Subtotal: "0", SourceQuotationID: "Q1",
  });
  const depositOnly = uncoveredBillingReceipts([bl("FULL", "700", "2026-11-03")], tisQ).map((r) => r.billingId);
  const instalments = uncoveredBillingReceipts(
    [bl("I1", "350", "2026-11-03"), bl("I2", "350", "2026-11-20")],
    [{ ...tisQ[0], VATAmount: "700" }],
  ).map((r) => r.billingId);
  const partialSecond = uncoveredBillingReceipts(
    [bl("I1", "350", "2026-11-03"), bl("I2", "350", "2026-11-20")],
    [{ ...tisQ[0], VATAmount: "400" }],
  ).map((r) => r.billingId);

  const CASES: { name: string; got: unknown; want: unknown }[] = [
    { name: "RPT-03: ใบเสร็จเก่า + ใบกำกับสร้างเอง (ลูกค้า/VAT ตรง) → รายได้ 10,000 ไม่ใช่ 20,000", got: [legacy.revenue, legacy.possibleDuplicates], want: [10000, 1] },
    { name: "RPT-03: ใบกำกับของลูกค้าอื่น / ยอดอื่น → นับเพิ่ม", got: other.revenue, want: 25000 },
    { name: "RPT-03: ใบวางบิลที่มีใบกำกับผูกแล้ว ไม่ทำให้ใบกำกับเดือนถัดไปหาย", got: [monthly.revenue, monthly.possibleDuplicates], want: [10000, 0] },
    { name: "RPT-03: จับคู่ 1:1 — 2 ใบเสร็จ + 3 ใบกำกับยอดเท่ากัน → นับใบกำกับเพิ่ม 1 ใบ", got: [many.revenue, many.possibleDuplicates], want: [3000, 2] },
    { name: "SALE-01e: ใบกำกับมัดจำ (VAT 210) ไม่ครอบใบวางบิลเต็ม (VAT 700) → ยังอยู่ในรายการยกเว้น", got: depositOnly, want: ["FULL"] },
    { name: "SALE-01e: ใบกำกับเต็มจำนวน (700) ครอบผ่อน 2 งวด (350+350) → ไม่มีรายการยกเว้น", got: instalments, want: [] },
    { name: "SALE-01e: ใบกำกับ 400 ครอบงวดแรก 350 เหลือ 50 ไม่พองวดสอง → งวดสองยังอยู่", got: partialSecond, want: ["I2"] },
    { name: "CTRL-13b: ใบเสร็จ/ใบกำกับ (รวม) ลงวันที่ ต.ค. ออก 20 พ.ย. → มีคำเตือน", got: !!filedVatPeriodWarning("2026-10-15", "2026-11-20"), want: true },
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
