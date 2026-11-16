// UAT แก้ BUGS_20261116x1452 (WHT-19b, CTRL-11, SALE-17) — SALE-16 (lock) / SALE-18 (audit) / CTRL-12 (route) ตรวจด้วยการอ่านโค้ด
// รัน: npx -y tsx scripts/uat_20261116x1459/bugs-1452-fixes.test.ts
(async () => {
  const { wthTypeIdToSend } = await import("../../src/lib/wth-types");
  const { salesDocFingerprint } = await import("../../src/server/lib/sales-doc-fingerprint");
  const { replacementNote, withReplacementNote } = await import("../../src/server/lib/ti-replacement");

  const send = (o: Partial<Parameters<typeof wthTypeIdToSend>[0]>) =>
    wthTypeIdToSend({ isEdit: true, storedId: undefined, initialId: "transport-1", chosenId: "transport-1", rate: 1, ...o });

  const ti = {
    TaxInvoiceID: "TI1", DocNumber: "TI-2026-11-005", DocDate: "2026-11-02", CustomerNameSnapshot: "บจก. ลูกค้า",
    Subtotal: "1000", VATAmount: "70", GrandTotal: "1070", Status: "issued", UpdatedAt: "a",
  };
  const tiLines = [{ LineID: "TIL-1", TaxInvoiceID: "TI1", LineNumber: "1", Description: "ค่าบริการ", LineTotal: "1000" }];
  const fpTi = salesDocFingerprint("tax-invoice", ti, tiLines);
  const fpTiPaid = salesDocFingerprint(
    "tax-invoice",
    { ...ti, UpdatedAt: "b", PaidAmount: "1040", PaidDate: "2026-11-10", PaymentMethod: "transfer", PaymentWHTPercent: "3", PaymentWHTAmount: "30", PaymentAdjustmentAmount: "0", PaymentAdjustmentNote: "x", PaymentRecordedAt: "t" },
    tiLines,
  );
  const fpTiVoid = salesDocFingerprint("tax-invoice", { ...ti, Status: "void" }, tiLines);
  const qt = { QuotationID: "Q1", DocNumber: "QT-2026-11-001", Status: "sent", Subtotal: "1000", UpdatedAt: "a" };
  const fpQt = salesDocFingerprint("quotation", qt, []);
  const fpQtAcc = salesDocFingerprint("quotation", { ...qt, Status: "converted", UpdatedAt: "b" }, []);

  const voided = [
    { TaxInvoiceID: "A", Status: "void", DocNumber: "TI-2026-10-003", VoidedAt: "2026-11-01T01:00:00Z", VoidReason: "ยอดผิด" },
    { TaxInvoiceID: "B", Status: "void", DocNumber: "TI-2026-10-007", VoidedAt: "2026-11-05T01:00:00Z", VoidReason: "ชื่อลูกค้าผิด" },
    { TaxInvoiceID: "C", Status: "draft", DocNumber: "" },
  ];

  const CASES: { name: string; got: unknown; want: unknown }[] = [
    // WHT-19b
    { name: "WHT-19b: แก้รายการเก่า 1% ไม่เปลี่ยนประเภท → ไม่ส่ง (ไม่บันทึก ค่าขนส่ง ทับ)", got: send({}), want: undefined },
    { name: "WHT-19b: แก้รายการเก่า 3% ไม่เปลี่ยน → ไม่ส่ง (ไม่เกิด 50 ทวิ _v2)", got: send({ initialId: "service-3", chosenId: "service-3", rate: 3 }), want: undefined },
    { name: "WHT-19b: แก้รายการเก่า เปลี่ยนเป็นวิชาชีพอิสระ → ส่ง professional-3", got: send({ initialId: "service-3", chosenId: "professional-3", rate: 3 }), want: "professional-3" },
    { name: "WHT-19b: รายการที่เก็บประเภทไว้แล้ว → ส่งค่าปัจจุบัน", got: send({ storedId: "contract-3", initialId: "contract-3", chosenId: "contract-3", rate: 3 }), want: "contract-3" },
    { name: "WHT-19b: สร้างใหม่ → ส่งค่าที่เลือก", got: send({ isEdit: false, chosenId: "ad-2", initialId: "none", rate: 2 }), want: "ad-2" },
    { name: "WHT-19b: เอาหัก ณ ที่จ่ายออก (มีประเภทเก่า) → ล้าง", got: send({ storedId: "service-3", chosenId: "none", rate: 0 }), want: "" },
    { name: "WHT-19b: ไม่มีหัก ณ ที่จ่ายและไม่เคยเก็บ → ไม่ส่ง", got: send({ chosenId: "none", initialId: "none", rate: 0 }), want: undefined },
    // CTRL-11
    { name: "CTRL-11: ใบกำกับ — บันทึกรับชำระ (ไม่พิมพ์บนใบ) → ไฟล์เดิม", got: fpTiPaid === fpTi, want: true },
    { name: "CTRL-11: ใบกำกับ — ยกเลิก (มีตรายกเลิก) → เวอร์ชันใหม่", got: fpTiVoid !== fpTi, want: true },
    { name: "CTRL-11: ใบเสนอราคา — เปลี่ยนสถานะ → ไฟล์เดิม", got: fpQtAcc === fpQt, want: true },
    // SALE-17
    { name: "SALE-17: อ้างฉบับที่ยกเลิกล่าสุด + เหตุผล", got: replacementNote(voided), want: "ออกแทนใบกำกับภาษีเลขที่ TI-2026-10-007 ซึ่งยกเลิกแล้ว (เหตุผล: ชื่อลูกค้าผิด)" },
    { name: "SALE-17: ไม่เคยมีใบยกเลิก → ไม่มีข้อความ", got: replacementNote([{ Status: "issued", DocNumber: "TI-1" }]), want: "" },
    { name: "SALE-17: ต่อหน้าหมายเหตุเดิม", got: withReplacementNote("ชำระภายใน 30 วัน", "ออกแทน X"), want: "ออกแทน X\nชำระภายใน 30 วัน" },
    { name: "SALE-17: ผู้ใช้เขียนอ้างไว้เองแล้ว → ไม่ซ้ำ", got: withReplacementNote("ออกแทนฉบับ TI-9", "ออกแทน X"), want: "ออกแทนฉบับ TI-9" },
    { name: "SALE-17: ไม่ใช่ใบออกแทน → หมายเหตุเดิม", got: withReplacementNote("abc", ""), want: "abc" },
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
