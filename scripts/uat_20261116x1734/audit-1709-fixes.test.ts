// UAT แก้ AUDIT_ACCOUNTING_20261116x1709 — CTRL-04b, PUR-08, WHT-13b, CTRL-03
// รัน: npx -y tsx scripts/uat_20261116x1734/audit-1709-fixes.test.ts
(async () => {
  const { canApprovePayments, initialPaymentStatus, selfApprovalViolations } = await import("../../src/lib/approval-policy");
  const P = await import("../../src/lib/period-close");
  const { isInputVatClaimable } = await import("../../src/lib/input-vat-rules");
  const { resolveWhtIncome } = await import("../../src/lib/wht-doc-utils");

  const rows = [
    { PaymentID: "A", CreatedByUserId: "u1", CreatedBy: "สมชาย" },
    { PaymentID: "B", CreatedByUserId: "u2", CreatedBy: "สมหญิง", ReapprovalBy: "u1" },
    { PaymentID: "C", CreatedByUserId: "u2", CreatedBy: "สมหญิง" },
    // กลุ่ม LINE: บันทึกในนามแอดมิน u1 ที่ผูกกลุ่ม แต่คนส่งคือ L-staff
    { PaymentID: "G", CreatedByUserId: "u1", CreatedBy: "LINE OA", LineSenderId: "L-staff" },
    // LINE ส่วนตัวของ u1 เอง
    { PaymentID: "S", CreatedByUserId: "u1", CreatedBy: "LINE OA", LineSenderId: "L-u1" },
    // LINE ข้อมูลเก่า ไม่มีผู้ส่ง
    { PaymentID: "O", CreatedByUserId: "u1", CreatedBy: "LINE OA" },
  ];
  const ids = (r: { PaymentID: string }[]) => r.map((x) => x.PaymentID);

  const snapSettings = P.readPeriodClose({
    periodClose: {
      closedThrough: "2026-10",
      managers: [],
      snapshots: { "2026-10": { outputVat: 7000, inputVat: 2100.5, wht: 300 }, bad: { outputVat: 1 } },
    },
  });

  const CASES: { name: string; got: unknown; want: unknown }[] = [
    // ---------- CTRL-04b ----------
    { name: "CTRL-04b: admin / มีสิทธิ์อนุมัติ / พนักงาน", got: [canApprovePayments("admin", {}), canApprovePayments("staff", { approvePayments: true }), canApprovePayments("staff", {})], want: [true, true, false] },
    { name: "CTRL-04b: พนักงานบันทึก 'จ่ายแล้ว' → รออนุมัติ + อนุมัติแล้วเป็นจ่ายแล้ว", got: initialPaymentStatus("paid", false), want: { status: "pending", approveTo: "paid" } },
    { name: "CTRL-04b: ผู้มีสิทธิ์อนุมัติบันทึก 'จ่ายแล้ว' → จ่ายแล้วทันที", got: initialPaymentStatus("paid", true), want: { status: "paid", approveTo: "" } },
    { name: "CTRL-04b: ขอเบิกปกติ → รออนุมัติ", got: initialPaymentStatus("pending", false), want: { status: "pending", approveTo: "" } },
    { name: "CTRL-04b: มีผู้อนุมัติอื่น → u1 อนุมัติของตัวเอง/ที่ตัวเองแก้/LINE ส่วนตัวไม่ได้ · กลุ่ม LINE ได้ · LINE เก่าไม่มีผู้ส่งได้", got: ids(selfApprovalViolations(rows, "u1", 1, "L-u1")), want: ["A", "B", "S"] },
    { name: "CTRL-04b: ไม่มีผู้อนุมัติคนอื่น (กิจการคนเดียว) → อนุมัติเองได้ทั้งหมด", got: ids(selfApprovalViolations(rows, "u1", 0, "L-u1")), want: [] },
    { name: "CTRL-04b: ผู้อนุมัติไม่มี LINE → ไม่ถูกจับคู่กับรายการ LINE", got: ids(selfApprovalViolations(rows, "u1", 2, null)), want: ["A", "B"] },

    // ---------- PUR-08 ----------
    { name: "PUR-08: เดือนของใบยังเปิด → ลงเดือนของใบ", got: P.vatClaimMonthFor("2026-11-03", "2026-11-10", "2026-10"), want: { claimMonth: "", lateClaim: false } },
    { name: "PUR-08: ใบ ก.ย. (ปิดแล้ว) จ่าย พ.ย. → ใช้สิทธิ์ พ.ย.", got: P.vatClaimMonthFor("2026-09-20", "2026-11-05", "2026-10"), want: { claimMonth: "2026-11", lateClaim: false } },
    { name: "PUR-08: จ่ายก่อนเดือนที่เปิดแรก → ใช้เดือนแรกที่เปิด", got: P.vatClaimMonthFor("2026-08-20", "2026-09-01", "2026-10").claimMonth, want: "2026-11" },
    { name: "PUR-08: เกิน 6 เดือน (ใบ เม.ย. → พ.ย.) → ขอคืนไม่ได้", got: P.vatClaimMonthFor("2026-04-30", "2026-11-05", "2026-10"), want: { claimMonth: "2026-11", lateClaim: true } },
    { name: "PUR-08: ครบ 6 เดือนพอดี (ใบ พ.ค. → พ.ย.) → ยังขอคืนได้", got: P.vatClaimMonthFor("2026-05-02", "2026-11-05", "2026-10").lateClaim, want: false },
    { name: "PUR-08: ข้ามปี (ใบ ธ.ค. 69 ปิดแล้ว → ม.ค. 70)", got: P.vatClaimMonthFor("2026-12-15", "2027-01-05", "2026-12"), want: { claimMonth: "2027-01", lateClaim: false } },
    { name: "PUR-08: ไม่เคยปิดงวด → ลงเดือนของใบ", got: P.vatClaimMonthFor("2026-01-15", "2026-11-05", "").claimMonth, want: "" },
    { name: "PUR-08: วันที่จัดงวดรายงาน = เดือนใช้สิทธิ์ / ไม่มี = วันที่ใบ", got: [P.inputVatPeriodDate({ VatClaimMonth: "2026-11" }, "2026-09-20"), P.inputVatPeriodDate({}, "2026-09-20")], want: ["2026-11-01", "2026-09-20"] },
    { name: "PUR-08: มีเดือนใช้สิทธิ์ → วันที่ใบเดือนปิดไม่บล็อกการแก้ (ด่านปิดงวดใช้เดือนใช้สิทธิ์)", got: P.paymentReportDates({ Status: "paid", ReceiptDate: "2026-09-20", PaymentDate: "2026-11-05", VatClaimMonth: "2026-11" }).some((d) => P.isDateInClosedPeriod(d, "2026-10")), want: false },
    { name: "PUR-08: ไม่มีเดือนใช้สิทธิ์ → วันที่ใบเดือนปิดยังบล็อก (เหมือนเดิม)", got: P.paymentReportDates({ Status: "paid", ReceiptDate: "2026-09-20", PaymentDate: "2026-11-05" }).some((d) => P.isDateInClosedPeriod(d, "2026-10")), want: true },
    { name: "PUR-08: เกิน 6 เดือน → ตั้ง late_claim (ใบเต็มรูปที่ยังไม่มีเหตุอื่น)", got: P.lateClaimPatch({ DocumentType: "tax_invoice", NonDeductibleVat: "" }, true), want: { NonDeductibleVat: "late_claim" } },
    { name: "PUR-08: ไม่ทับเหตุต้องห้ามที่ผู้ใช้เลือก", got: P.lateClaimPatch({ DocumentType: "tax_invoice", NonDeductibleVat: "passenger_car" }, true), want: {} },
    { name: "PUR-08: แก้วันที่ใบจนไม่เกิน 6 เดือนแล้ว → ล้าง late_claim", got: P.lateClaimPatch({ DocumentType: "tax_invoice", NonDeductibleVat: "late_claim" }, false), want: { NonDeductibleVat: "" } },
    { name: "PUR-08: late_claim → ไม่เข้าภาษีซื้อ", got: isInputVatClaimable({ DocumentType: "tax_invoice", NonDeductibleVat: "late_claim" }), want: false },

    // ---------- WHT-13b ----------
    { name: "WHT-13b: ประเภทที่เลือก (ค่าเช่า 5%) → ใบแนบกับ 50 ทวิ ใช้คำเดียวกัน", got: resolveWhtIncome("rental-5", 5).label, want: "ค่าเช่า" },
    { name: "WHT-13b: นายหน้า 3% ไม่ถูกพิมพ์เป็นค่าบริการ", got: resolveWhtIncome("commission-3", 3).label, want: "ค่านายหน้า" },
    { name: "WHT-13b: ไม่มีประเภท → เดาจากอัตรา (ไม่ใช้ชื่อหมวด/คำอธิบายรายการ)", got: typeof resolveWhtIncome(undefined, 3).label === "string" && resolveWhtIncome(undefined, 3).label !== "", want: true },

    // ---------- CTRL-03 ----------
    { name: "CTRL-03: อ่านลายนิ้วมือจาก settings (ข้ามคีย์ผิดรูปแบบ)", got: Object.keys(snapSettings.snapshots || {}), want: ["2026-10"] },
    { name: "CTRL-03: ปิดเพิ่ม ก.ย.→พ.ย. = เก็บ ต.ค. พ.ย.", got: P.monthsToSnapshot("2026-09", "2026-11"), want: ["2026-10", "2026-11"] },
    { name: "CTRL-03: ปิดครั้งแรก → เก็บ 12 เดือนล่าสุด", got: (() => { const m = P.monthsToSnapshot("", "2026-10"); return [m.length, m[0], m[11]]; })(), want: [12, "2025-11", "2026-10"] },
    { name: "CTRL-03: เก็บแค่ 24 เดือนล่าสุด", got: Object.keys(P.mergeSnapshots(Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`2024-${String((i % 12) + 1).padStart(2, "0")}`, { outputVat: 0, inputVat: 0, wht: 0 }])), { "2026-10": { outputVat: 1, inputVat: 1, wht: 1 } })).length, want: 13 },
    { name: "CTRL-03: เปิดงวดตั้งแต่ ต.ค. → ลบลายนิ้วมือ ต.ค. เป็นต้นไป", got: Object.keys(P.dropSnapshotsFrom({ "2026-09": { outputVat: 0, inputVat: 0, wht: 0 }, "2026-10": { outputVat: 0, inputVat: 0, wht: 0 } }, "2026-10")), want: ["2026-09"] },
    { name: "CTRL-03: ยอดตรง (ต่างแค่เศษทศนิยม) → ไม่เตือน", got: P.periodTotalsDiffs(snapSettings.snapshots!["2026-10"], { outputVat: 7000.001, inputVat: 2100.5 }), want: [] },
    { name: "CTRL-03: ภาษีซื้อเปลี่ยน → เตือน", got: P.periodTotalsDiffs(snapSettings.snapshots!["2026-10"], { outputVat: 7000, inputVat: 2800.5 }).length, want: 1 },
    { name: "CTRL-03: ภาษีหัก ณ ที่จ่ายเปลี่ยน → เตือน", got: P.periodTotalsDiffs(snapSettings.snapshots!["2026-10"], { wht: 450 }).length, want: 1 },
    { name: "CTRL-03: เทียบเฉพาะรายงานเดือนเต็มที่ปิดแล้วและมีลายนิ้วมือ", got: [P.singleClosedMonth("2026-10-01", "2026-10-31", snapSettings), P.singleClosedMonth("2026-10-01", "2026-10-15", snapSettings), P.singleClosedMonth("2026-09-01", "2026-10-31", snapSettings), P.singleClosedMonth("2026-11-01", "2026-11-30", snapSettings), P.singleClosedMonth("2026-09-01", "2026-09-30", snapSettings)], want: ["2026-10", "", "", "", ""] },
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
