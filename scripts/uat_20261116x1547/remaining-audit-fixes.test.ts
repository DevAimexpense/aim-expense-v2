// UAT ข้อค้างจาก audit รอบแรก (PUR-02d, LINE-40, DOC-05b) — RPT-08, SALE-09, PUR-09, CTRL-05, RPT-12, PUR-15,
// WHT-20, CTRL-06 เปลี่ยนที่ router/หน้าเว็บ (ตรวจด้วยการอ่านโค้ด + tsc/build)
// รัน: npx -y tsx scripts/uat_20261116x1547/remaining-audit-fixes.test.ts
(async () => {
  const { taxableBaseFromVat } = await import("../../src/lib/calculations");
  const { paymentsCacheMayHideRetry, SAVING_STALE_MS } = await import("../../src/lib/line/draft-status");
  const { ttlForTab } = await import("../../src/server/lib/cache");
  const { isVersionOf } = await import("../../src/server/services/google-drive.service");

  const CASES: { name: string; got: unknown; want: unknown }[] = [
    // PUR-02d: ใบซูเปอร์ฯ ยอดก่อน VAT 967.29 (สินค้า VAT 467.29 + ผักยกเว้น 500) VAT ตามใบ 32.71 → ฐานที่เสียภาษี 467.29
    { name: "PUR-02d: ใบมีของยกเว้น VAT ปน → ฐานภาษีซื้อ = VAT ÷ 7%", got: taxableBaseFromVat(967.29, 32.71), want: 467.29 },
    { name: "PUR-02d: ใบปกติ VAT 7% เต็ม → ฐาน = ยอดก่อน VAT เดิม", got: taxableBaseFromVat(1000, 70), want: 1000 },
    { name: "PUR-02d: ปัดเศษคลาด 1 สตางค์ → ถือว่าเต็ม 7%", got: taxableBaseFromVat(1000, 69.99), want: 1000 },
    { name: "PUR-02d: ไม่มี VAT → ฐานเดิม", got: taxableBaseFromVat(500, 0), want: 500 },
    // LINE-40
    { name: "LINE-40: ค่าปัจจุบัน (TTL Payments + webhook 30 วิ < 180 วิ) → ไม่ต้องอ่านสด (ไม่เสีย quota)", got: paymentsCacheMayHideRetry(ttlForTab("Payments")), want: false },
    { name: "LINE-40: ถ้าตั้ง TTL Payments 300 วิ → ต้องอ่านสด", got: paymentsCacheMayHideRetry(300), want: true },
    { name: "LINE-40: webhook นาน 160 วิ + TTL 90 → ต้องอ่านสด", got: paymentsCacheMayHideRetry(90, 160_000, SAVING_STALE_MS), want: true },
    // DOC-05b: 50 ทวิ ชื่อขึ้นต้นด้วยวันที่ → หาฉบับก่อนด้วย PaymentID
    {
      name: "DOC-05b: ฉบับเดิมวันที่เก่า + _v2 วันที่ใหม่ เป็นเอกสารเดียวกัน (PaymentID ตรง)",
      got: [
        isVersionOf("20261030_wht-cert_ค่าทนาย_PMT-1.pdf", "20261102_wht-cert_ค่าทนาย_PMT-1", "_PMT-1"),
        isVersionOf("20261030_wht-cert_ค่าทนาย_PMT-1_v2.pdf", "20261102_wht-cert_ค่าทนาย_PMT-1", "_PMT-1"),
      ],
      want: [true, true],
    },
    { name: "DOC-05b: เอกสารของรายการอื่นในโฟลเดอร์เดียวกัน → ไม่ใช่", got: isVersionOf("20261030_wht-cert_ค่าทนาย_PMT-2.pdf", "20261102_wht-cert_ค่าทนาย_PMT-1", "_PMT-1"), want: false },
    { name: "DOC-05b: รหัสที่ขึ้นต้นเหมือนกัน (PMT-10 vs PMT-1) → ไม่ใช่", got: isVersionOf("20261030_wht-cert_x_PMT-10.pdf", "20261102_wht-cert_x_PMT-1", "_PMT-1"), want: false },
    { name: "DOC-05b: เอกสารขาย (ไม่มี relatedKey) → ใช้ชื่อขึ้นต้นเหมือนเดิม", got: [isVersionOf("RC-2026-11-001_ลูกค้า_v2.pdf", "RC-2026-11-001_ลูกค้า"), isVersionOf("RC-2026-11-0010_ลูกค้า.pdf", "RC-2026-11-001_ลูกค้า")], want: [true, false] },
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
