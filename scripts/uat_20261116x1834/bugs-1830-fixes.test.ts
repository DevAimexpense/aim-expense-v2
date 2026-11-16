// UAT แก้ BUGS_20261116x1830 — CTRL-03r-01 (ลายนิ้วมือนับเฉพาะสิ่งที่ปิดงวดล็อกไว้) · PUR-11b (ตรวจก่อนอัปโหลด — อ่านโค้ด)
// รัน: npx -y tsx scripts/uat_20261116x1834/bugs-1830-fixes.test.ts
(async () => {
  const { lockedMonthTotals, periodTotalsDiffs } = await import("../../src/lib/period-close");
  type Rows = Record<string, string>[];
  const empty: { payments: Rows; billings: Rows; taxInvoices: Rows; creditNotes: Rows; purchaseNotes: Rows } = {
    payments: [],
    billings: [],
    taxInvoices: [],
    creditNotes: [],
    purchaseNotes: [],
  };
  const req = { PaymentID: "R1", TTLAmount: "5000", VATAmount: "0", DueDate: "2026-10-28", CreatedAt: "2026-10-20T03:00:00Z" };
  const oct = (d: Partial<typeof empty>) => lockedMonthTotals({ ...empty, ...d }, "2026-10");

  // ขอเบิก due 28 ต.ค.: ตอนปิด (pending) → อนุมัติ → จ่าย 10 พ.ย.
  const atClose = oct({ payments: [{ ...req, Status: "pending" }] });
  const approved = oct({ payments: [{ ...req, Status: "approved" }] });
  const paidNov = oct({ payments: [{ ...req, Status: "paid", PaymentDate: "2026-11-10" }] });
  const paidOct = { ...req, Status: "paid", PaymentDate: "2026-10-15" };

  const bill = { BillingID: "B1", Status: "draft", DocDate: "2026-10-25", Subtotal: "20000" };
  const receipt = { BillingID: "RC1", DocKind: "receipt", Status: "paid", DocDate: "2026-10-05", ReceiptDate: "2026-10-05", Subtotal: "8000" };
  const billingPaid = { BillingID: "B2", Status: "paid", DocDate: "2026-09-20", ReceiptDate: "2026-10-02", Subtotal: "3000" };
  const tiStandalone = { TaxInvoiceID: "T1", Status: "issued", DocDate: "2026-10-10", Subtotal: "1000", SourceBillingID: "" };
  const tiFromReceipt = { TaxInvoiceID: "T2", Status: "issued", DocDate: "2026-10-05", Subtotal: "8000", SourceBillingID: "RC1" };
  const cn = { NoteID: "C1", Kind: "credit", Status: "issued", DocDate: "2026-10-20", DiffAmount: "500" };
  const pn = { NoteID: "PN1", Kind: "credit", Status: "active", ReceivedDate: "2026-10-22", BaseAmount: "200", PaymentID: "X" };

  const snap = { outputVat: 0, inputVat: 0, wht: 0, ...atClose };

  const CASES: { name: string; got: unknown; want: unknown }[] = [
    { name: "CTRL-03r-01: ขอเบิก due เดือนปิด — ตอนปิด/อนุมัติ/จ่ายเดือนถัดไป → ค่าใช้จ่ายเดือนปิดไม่เปลี่ยน", got: [atClose.expense, approved.expense, paidNov.expense], want: [0, 0, 0] },
    { name: "CTRL-03r-01: อนุมัติหลังปิด → ไม่เตือน", got: periodTotalsDiffs(snap, approved), want: [] },
    { name: "CTRL-03r-01: รายการจ่ายแล้วในเดือน (ถูกล็อก) นับตามวันที่จ่าย", got: oct({ payments: [paidOct] }).expense, want: 5000 },
    { name: "CTRL-03r-01: แก้ยอดรายการจ่ายแล้วในชีตตรง → เตือน", got: periodTotalsDiffs({ ...snap, ...oct({ payments: [paidOct] }) }, oct({ payments: [{ ...paidOct, TTLAmount: "5500" }] })).length, want: 1 },
    { name: "CTRL-03r-01: ใบลดหนี้ผู้ขายลดค่าใช้จ่ายเดือนที่ได้รับ", got: oct({ payments: [paidOct], purchaseNotes: [pn] }).expense, want: 4800 },
    { name: "CTRL-03r-01: ใบวางบิลร่าง → ส่ง หลังปิด → รายได้เดือนปิดไม่เปลี่ยน", got: [oct({ billings: [bill] }).revenue, oct({ billings: [{ ...bill, Status: "sent" }] }).revenue], want: [0, 0] },
    { name: "CTRL-03r-01: รายได้ = ใบเสร็จตามวันที่ใบเสร็จ + ใบกำกับไม่มีต้นทาง − ใบลดหนี้ (ใบกำกับคู่ใบเสร็จไม่นับซ้ำ)", got: oct({ billings: [receipt, billingPaid, bill], taxInvoices: [tiStandalone, tiFromReceipt], creditNotes: [cn] }).revenue, want: 11500 },
    { name: "CTRL-03r-01: ใบเสร็จที่ยกเลิก/ใบกำกับที่ยกเลิก ไม่นับ", got: oct({ billings: [{ ...receipt, Status: "void" }], taxInvoices: [{ ...tiStandalone, Status: "void" }] }).revenue, want: 0 },
    { name: "CTRL-03r-01: ไม่ขึ้นกับตั้งค่าจด VAT (ไม่รวม VAT ทั้งสองฝั่ง)", got: oct({ payments: [{ ...paidOct, VATAmount: "350", DocumentType: "tax_invoice" }] }).expense, want: 5000 },
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
