// UAT แก้ BUGS_20261116x1756 — TAX-01, CTRL-04c, CTRL-04d, CTRL-04e
// รัน: npx -y tsx scripts/uat_20261116x1803/bugs-1756-fixes.test.ts
(async () => {
  const P = await import("../../src/lib/period-close");
  const W = await import("../../src/lib/wht-doc-utils");
  const A = await import("../../src/lib/approval-policy");

  const now = "2026-11-05T03:00:00.000Z";
  // บันทึกค่าใช้จ่าย (จ่ายแล้ว) 5 พ.ย. หัก 3% — วันที่จ่าย = วันที่คีย์, ApprovedAt === PaidAt
  const paidToday = { Status: "paid", PaymentDate: "2026-11-05", CreatedAt: now, ApprovedAt: now, PaidAt: now, ReceiptDate: "2026-11-05", WTHAmount: "300" };
  const lateInvoice = { ...paidToday, ReceiptDate: "2026-09-28" };
  const lateWithClaim = { ...lateInvoice, VatClaimMonth: P.vatClaimMonthFor("2026-09-28", "2026-11-05", "2026-10").claimMonth };
  const closed = (r: Record<string, string>) => P.paymentReportDates(r).some((d) => P.isDateInClosedPeriod(d, "2026-10"));

  const rows: Record<string, string>[] = [
    { PaymentID: "W1", Description: "พนักงานบันทึกจ่าย 30 ต.ค.", Status: "pending", ApproveTo: "paid", PaymentDate: "2026-10-30", ReceiptDate: "2026-10-30" },
    { PaymentID: "W2", Description: "จ่ายแล้วถูกแก้ รออนุมัติใหม่", Status: "pending", ReapprovalOf: "paid", PaymentDate: "2026-10-12", ReceiptDate: "2026-10-10", PaidAt: "2026-10-12T02:00:00Z" },
    { PaymentID: "N1", Description: "จ่าย พ.ย.", Status: "pending", ApproveTo: "paid", PaymentDate: "2026-11-02", ReceiptDate: "2026-11-02" },
    { PaymentID: "R1", Description: "ขอเบิกปกติ", Status: "pending", DueDate: "2026-10-15" },
    { PaymentID: "A1", Description: "อนุมัติแล้วเปลี่ยนแปลง", Status: "pending", ReapprovalOf: "approved", PaymentDate: "2026-10-20" },
  ];

  const CASES: { name: string; got: unknown; want: unknown }[] = [
    // TAX-01
    { name: "TAX-01: ใบกำกับมาช้า + PUR-08 → ภ.ง.ด./50 ทวิ ยังลงวันจ่ายจริง (5 พ.ย.)", got: W.whtPeriodDate(lateWithClaim), want: "2026-11-05" },
    { name: "TAX-01: ใบกำกับมาช้า + PUR-08 → ไม่ถูกบล็อก (ไม่มีงวดปิดเปลี่ยน)", got: closed(lateWithClaim), want: false },
    { name: "TAX-01: ไม่มีเดือนใช้สิทธิ์แต่วันที่ ภ.ง.ด. ตกงวดปิด → บล็อก", got: closed(lateInvoice), want: true },
    { name: "TAX-01: ด่านปิดงวดมีวันที่ ภ.ง.ด. เสมอ (รายการมีหัก ณ ที่จ่าย)", got: P.paymentReportDates({ ...paidToday, VatClaimMonth: "2026-11", ReceiptDate: "2026-09-28", PaymentDate: "2026-11-05" }).includes(W.whtPeriodDate({ ...paidToday, VatClaimMonth: "2026-11" })), want: true },
    { name: "TAX-01: รายการไม่มีหัก ณ ที่จ่าย → ไม่เพิ่มวันที่ ภ.ง.ด.", got: P.paymentReportDates({ Status: "paid", PaymentDate: "2026-11-05", VatClaimMonth: "2026-11", ReceiptDate: "2026-09-28", WTHAmount: "0" }), want: ["2026-11-05", "2026-11-01"] },
    { name: "TAX-01: 50 ทวิ รุ่นเก่า (ไม่มีเดือนใช้สิทธิ์) ยังใช้วันที่ใบเสร็จเหมือนเดิม", got: W.resolveWhtCertDate(lateInvoice), want: "2026-09-28" },
    // CTRL-04c
    { name: "CTRL-04c: ปิด ต.ค. → เจอรายการจ่ายแล้วรออนุมัติ + แก้หลังจ่ายที่ลง ต.ค.", got: P.pendingSettlementsInPeriod(rows, "2026-10").map((r) => r.PaymentID), want: ["W1", "W2"] },
    { name: "CTRL-04c: ขอเบิกปกติ/แก้หลังอนุมัติ (ยังไม่จ่าย)/รายการ พ.ย. ไม่ขวางการปิด ต.ค.", got: P.pendingSettlementsInPeriod(rows.filter((r) => !["W1", "W2"].includes(r.PaymentID)), "2026-10").length, want: 0 },
    // CTRL-04d
    { name: "CTRL-04d: แก้ระหว่างรออนุมัติ → สะสมผู้แก้ ไม่ซ้ำ", got: [A.nextReapprovalBy("", "B", false), A.nextReapprovalBy("B", "C", false), A.nextReapprovalBy("B,C", "B", false)], want: ["B", "B,C", "B,C"] },
    { name: "CTRL-04d: แก้หลังอนุมัติ → เริ่มนับใหม่", got: A.nextReapprovalBy("B,C", "D", true), want: "D" },
    { name: "CTRL-04d: ผู้จัดการ B แก้ยอดของพนักงาน A → B อนุมัติไม่ได้ · ผู้อนุมัติ C ได้", got: [A.selfApprovalViolations([{ PaymentID: "X", CreatedByUserId: "A", ReapprovalBy: "B" }], "B", 1).length, A.selfApprovalViolations([{ PaymentID: "X", CreatedByUserId: "A", ReapprovalBy: "B" }], "C", 1).length], want: [1, 0] },
    { name: "CTRL-04d: ผู้แก้หลายคน — ทุกคนอนุมัติไม่ได้", got: ["B", "C"].map((u) => A.selfApprovalViolations([{ PaymentID: "X", CreatedByUserId: "A", ReapprovalBy: "B,C" }], u, 2).length), want: [1, 1] },
    { name: "CTRL-04d: กิจการไม่มีผู้อนุมัติคนอื่น → แก้แล้วอนุมัติเองได้", got: A.selfApprovalViolations([{ PaymentID: "X", CreatedByUserId: "A", ReapprovalBy: "B" }], "B", 0).length, want: 0 },
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
