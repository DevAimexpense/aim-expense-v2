// ===========================================
// LINE Flex Message — OCR Receipt Confirmation Card
// Session 6 — Ultra-safe Flex for reliable rendering
// ===========================================

import type { LineFlexMessage } from "@/lib/line/messaging";
import type { OcrParsedReceipt } from "@/lib/ocr";

function fmt(n: number | null | undefined): string {
  if (n == null) return "-";
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function docTypeLabel(dt: string | null): string {
  switch (dt) {
    case "tax_invoice": return "ใบกำกับภาษี";
    case "receipt": return "ใบเสร็จรับเงิน";
    case "invoice": return "ใบแจ้งหนี้";
    case "quotation": return "ใบเสนอราคา";
    default: return "เอกสาร";
  }
}

// Simple horizontal row: label | value
function row(label: string, value: string): Record<string, unknown> {
  return {
    type: "box",
    layout: "horizontal",
    contents: [
      { type: "text", text: label, size: "xs", color: "#888888", flex: 4 },
      { type: "text", text: value || "-", size: "xs", color: "#333333", flex: 6, align: "end", wrap: true },
    ],
  };
}

// Section header text
function sectionTitle(title: string): Record<string, unknown> {
  return { type: "text", text: title, size: "xs", color: "#4F46E5", weight: "bold", margin: "lg" };
}

// ===========================================
// 1. OCR Confirm Flex
// ===========================================
export function buildOcrConfirmFlex(
  draft: { id: string },
  ocr: OcrParsedReceipt,
  meta: { orgName: string; projectName: string; appBaseUrl: string }
): LineFlexMessage {
  const total = ocr.totalAmount ?? ocr.subtotal ?? 0;
  const vendor = ocr.vendorName || "ไม่ระบุ";
  const confPct = Math.round((ocr.confidence ?? 0) * 100);

  // Build body contents array
  const contents: Record<string, unknown>[] = [];

  // -- Amount --
  contents.push(
    { type: "text", text: `${fmt(total)} บาท`, size: "xl", weight: "bold", color: "#4F46E5" },
    { type: "text", text: ocr.hasVat ? "รวม VAT 7%" : "ไม่รวม VAT", size: "xxs", color: "#888888", margin: "sm" },
    { type: "separator", margin: "lg" },
  );

  // -- Document info --
  contents.push(
    row("ประเภท", docTypeLabel(ocr.documentType)),
    row("เลขที่", ocr.invoiceNumber || "-"),
    row("วันที่", ocr.documentDate || "-"),
  );

  // -- Financial --
  if (ocr.subtotal || ocr.vatAmount || ocr.withholdingTax) {
    contents.push({ type: "separator", margin: "lg" });
    if (ocr.subtotal) contents.push(row("ก่อน VAT", `${fmt(ocr.subtotal)}`));
    if (ocr.vatAmount) contents.push(row("VAT", `${fmt(ocr.vatAmount)}`));
    if (ocr.withholdingTax) contents.push(row("WHT", `${fmt(ocr.withholdingTax)}`));
  }

  // -- Project --
  contents.push(
    { type: "separator", margin: "lg" },
    row("โปรเจกต์", meta.projectName || "ไม่ระบุ"),
  );

  // -- Vendor --
  contents.push(
    { type: "separator", margin: "lg" },
    sectionTitle("ผู้ขาย"),
    { type: "text", text: vendor, size: "sm", weight: "bold", color: "#111111", wrap: true, margin: "sm" },
  );
  if (ocr.vendorTaxId) contents.push(row("Tax ID", ocr.vendorTaxId));
  if (ocr.vendorBranch) contents.push(row("สาขา", ocr.vendorBranch));
  if (ocr.vendorAddress) {
    contents.push({ type: "text", text: ocr.vendorAddress, size: "xxs", color: "#666666", wrap: true, margin: "sm" });
  }

  // -- Buyer --
  if (ocr.buyerName) {
    contents.push(
      { type: "separator", margin: "lg" },
      sectionTitle("ผู้ซื้อ"),
      { type: "text", text: ocr.buyerName, size: "sm", weight: "bold", color: "#111111", wrap: true, margin: "sm" },
    );
    if (ocr.buyerTaxId) contents.push(row("Tax ID", ocr.buyerTaxId));
    if (ocr.buyerBranch) contents.push(row("สาขา", ocr.buyerBranch));
  }

  // -- Confidence --
  contents.push(
    { type: "separator", margin: "lg" },
    { type: "text", text: `ความแม่นยำ AI: ${confPct}%`, size: "xxs", color: "#888888", align: "end", margin: "sm" },
  );

  return {
    type: "flex",
    altText: `${docTypeLabel(ocr.documentType)} ${fmt(total)} - ${vendor}`,
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          // Title bar
          { type: "text", text: docTypeLabel(ocr.documentType), weight: "bold", size: "md", color: "#4F46E5" },
          { type: "text", text: meta.orgName, size: "xxs", color: "#888888" },
          { type: "separator", margin: "lg" },
          // Main content
          ...contents,
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          {
            type: "button",
            style: "primary",
            color: "#059669",
            action: {
              type: "postback",
              label: "บันทึกเป็นรายจ่าย",
              data: `action=confirm&id=${draft.id}`,
              displayText: "บันทึกเป็นรายจ่าย",
            },
          },
          {
            type: "button",
            style: "primary",
            color: "#4F46E5",
            action: {
              type: "uri",
              label: "แก้ไขในเว็บ",
              uri: `${meta.appBaseUrl}/expenses`,
            },
          },
          {
            type: "button",
            style: "link",
            action: {
              type: "postback",
              label: "ยกเลิก",
              data: `action=cancel&id=${draft.id}`,
              displayText: "ยกเลิก",
            },
          },
        ],
      },
    },
  };
}

// ===========================================
// 2. Saved Success Flex
// ===========================================
export function buildSavedFlex(args: {
  paymentId: string;
  vendor: string;
  amount: number;
  projectName: string;
  webUrl: string;
}): LineFlexMessage {
  return {
    type: "flex",
    altText: `บันทึกแล้ว ${fmt(args.amount)} - ${args.vendor}`,
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          { type: "text", text: "บันทึกค่าใช้จ่ายสำเร็จ", weight: "bold", size: "md", color: "#059669" },
          { type: "separator", margin: "lg" },
          { type: "text", text: `${fmt(args.amount)} บาท`, weight: "bold", size: "xl", color: "#4F46E5", margin: "md" },
          { type: "separator", margin: "lg" },
          row("ผู้ขาย", args.vendor),
          row("โปรเจกต์", args.projectName),
          row("รหัส", args.paymentId),
          row("สถานะ", "รออนุมัติ"),
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "button",
            style: "primary",
            color: "#4F46E5",
            action: {
              type: "uri",
              label: "เปิดดูในระบบ",
              uri: args.webUrl,
            },
          },
        ],
      },
    },
  };
}
