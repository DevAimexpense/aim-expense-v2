// UAT SALE-24 (โหมดรวมต้องมีสาขาผู้ซื้อที่จด VAT) + PUR-04c (การ์ด LINE = ที่บันทึก)
// รัน: npx -y tsx scripts/uat_20261116x1708/sale24-pur04c.test.ts
(async () => {
  const { combinedReceiptBuyerBranchError } = await import("../../src/lib/branch-label");
  const { ocrDocTypeLabel, nonClaimableNotice, classifyOcrPurchaseDoc } = await import("../../src/lib/input-vat-rules");
  const ORG = "0105560000009";
  const CASES: { name: string; got: unknown; want: unknown }[] = [
    { name: "SALE-24: โหมดรวม + ลูกค้ามีเลขภาษี + ไม่มีสาขา → ปฏิเสธ", got: !!combinedReceiptBuyerBranchError("combined", { TaxID: "0105556000001", BranchType: "" }), want: true },
    { name: "SALE-24: มีสาขา (สำนักงานใหญ่) → ออกได้", got: combinedReceiptBuyerBranchError("combined", { TaxID: "0105556000001", BranchType: "HQ" }), want: null },
    { name: "SALE-24: บุคคลทั่วไปไม่มีเลขภาษี → ออกได้", got: combinedReceiptBuyerBranchError("combined", { TaxID: "", BranchType: "" }), want: null },
    { name: "SALE-24: โหมดแยก/ไม่มี VAT → ไม่ตรวจที่นี่ (ใบกำกับคู่ตรวจเอง)", got: [combinedReceiptBuyerBranchError("separate", { TaxID: "0105556000001" }), combinedReceiptBuyerBranchError("", { TaxID: "0105556000001" })], want: [null, null] },
    { name: "PUR-04c: การ์ดบอกอย่างย่อ", got: ocrDocTypeLabel("tax_invoice", null, ORG), want: "ใบกำกับภาษีอย่างย่อ (ขอคืน VAT ไม่ได้)" },
    { name: "PUR-04c: การ์ดบอกเลขผู้ซื้อไม่ใช่ของบริษัท (ตรงกับที่บันทึกเป็นต้องห้าม)", got: [ocrDocTypeLabel("tax_invoice", "1234567890123", ORG), classifyOcrPurchaseDoc("tax_invoice", "1234567890123", ORG).nonDeductibleVat], want: ["ใบกำกับภาษี — เลขผู้ซื้อไม่ใช่ของบริษัท (ขอคืน VAT ไม่ได้)", "invalid_tax_invoice"] },
    { name: "PUR-04c: ใบกำกับของบริษัท → ใบกำกับภาษี", got: ocrDocTypeLabel("tax_invoice", ORG, ORG), want: "ใบกำกับภาษี" },
    { name: "PUR-04c: แจ้งหลังบันทึกเฉพาะใบที่มี VAT และขอคืนไม่ได้", got: [!!nonClaimableNotice({ documentType: "tax_invoice_abbr", nonDeductibleVat: "" }, true), !!nonClaimableNotice({ documentType: "tax_invoice", nonDeductibleVat: "invalid_tax_invoice" }, true), nonClaimableNotice({ documentType: "tax_invoice", nonDeductibleVat: "" }, true), nonClaimableNotice({ documentType: "tax_invoice_abbr", nonDeductibleVat: "" }, false)], want: [true, true, undefined, undefined] },
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
