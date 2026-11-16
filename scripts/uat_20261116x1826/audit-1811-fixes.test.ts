// UAT แก้ AUDIT_ACCOUNTING_20261116x1811 — RPT-09, PUR-11, CTRL-03r
// รัน: npx -y tsx scripts/uat_20261116x1826/audit-1811-fixes.test.ts
(async () => {
  const { roundMoney } = await import("../../src/lib/money");
  const { calculatePayment } = await import("../../src/lib/calculations");
  const N = await import("../../src/lib/purchase-note");
  const P = await import("../../src/lib/period-close");
  const { computeDashboardPL } = await import("../../src/lib/dashboard-pl");

  const paidTI = { PaymentID: "P1", Status: "paid", DocumentType: "tax_invoice", TTLAmount: "10000", VATAmount: "700", PayeeID: "V1", EventID: "E1" };
  const paidReceipt = { PaymentID: "P2", Status: "paid", DocumentType: "receipt", TTLAmount: "500", VATAmount: "0", PayeeID: "V2", EventID: "E1" };
  const notes = [
    { NoteID: "N1", Kind: "credit", PaymentID: "P1", BaseAmount: "2000", VATAmount: "140", ReceivedDate: "2026-11-10", Status: "active" },
    { NoteID: "N2", Kind: "debit", PaymentID: "P1", BaseAmount: "500", VATAmount: "35", ReceivedDate: "2026-11-20", Status: "active" },
    { NoteID: "N3", Kind: "credit", PaymentID: "P1", BaseAmount: "9999", VATAmount: "699", ReceivedDate: "2026-11-21", Status: "void" },
    { NoteID: "N4", Kind: "credit", PaymentID: "P2", BaseAmount: "100", VATAmount: "0", ReceivedDate: "2026-11-12", Status: "active" },
  ];
  const prior = N.priorPurchaseAdjustment(notes, "P1");
  const byId = new Map([["P1", paidTI], ["P2", paidReceipt]]);
  const vatRows = N.purchaseNoteInputRows(notes, byId);

  const plPayments = [
    { paymentId: "P1", eventId: "E1", status: "paid", ttlAmount: 10000, vatAmount: 700, documentType: "tax_invoice", receiptDate: "2026-10-05", paymentDate: "2026-10-05", dueDate: "", createdAt: "2026-10-05" },
  ];
  const pl = (purchaseNotes: Parameters<typeof computeDashboardPL>[0]["purchaseNotes"], month: string) =>
    computeDashboardPL({ payments: plPayments, billings: [], month, eventId: "all", vatRegistered: true, purchaseNotes });
  const pn = { paymentId: "P1", status: "active", kind: "credit" as const, receivedDate: "2026-11-10", eventId: "E1", baseAmount: 2000, vatAmount: 140 };

  const snap = { outputVat: 7000, inputVat: 2100, wht: 300 };
  const snapNew = { ...snap, revenue: 100000, expense: 30000 };
  const settings = P.readPeriodClose({
    periodClose: { closedThrough: "2026-10", managers: [], lastVerified: "2026-11", snapshots: { "2026-08": snapNew, "2026-09": snapNew, "2026-10": snapNew, "2026-11": snapNew } },
  });

  const CASES: { name: string; got: unknown; want: unknown }[] = [
    // ---------- RPT-09 ----------
    { name: "RPT-09: .xx5 ปัดขึ้นถูกต้อง (10.515 → 10.52, 1.005 → 1.01, 2.675 → 2.68)", got: [roundMoney(10.515), roundMoney(1.005), roundMoney(2.675)], want: [10.52, 1.01, 2.68] },
    { name: "RPT-09: ติดลบปัดแบบสมมาตร (−1.005 → −1.01) · 0.1+0.2 → 0.3", got: [roundMoney(-1.005), roundMoney(0.1 + 0.2)], want: [-1.01, 0.3] },
    { name: "RPT-09: ค่าแปลก → 0 · ยอดใหญ่ไม่เพี้ยน", got: [roundMoney(NaN), roundMoney(Infinity), roundMoney(1234567.895)], want: [0, 0, 1234567.9] },
    { name: "RPT-09: สูตรรายการจ่ายใช้ตัวเดียวกัน (150.15 × 7% = 10.5105 → 10.51 · 7.5 × 7% = 0.525 → 0.53)", got: [calculatePayment({ costPerUnit: 150.15, days: 1, numberOfPeople: 1, pctWTH: 0, isVatPayee: true }).vatAmount, calculatePayment({ costPerUnit: 7.5, days: 1, numberOfPeople: 1, pctWTH: 0, isVatPayee: true }).vatAmount], want: [10.51, 0.53] },
    // ---------- PUR-11 ----------
    { name: "PUR-11: ยอดปรับสะสม (ลด 2,000 + เพิ่ม 500 · ใบยกเลิกไม่นับ)", got: prior, want: { base: -1500, vat: -105 } },
    { name: "PUR-11: ลดได้ไม่เกินคงเหลือ (10,000 − 1,500 = 8,500)", got: [N.validatePurchaseNote({ kind: "credit", base: 8500, vat: 595, originalBase: 10000, originalVat: 700, prior }).ok, N.validatePurchaseNote({ kind: "credit", base: 8501, vat: 0, originalBase: 10000, originalVat: 700, prior }).ok], want: [true, false] },
    { name: "PUR-11: VAT ลดเกินคงเหลือ → ไม่ได้", got: N.validatePurchaseNote({ kind: "credit", base: 8000, vat: 596, originalBase: 10000, originalVat: 700, prior }).ok, want: false },
    { name: "PUR-11: VAT เกิน 7% ของมูลค่า (+1 บาท) → ไม่ได้", got: [N.validatePurchaseNote({ kind: "debit", base: 1000, vat: 71, originalBase: 10000, originalVat: 700, prior }).ok, N.validatePurchaseNote({ kind: "debit", base: 1000, vat: 71.01, originalBase: 10000, originalVat: 700, prior }).ok], want: [true, false] },
    { name: "PUR-11: รายการเดิมไม่มี VAT → ใบต้องไม่มี VAT", got: N.validatePurchaseNote({ kind: "credit", base: 100, vat: 7, originalBase: 500, originalVat: 0, prior: { base: 0, vat: 0 } }).ok, want: false },
    { name: "PUR-11: มูลค่า 0 → ไม่ได้", got: N.validatePurchaseNote({ kind: "credit", base: 0, vat: 0, originalBase: 500, originalVat: 0, prior: { base: 0, vat: 0 } }).ok, want: false },
    { name: "PUR-11: ภ.พ.30 — เฉพาะใบที่ใช้อยู่ของรายการที่ขอคืนภาษีซื้อได้ · ลงวันที่ได้รับ · ลดหนี้ติดลบ", got: vatRows.map((r) => [r.note.NoteID, r.date, r.base, r.vat, r.kind]), want: [["N1", "2026-11-10", -2000, -140, "credit_note"], ["N2", "2026-11-20", 500, 35, "debit_note"]] },
    { name: "PUR-11: ใบของรายการที่ขอคืนไม่ได้ (ใบเสร็จธรรมดา) → ไม่กระทบภาษีซื้อ", got: N.purchaseNoteVatEffect(notes[3], paidReceipt), want: 0 },
    { name: "PUR-11: กำไรขาดทุน — ลดต้นทุนเดือนที่ได้รับ (พ.ย. −2,000) · เดือนเดิม (ต.ค.) ไม่เปลี่ยน", got: [pl([pn], "2026-11").expense, pl([pn], "2026-10").expense, pl([pn], "2026-11").purchaseNoteAdjustment], want: [-2000, 10000, -2000] },
    { name: "PUR-11: ใบยกเลิกไม่กระทบต้นทุน", got: pl([{ ...pn, status: "void" }], "2026-11").expense, want: 0 },
    { name: "PUR-11: ห้ามยกเลิก/ลบรายการเดิมที่มีใบใช้อยู่", got: [N.activePurchaseNotes(notes, "P1").length, N.activePurchaseNotes(notes, "P9").length], want: [2, 0] },
    // ---------- CTRL-03r ----------
    { name: "CTRL-03r: อ่านรายได้/ค่าใช้จ่าย + lastVerified จาก settings", got: [settings.snapshots?.["2026-10"]?.revenue, settings.snapshots?.["2026-10"]?.expense, settings.lastVerified], want: [100000, 30000, "2026-11"] },
    { name: "CTRL-03r: ค่าใช้จ่ายรวมเปลี่ยน (แก้ค่าใช้จ่ายไม่มี VAT ในชีต) → เตือน", got: P.periodTotalsDiffs(snapNew, { ...snap, revenue: 100000, expense: 30500 }).length, want: 1 },
    { name: "CTRL-03r: รายได้เปลี่ยน → เตือน", got: P.periodTotalsDiffs(snapNew, { ...snap, revenue: 99000, expense: 30000 }).length, want: 1 },
    { name: "CTRL-03r: ลายนิ้วมือรุ่นแรก (ไม่มีรายได้/ค่าใช้จ่าย) → ไม่เตือนผิด", got: P.periodTotalsDiffs(snap, { ...snap, revenue: 5, expense: 5 }), want: [] },
    { name: "CTRL-03r: ตรวจเฉพาะเดือนที่ปิดแล้ว ล่าสุด n เดือน", got: [P.snapshotMonthsToVerify(settings, 2), P.snapshotMonthsToVerify(settings)], want: [["2026-09", "2026-10"], ["2026-08", "2026-09", "2026-10"]] },
    { name: "CTRL-03r: ไม่มีลายนิ้วมือ → ไม่ต้องตรวจ", got: P.snapshotMonthsToVerify(P.readPeriodClose({ periodClose: { closedThrough: "2026-10" } })), want: [] },
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
