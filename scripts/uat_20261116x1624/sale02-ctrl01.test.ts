// UAT SALE-02 (ใบลดหนี้/ใบเพิ่มหนี้) + CTRL-01 (ปิดงวดบัญชี)
// รัน: npx -y tsx scripts/uat_20261116x1624/sale02-ctrl01.test.ts
(async () => {
  const { computeNote, priorAdjustment, noteOutputVatRows, noteReasons } = await import("../../src/lib/credit-note");
  const { readPeriodClose, isDateInClosedPeriod, canManagePeriod, prevMonth, paymentReportDates } = await import("../../src/lib/period-close");
  const { computeDashboardPL } = await import("../../src/lib/dashboard-pl");

  const notes: Record<string, string>[] = [
    { NoteID: "N1", SourceID: "TI1", Kind: "credit", Status: "issued", DiffAmount: "1000", VATAmount: "70", DocDate: "2026-11-05", DocNumber: "CN-2026-11-001", SourceDocNumber: "TI-2026-10-003", EventID: "E1" },
    { NoteID: "N2", SourceID: "TI1", Kind: "debit", Status: "issued", DiffAmount: "200", VATAmount: "14", DocDate: "2026-11-20", DocNumber: "DN-2026-11-001", SourceDocNumber: "TI-2026-10-003", EventID: "E1" },
    { NoteID: "N3", SourceID: "TI1", Kind: "credit", Status: "void", DiffAmount: "5000", VATAmount: "350", DocDate: "2026-11-21", DocNumber: "CN-2026-11-002", EventID: "E1" },
  ];
  const credit = computeNote({ kind: "credit", originalSubtotal: 10000, prior: 0, correctSubtotal: 9000 });
  const debit = computeNote({ kind: "debit", originalSubtotal: 10000, prior: -800, correctSubtotal: 9500 });
  const tooMuch = computeNote({ kind: "credit", originalSubtotal: 10000, prior: -800, correctSubtotal: 9500 });
  const negative = computeNote({ kind: "credit", originalSubtotal: 10000, prior: 0, correctSubtotal: -1 });
  const rows = noteOutputVatRows(notes);
  const settings = { periodClose: { closedThrough: "2026-10", managers: ["U2"] }, receiptMode: "combined" };
  const pc = readPeriodClose(settings);
  const pl = computeDashboardPL({
    payments: [],
    billings: [{ eventId: "E1", status: "paid", docDate: "2026-11-01", subtotal: 10000 }],
    notes: rows.map((r, i) => ({ status: notes[i].Status, kind: r.kind, docDate: r.date, eventId: r.eventId, diffAmount: Math.abs(r.baseAmount) })),
    month: "2026-11",
    eventId: "all",
    vatRegistered: true,
  });

  const CASES: { name: string; got: unknown; want: unknown }[] = [
    // SALE-02
    { name: "SALE-02: ใบลดหนี้ 10,000 → 9,000 = ผลต่าง 1,000 VAT 70", got: credit.ok ? [credit.diff, credit.vat, credit.total] : credit.error, want: [1000, 70, 1070] },
    { name: "SALE-02: ใบเพิ่มหนี้คิดจากมูลค่าปัจจุบันหลังใบก่อน (9,200 → 9,500 = 300)", got: debit.ok ? [debit.currentValue, debit.diff, debit.vat] : debit.error, want: [9200, 300, 21] },
    { name: "SALE-02: ใบลดหนี้ที่มูลค่าถูกต้อง ≥ มูลค่าปัจจุบัน → ปฏิเสธ", got: tooMuch.ok, want: false },
    { name: "SALE-02: มูลค่าติดลบ → ปฏิเสธ", got: negative.ok, want: false },
    { name: "SALE-02: ปรับไปแล้ว = −1,000 +200 (ไม่นับที่ยกเลิก)", got: priorAdjustment(notes, "TI1"), want: -800 },
    { name: "SALE-02: ภาษีขาย — ใบลดหนี้ติดลบ ใบเพิ่มหนี้บวก ใบยกเลิกไม่นับ", got: rows.map((r) => [r.docNumber, r.baseAmount, r.vatAmount]), want: [["CN-2026-11-001", -1000, -70], ["DN-2026-11-001", 200, 14]] },
    { name: "SALE-02: ลงงวดตามวันที่ออกใบ (พ.ย.) ไม่ย้อนไปเดือนใบกำกับเดิม (ต.ค.)", got: rows.map((r) => r.date.slice(0, 7)), want: ["2026-11", "2026-11"] },
    { name: "SALE-02: เหตุตามกฎหมาย — ลดหนี้มีรับคืนสินค้า / เพิ่มหนี้มีคำนวณผิดต่ำกว่าจริง", got: [noteReasons("credit").some((r) => r.value === "goods_returned"), noteReasons("debit").some((r) => r.value === "undercharged")], want: [true, true] },
    { name: "SALE-02: Dashboard รายได้ พ.ย. = 10,000 − 1,000 + 200", got: [pl.revenue, pl.noteAdjustment], want: [9200, -800] },
    // CTRL-01
    { name: "CTRL-01: อ่านค่าตั้ง (ไม่ทับ receiptMode)", got: pc, want: { closedThrough: "2026-10", managers: ["U2"] } },
    { name: "CTRL-01: ปิดถึง ต.ค. → ต.ค./ก.ย. ปิด · พ.ย. เปิด", got: [isDateInClosedPeriod("2026-10-31", "2026-10"), isDateInClosedPeriod("2026-09-01", "2026-10"), isDateInClosedPeriod("2026-11-01", "2026-10")], want: [true, true, false] },
    { name: "CTRL-01: ยังไม่เคยปิด → ไม่ล็อก", got: isDateInClosedPeriod("2020-01-01", ""), want: false },
    { name: "CTRL-01: สิทธิ์ — เจ้าของเสมอ + คนที่มอบ · คนอื่นไม่ได้", got: [canManagePeriod("OWNER", "OWNER", pc), canManagePeriod("U2", "OWNER", pc), canManagePeriod("U3", "OWNER", pc)], want: [true, true, false] },
    { name: "CTRL-01: ค่าเริ่มต้น (ไม่เคยตั้ง) → เจ้าของคนเดียว", got: [canManagePeriod("OWNER", "OWNER", readPeriodClose({})), canManagePeriod("U2", "OWNER", readPeriodClose({}))], want: [true, false] },
    { name: "CTRL-01: เปิดงวดตั้งแต่ ม.ค. → ปิดเหลือถึง ธ.ค. ปีก่อน", got: prevMonth("2026-01"), want: "2025-12" },
    { name: "CTRL-01: รายการจ่ายที่ยังไม่จ่าย ไม่ล็อก · จ่ายแล้วใช้วันที่ใบเสร็จ/วันจ่าย", got: [paymentReportDates({ Status: "pending", ReceiptDate: "2026-10-05" }), paymentReportDates({ Status: "paid", ReceiptDate: "2026-10-05", PaymentDate: "2026-11-02", PaidAt: "2026-11-02T03:00:00Z" })], want: [[], ["2026-10-05", "2026-11-02"]] },
    { name: "CTRL-01: ค่าตั้งเพี้ยน (เดือนผิดรูป) → ไม่ล็อก", got: readPeriodClose({ periodClose: { closedThrough: "2026-13" } }).closedThrough, want: "" },
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
