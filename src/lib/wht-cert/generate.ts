// ===========================================
// หนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ) — เขียนข้อความทับ PDF ต้นฉบับ (vector)
//
// ไม่วาดฟอร์มใหม่และไม่ใช้ภาพถ่ายฟอร์ม: โหลด public/forms/wht-50tawi.pdf
// (ฟอร์มกรมสรรพากร approve_wh3_081156) แล้วเขียนเฉพาะค่าลงในช่องด้วย pdf-lib
// → เส้น/ตัวพิมพ์ของฟอร์มและข้อมูลที่กรอกเป็น vector ทั้งหมด พิมพ์คมชัดทุกขนาด
// (วิธีเดียวกับ aim-hr: src/lib/wht-cert/generate.ts)
//
// พิกัด: วัดจากภาพ render ของฟอร์มกว้าง 2480px (A4 @300dpi, จุดกำเนิดมุมบนซ้าย)
// แล้วแปลงเป็น point ของ PDF (595×842, จุดกำเนิดมุมล่างซ้าย) ด้วย X()/Y()
// ถ้าเปลี่ยนไฟล์ฟอร์ม ต้องวัดใหม่ทั้งชุด
//
// ฟอนต์ Sarabun (OFL) ฝังลงไป เพราะฟอนต์มาตรฐานของ PDF ไม่มีอักษรไทย
// ===========================================

import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { WhtIncomeSection } from "@/lib/wht-doc-utils";

export interface WhtCertPdfData {
  bookNo: string;
  docNo: string;
  /** ลำดับที่ในแบบ ภ.ง.ด. */
  sequenceNo: string;
  pndForm: "3" | "53";
  payer: { name: string; taxId: string; address: string; signatureUrl?: string | null };
  payee: { name: string; taxId: string; address: string };
  incomeSection: WhtIncomeSection;
  /** ข้อความช่อง "6. อื่น ๆ (ระบุ)" — ใช้เมื่อ incomeSection = "6" */
  incomeNote?: string;
  /** วันที่จ่าย YYYY-MM-DD */
  paidDate: string;
  amount: number;
  tax: number;
}

const FORM_PATH = path.join(process.cwd(), "public", "forms", "wht-50tawi.pdf");
const FONT_PATH = path.join(process.cwd(), "public", "fonts", "Sarabun-Regular.ttf");
const FONT_BOLD_PATH = path.join(process.cwd(), "public", "fonts", "Sarabun-Bold.ttf");

const INK = rgb(0.04, 0.06, 0.2); // น้ำเงินเข้มเกือบดำ — แยกจากตัวพิมพ์ของฟอร์มเล็กน้อย

// px (ภาพ 2480×3509) → pt (PDF 595×842)
const X = (px: number) => (px * 595) / 2480;
const Y = (px: number) => 842 - (px * 842) / 3509;

/** กึ่งกลางช่องเลขประจำตัวผู้เสียภาษี 13 หลัก (กลุ่ม 1-4-5-2-1) */
const PAYER_ID_X = [1585, 1660, 1710, 1760, 1810, 1889, 1939, 1989, 2039, 2089, 2165, 2215, 2294];
const PAYEE_ID_X = [1589, 1664, 1714, 1764, 1814, 1890, 1941, 1992, 2043, 2094, 2166, 2218, 2298];

/** เส้นบรรทัดของแต่ละประเภทเงินได้ (4b ลงที่ (1.4) อัตราอื่น ๆ) */
const ROW_LINE: Record<WhtIncomeSection, number> = {
  "1": 1285,
  "2": 1347,
  "3": 1406,
  "4a": 1468,
  "4b": 1889,
  "5": 2614,
  "6": 2677,
};

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

function splitMoney(n: number): { baht: string; satang: string } {
  const cents = Math.round((n || 0) * 100);
  return {
    baht: Math.floor(cents / 100).toLocaleString("en-US"),
    satang: String(cents % 100).padStart(2, "0"),
  };
}

function thaiDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y + 543}`;
}

/** ย่อข้อความให้พอดีช่อง — ตัดท้ายด้วย … แทนล้นออกนอกกรอบ */
function fit(font: PDFFont, text: string, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && font.widthOfTextAtSize(t + "…", size) > maxWidth) t = t.slice(0, -1);
  return t + "…";
}

// ===== จำนวนเงินเป็นตัวอักษร =====

function numberToThai(n: number): string {
  if (n === 0) return "";
  if (n >= 1_000_000) {
    const millions = Math.floor(n / 1_000_000);
    return numberToThai(millions) + "ล้าน" + numberToThai(n % 1_000_000);
  }
  const digits = ["", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
  const positions = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"];
  const s = String(n);
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const d = parseInt(s[i], 10);
    const pos = s.length - i - 1;
    if (d === 0) continue;
    if (pos === 1 && d === 1) out += positions[pos];
    else if (pos === 1 && d === 2) out += "ยี่" + positions[pos];
    else if (pos === 0 && d === 1 && s.length > 1) out += "เอ็ด";
    else out += digits[d] + positions[pos];
  }
  return out;
}

export function bahtText(n: number): string {
  const cents = Math.round((n || 0) * 100);
  if (cents === 0) return "ศูนย์บาทถ้วน";
  const integer = Math.floor(cents / 100);
  const satang = cents % 100;
  const intText = integer > 0 ? `${numberToThai(integer)}บาท` : "";
  return satang === 0 ? `${intText}ถ้วน` : `${intText}${numberToThai(satang)}สตางค์`;
}

// ===== วาด =====

export async function generateWhtCertPdf(data: WhtCertPdfData): Promise<Uint8Array> {
  const [formBytes, fontBytes, boldBytes] = await Promise.all([
    readFile(FORM_PATH),
    readFile(FONT_PATH),
    readFile(FONT_BOLD_PATH),
  ]);
  const pdf = await PDFDocument.load(formBytes);
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(fontBytes, { subset: true });
  const bold = await pdf.embedFont(boldBytes, { subset: true });
  const page = pdf.getPage(0);

  // (xPx, baselinePx) เป็น px ของภาพฟอร์ม
  const left = (t: string, xPx: number, yPx: number, size = 10, f: PDFFont = font) =>
    page.drawText(t, { x: X(xPx), y: Y(yPx), size, font: f, color: INK });
  const center = (t: string, cxPx: number, yPx: number, size = 10, f: PDFFont = font) =>
    page.drawText(t, { x: X(cxPx) - f.widthOfTextAtSize(t, size) / 2, y: Y(yPx), size, font: f, color: INK });
  const right = (t: string, rxPx: number, yPx: number, size = 10, f: PDFFont = font) =>
    page.drawText(t, { x: X(rxPx) - f.widthOfTextAtSize(t, size), y: Y(yPx), size, font: f, color: INK });
  const pxw = (px: number) => (px * 595) / 2480;

  const drawId = (id: string, centers: number[], baselinePx: number) => {
    (id || "").replace(/\D/g, "").slice(0, 13).split("").forEach((ch, i) => {
      center(ch, centers[i], baselinePx, 11, bold);
    });
  };

  /** เครื่องหมายถูก (เส้น vector) กลางช่องสี่เหลี่ยม — (cx, cy) = กึ่งกลางช่อง */
  const tick = (cxPx: number, cyPx: number) => {
    const p = (dx: number, dy: number) => ({ x: X(cxPx + dx), y: Y(cyPx + dy) });
    page.drawLine({ start: p(-15, 1), end: p(-4, 13), thickness: 1.4, color: INK });
    page.drawLine({ start: p(-4, 13), end: p(17, -15), thickness: 1.4, color: INK });
  };

  const moneyRow = (baselinePx: number, amount: number, tax: number, f: PDFFont) => {
    const a = splitMoney(amount);
    const t = splitMoney(tax);
    right(a.baht, 1972, baselinePx, 10, f);
    center(a.satang, 2011, baselinePx, 10, f);
    right(t.baht, 2268, baselinePx, 10, f);
    center(t.satang, 2306, baselinePx, 10, f);
  };

  // เล่มที่ / เลขที่
  left(data.bookNo, 2180, 249);
  left(data.docNo, 2175, 309, 9.5);

  // ผู้มีหน้าที่หักภาษี ณ ที่จ่าย
  drawId(data.payer.taxId, PAYER_ID_X, 392);
  left(fit(font, data.payer.name, 10, pxw(1080)), 215, 462);
  left(fit(font, data.payer.address, 9, pxw(2030)), 245, 559, 9);

  // ผู้ถูกหักภาษี ณ ที่จ่าย
  drawId(data.payee.taxId, PAYEE_ID_X, 680);
  left(fit(font, data.payee.name, 10, pxw(1085)), 215, 766);
  left(fit(font, data.payee.address, 9, pxw(2025)), 250, 875, 9);

  // ลำดับที่ + แบบ ภ.ง.ด.
  center(data.sequenceNo, 447, 987, 11, bold);
  if (data.pndForm === "3") tick(1993, 975);
  else tick(1672, 1052);

  // ประเภทเงินได้ — ลงเฉพาะบรรทัดที่ตรงกับประเภท
  const rowBase = ROW_LINE[data.incomeSection] - 9;
  center(thaiDate(data.paidDate), 1526, rowBase, 9.5);
  moneyRow(rowBase, data.amount, data.tax, font);
  if (data.incomeSection === "6" && data.incomeNote) {
    left(fit(font, data.incomeNote, 9.5, pxw(720)), 420, 2667, 9.5);
  }

  // รวม + ตัวอักษร
  moneyRow(2742, data.amount, data.tax, bold);
  left(fit(font, bahtText(data.tax), 10, pxw(1520)), 785, 2826);

  // ผู้จ่ายเงิน: (1) หัก ณ ที่จ่าย
  tick(369, 2985);

  // ลายเซ็น (data-URL ที่ตั้งไว้ในตั้งค่าองค์กร) — พลาดก็ข้าม ไม่ให้เอกสารล้ม
  const sig = data.payer.signatureUrl;
  if (sig && sig.startsWith("data:image/")) {
    try {
      const [meta, b64] = sig.split(",", 2);
      const bytes = Buffer.from(b64, "base64");
      const img = /png/i.test(meta) ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
      const maxH = pxw(120);
      const maxW = pxw(430);
      const scale = Math.min(maxH / img.height, maxW / img.width);
      const w = img.width * scale;
      const h = img.height * scale;
      page.drawImage(img, { x: X(1727) - w / 2, y: Y(3152), width: w, height: h });
    } catch {
      /* รูปลายเซ็นอ่านไม่ได้ (เช่น webp) → เว้นว่างให้เซ็นมือ */
    }
  }

  // วัน เดือน ปี ที่ออกหนังสือรับรอง (พ.ศ.)
  const [yy, mm, dd] = data.paidDate.split("-").map(Number);
  if (yy && mm && dd) {
    center(String(dd), 1460, 3186, 9.5);
    center(THAI_MONTHS[mm - 1] || "", 1652, 3186, 9.5);
    center(String(yy + 543), 1880, 3186, 9.5);
  }

  return pdf.save();
}
