// UAT แก้ BUGS_20261116x1222 (SALE-13/14/15, WHT-19, CTRL-10, DOC-05)
// รัน: npx -y tsx scripts/uat_20261116x1441/bugs-1222-fixes.test.ts
(async () => {
  const { receiptEditBlockReason, nextReceiptTaxDocMode } = await import("../../src/server/lib/receipt-output-vat");
  const { resolveWhtIncome } = await import("../../src/lib/wht-doc-utils");
  const { whtCertSignature } = await import("../../src/server/lib/wht-cert-pdf");
  const { salesDocFingerprint } = await import("../../src/server/lib/sales-doc-fingerprint");
  const { GoogleDriveService } = await import("../../src/server/services/google-drive.service");

  const tis: Record<string, string>[] = [
    { TaxInvoiceID: "TI1", SourceBillingID: "RC1", Status: "issued", DocNumber: "TI-2026-11-005" },
    { TaxInvoiceID: "TI2", SourceBillingID: "RC2", Status: "draft", DocNumber: "" },
    { TaxInvoiceID: "TI3", SourceBillingID: "RC3", Status: "void", DocNumber: "TI-2026-11-004" },
  ];
  const blocked = (r: Record<string, string>) => receiptEditBlockReason(r, tis) !== null;

  // ใบเสร็จ 2 รายการ (ใบวางบิล BL1) สำหรับลายนิ้วมือ
  const head = {
    BillingID: "BL1", DocNumber: "BL-2026-11-001", DocDate: "2026-11-02", CustomerNameSnapshot: "บจก. ลูกค้า",
    Subtotal: "1000", VATAmount: "70", GrandTotal: "1070", Status: "sent", PaidAmount: "",
    UpdatedAt: "2026-11-02T03:00:00Z", PdfUrl: "https://drive.google.com/file/d/abc/view", PdfFor: "2026-11-02T03:00:00Z",
  };
  const lines = [
    { LineID: "BILL-1", BillingID: "BL1", LineNumber: "1", Description: "ค่าออกแบบ", Quantity: "1", UnitPrice: "1000", LineTotal: "1000" },
  ];
  const fp0 = salesDocFingerprint("billing", head, lines);
  const fpTouched = salesDocFingerprint(
    "billing",
    { ...head, UpdatedAt: "2026-11-05T01:00:00Z", PaymentEvidenceUrl: "https://x", PdfFor: "x", ReceiptNumber: "RC-2026-11-003", ReceiptDate: "2026-11-05", TaxDocMode: "" },
    [{ ...lines[0], LineID: "BILL-99" }],
  );
  const fpNewCol = salesDocFingerprint("billing", { ...head, VoidReason: "", PdfContentFor: "zzz" }, lines);
  const fpPaid = salesDocFingerprint("billing", { ...head, PaidAmount: "500", Status: "partial" }, lines);
  const fpDesc = salesDocFingerprint("billing", head, [{ ...lines[0], Description: "ค่าออกแบบโลโก้" }]);
  const fpReceiptA = salesDocFingerprint("receipt", { ...head, ReceiptNumber: "RC-2026-11-003" }, lines);
  const fpReceiptB = salesDocFingerprint("receipt", { ...head, ReceiptNumber: "RC-2026-11-004" }, lines);

  const pay = { WTHAmount: "300", PctWTH: "3", TTLAmount: "10000", PayeeID: "P1", PaymentDate: "2026-11-03", ReceiptDate: "", Description: "ค่าทนาย" };

  const CASES: { name: string; got: unknown; want: unknown }[] = [
    // SALE-13
    { name: "SALE-13: โหมดรวม (ใบเสร็จ/ใบกำกับ) → แก้ไม่ได้", got: blocked({ BillingID: "RC9", TaxDocMode: "combined", Status: "paid" }), want: true },
    { name: "SALE-13: โหมดแยก มีใบกำกับคู่ออกเลขแล้ว → แก้ไม่ได้", got: blocked({ BillingID: "RC1", TaxDocMode: "separate", Status: "paid" }), want: true },
    { name: "SALE-13: โหมดแยก ใบกำกับคู่ยังเป็นร่าง → แก้ได้", got: blocked({ BillingID: "RC2", TaxDocMode: "separate", Status: "paid" }), want: false },
    { name: "SALE-13: โหมดแยก ใบกำกับคู่ถูกยกเลิกแล้ว → แก้ได้", got: blocked({ BillingID: "RC3", TaxDocMode: "separate", Status: "paid" }), want: false },
    { name: "SALE-13: ใบเสร็จธรรมดา (ไม่มี VAT) → แก้ได้ตามเดิม", got: blocked({ BillingID: "RC8", TaxDocMode: "", Status: "paid" }), want: false },
    { name: "SALE-13: ใบที่ยกเลิกแล้ว → แก้ไม่ได้", got: blocked({ BillingID: "RC8", TaxDocMode: "", Status: "void" }), want: true },
    // SALE-14
    { name: "SALE-14: ไม่มี VAT → แก้เป็นมี VAT (องค์กรโหมดรวม) → combined", got: nextReceiptTaxDocMode("", true, false, "combined"), want: "combined" },
    { name: "SALE-14: ไม่มี VAT → แก้เป็นมี VAT (องค์กรโหมดแยก) → separate (ออกใบกำกับคู่)", got: nextReceiptTaxDocMode("", true, false, "separate"), want: "separate" },
    { name: "SALE-14: โหมดแยก แก้เป็นไม่มี VAT → ล้างโหมด", got: nextReceiptTaxDocMode("separate", false, true, "separate"), want: "" },
    { name: "SALE-14: ใบเก่ามี VAT ก่อนมีโหมด → คงเดิม (ไม่ออกใบกำกับย้อนหลัง)", got: nextReceiptTaxDocMode("", true, true, "separate"), want: "" },
    { name: "SALE-14: โหมดที่ snapshot ไว้ไม่เปลี่ยนตามตั้งค่าใหม่", got: nextReceiptTaxDocMode("separate", true, true, "combined"), want: "separate" },
    // WHT-19
    { name: "WHT-19: วิชาชีพอิสระ 3% (เก็บประเภทไว้) → ค่าวิชาชีพอิสระ", got: resolveWhtIncome("professional-3", 3).label, want: "ค่าวิชาชีพอิสระ" },
    { name: "WHT-19: รับเหมา 3% (เก็บประเภทไว้) → ค่าจ้างทำของ/รับเหมา", got: resolveWhtIncome("contract-3", 3).label, want: "ค่าจ้างทำของ/รับเหมา" },
    { name: "WHT-19: นายหน้า 3% → ข้อ 2", got: resolveWhtIncome("commission-3", 3).section, want: "2" },
    { name: "WHT-19: แถวเก่า 3% ไม่มีประเภท → ค่าบริการ (เหมือนเดิม)", got: resolveWhtIncome("", 3).label, want: "ค่าบริการ" },
    { name: "WHT-19: แถวเก่า 1% ไม่มีประเภท → ค่ารับเหมา/บริการ (ไม่ใช่ค่าขนส่ง)", got: [resolveWhtIncome(undefined, 1).label, resolveWhtIncome(undefined, 1).section], want: ["ค่ารับเหมา/บริการ", "5"] },
    { name: "WHT-19: ค่าขนส่ง 1% ที่เลือกจริง → ค่าขนส่ง", got: resolveWhtIncome("transport-1", 1).label, want: "ค่าขนส่ง" },
    { name: "WHT-19: เก็บ contract-3 แต่แก้ % เป็น 5 ทีหลัง → เดาจาก % (ค่าเช่า)", got: resolveWhtIncome("contract-3", 5).label, want: "ค่าเช่า" },
    { name: "WHT-19: กำหนดเอง 3% → เดาจาก % (ค่าบริการ ข้อ 5 เหมือนเดิม)", got: [resolveWhtIncome("custom", 3).label, resolveWhtIncome("custom", 3).section], want: ["ค่าบริการ", "5"] },
    { name: "WHT-19: ลายนิ้วมือ 50 ทวิ แถวเก่า (ไม่มีประเภท) ไม่เปลี่ยน → ไม่เกิด _v2 หลัง deploy", got: whtCertSignature(pay), want: "300|3|10000|P1|2026-11-03||ค่าทนาย" },
    { name: "WHT-19: เปลี่ยนประเภท → ลายนิ้วมือเปลี่ยน (ได้ฉบับใหม่)", got: whtCertSignature({ ...pay, WthTypeId: "professional-3" }) !== whtCertSignature({ ...pay, WthTypeId: "service-3" }), want: true },
    // CTRL-10
    { name: "CTRL-10: แนบสลิป/ออกใบเสร็จ/LineID ใหม่ — สิ่งที่พิมพ์บนใบวางบิลเหมือนเดิม → ไฟล์เดิม", got: fpTouched === fp0, want: true },
    { name: "CTRL-10: คอลัมน์ใหม่ที่ยังว่าง / คอลัมน์ลายนิ้วมือเอง → ไม่ทำให้เปลี่ยน", got: fpNewCol === fp0, want: true },
    { name: "CTRL-10: รับเงินบางส่วน (ใบวางบิลพิมพ์ยอดชำระแล้ว) → เวอร์ชันใหม่", got: fpPaid !== fp0, want: true },
    { name: "CTRL-10: แก้รายละเอียดรายการ → เวอร์ชันใหม่", got: fpDesc !== fp0, want: true },
    { name: "CTRL-10: เลขใบเสร็จพิมพ์บนใบเสร็จ → ต่างกัน", got: fpReceiptA !== fpReceiptB, want: true },
    // DOC-05 helper
    { name: "DOC-05: อ่าน file id จากลิงก์ Drive", got: [GoogleDriveService.fileIdFromUrl("https://drive.google.com/file/d/1AbCdEfGhIjK_lm-no/view?usp=drivesdk"), GoogleDriveService.fileIdFromUrl("https://drive.google.com/open?id=1AbCdEfGhIjK_lm-no"), GoogleDriveService.fileIdFromUrl("")], want: ["1AbCdEfGhIjK_lm-no", "1AbCdEfGhIjK_lm-no", null] },
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
