// ===========================================
// OpenAI GPT-4o OCR Provider (Optimized — Session 5)
// Pipeline: GPT-4o 2-pass (transcribe → parse) as primary
// Tesseract.js optimized as fallback
// ===========================================

import type { OcrProvider, OcrParsedReceipt, DocumentType } from "./types";
import { extractPdfText } from "./pdf-helper";
import { extractTextFromImage } from "./tesseract-helper";
import { PDFDocument } from "pdf-lib";
import type Sharp from "sharp";

// Dynamic import to avoid webpack bundling native module
async function getSharp(): Promise<typeof Sharp> {
  const mod = await import("sharp");
  return mod.default;
}

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

function getOpenAIKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set");
  return key;
}

function getOpenAIModel(): string {
  return process.env.OPENAI_OCR_MODEL || "gpt-4o";
}

// ===========================================
// GPT-4o 2-Pass: Transcribe → Parse
// ===========================================

/** Pass 1 — Transcribe: GPT-4o reads the image and outputs EXACT text only */
const TRANSCRIBE_SYSTEM_PROMPT = `คุณคือเครื่อง OCR ที่แม่นยำที่สุดในโลก
หน้าที่ของคุณมีเพียงอย่างเดียว: คัดลอกข้อความทุกตัวอักษรที่เห็นในเอกสาร

กฎเคร่งครัด:
- คัดลอกตัวอักษรตามที่เห็น ทุกตัว ทุกบรรทัด
- รักษาตำแหน่ง layout เดิม (ซ้าย-ขวา, บน-ล่าง)
- ตัวเลขต้องถูกต้อง 100% — ห้ามเดา ห้ามปัดเศษ ห้ามแก้ไข
- เลขผู้เสียภาษี 13 หลัก ต้องคัดลอกทุกหลักตรงตามที่เห็น
- ชื่อบริษัท/บุคคล ต้องคัดลอกตรงตัว ห้ามแปล ห้ามตีความ
- ที่อยู่ ต้องคัดลอกครบทุกคำ
- ถ้าอ่านไม่ชัด ให้ใส่ [?] ตรงตำแหน่งนั้น
- ห้ามเพิ่มข้อมูลที่ไม่มีในเอกสาร
- ห้ามตีความหรือสรุป — คัดลอกเท่านั้น

⚠️ สำคัญมาก — ให้ใส่ label กำกับส่วนต่างๆ:
- ส่วนบนสุด (โลโก้/หัวเอกสาร) = ใส่ "[ผู้ขาย/ผู้ออกเอกสาร]" ก่อนข้อมูล
- ส่วนที่มีคำว่า "ลูกค้า" "ผู้ซื้อ" "Customer" "Bill to" = ใส่ "[ลูกค้า/ผู้ซื้อ]" ก่อนข้อมูล
- เลขผู้เสียภาษีแต่ละตัวให้ระบุว่าเป็นของใคร เช่น "[เลขภาษีผู้ขาย] 0505567026809" "[เลขภาษีลูกค้า] 0105546106467"

ตอบกลับเฉพาะข้อความที่คัดลอกได้ ไม่มีคำอธิบายเพิ่มเติม`;

/** Pass 2 — Parse: takes transcribed text and outputs structured JSON */
const PARSE_SYSTEM_PROMPT = `คุณเป็นผู้เชี่ยวชาญการอ่านเอกสารภาษาไทย (ใบแจ้งหนี้ ใบเสร็จ ใบกำกับภาษี ใบเสนอราคา)

อ่านเอกสารแล้ว extract ข้อมูลออกมาเป็น JSON ตาม schema ที่กำหนด
- ถ้าไม่มีข้อมูล ใช้ null
- ตัวเลขเงิน ให้เป็น number ไม่มี comma
- เลขผู้เสียภาษี ต้องเป็น 13 หลัก
- วันที่ ให้เป็น ISO format YYYY-MM-DD
- hasVat = true ถ้ามี "ใบกำกับภาษี" "VAT" "ภาษีมูลค่าเพิ่ม" หรือมีรายการ VAT แยก
- confidence: 0-1 ประเมินความมั่นใจตาม clarity ของเอกสาร
- documentType: ตัวเลือก invoice/receipt/tax_invoice/quotation

⚠️ สำคัญ: ข้อมูลที่ให้มาถูก extract จากเอกสารด้วย OCR แล้ว
- ตัวอักษรไทยอาจมีช่องว่างระหว่างตัวอักษร เช่น "บ ร ิ ษั ท" = "บริษัท"
- ให้รวมตัวอักษรที่เว้นวรรคกลับเป็นคำ/ประโยคที่ถูกต้อง
- ข้อมูลต้องตรงตาม text ที่ให้ — ห้ามเดาหรือแต่งเอง

ตอบกลับเฉพาะ JSON object — ไม่ต้องมี markdown code fence หรือคำอธิบาย`;

function getParseUserPrompt(documentType?: DocumentType): string {
  const typeHint =
    documentType === "receipt"
      ? `เอกสารนี้คือ **ใบเสร็จรับเงิน / ใบกำกับภาษี** (หลังจ่ายเงินแล้ว)

⚠️⚠️⚠️ สำคัญที่สุด — แยกผู้ขาย vs ผู้ซื้อให้ถูกต้อง! ⚠️⚠️⚠️

**ผู้ขาย (vendor)** = ผู้ออกเอกสาร/ร้านค้า/ผู้รับเงิน
  ✅ อยู่ **ด้านบนสุด** ของเอกสาร — มักมีโลโก้, ชื่อบริษัทตัวใหญ่
  ✅ มีที่อยู่ + เลขภาษี + เบอร์โทร ของตัวเอง
  ✅ เลขภาษีของผู้ขาย = เลขภาษีตัว **แรก** ที่เจอใน header
  ✅ ถ้ามี label "[ผู้ขาย/ผู้ออกเอกสาร]" ใน text → ข้อมูลถัดไปคือผู้ขาย

**ผู้ซื้อ (buyer)** = ลูกค้าที่ซื้อของ/จ่ายเงิน — คนละคนกับผู้ขาย!
  ✅ อยู่ส่วน "ลูกค้า" "ผู้ซื้อ" "Customer" "Bill to" "Sold to"
  ✅ เลขภาษีของผู้ซื้อ = เลขภาษีตัว **ที่สอง** (ไม่ใช่ตัวเดียวกับผู้ขาย!)
  ✅ ถ้ามี label "[ลูกค้า/ผู้ซื้อ]" ใน text → ข้อมูลถัดไปคือผู้ซื้อ
  ⚠️ ห้ามเอาชื่อผู้ขายมาใส่เป็นชื่อผู้ซื้อ!
  ⚠️ ระวัง prefix รหัสลูกค้า (เช่น "C00074 บริษัท..." → ชื่อผู้ซื้อ = "บริษัท..." ตัดรหัสออก)

**ตรวจสอบซ้ำ:**
  - vendorName ≠ buyerName (ต้องไม่เหมือนกัน!)
  - vendorTaxId ≠ buyerTaxId (ต้องไม่เหมือนกัน!)
  - ถ้าเจอเลขภาษี 2 ตัว → ตัวแรก = vendor, ตัวที่สอง = buyer

**เอกสาร:**
- เลขที่เอกสาร → "เลขที่" "Receipt No." "Tax Invoice No." "RT-..." "IV-..." "INV..."
- วันที่ → "วันที่ออก" "วันที่" "Date" — แปลง พ.ศ. → ค.ศ. เสมอ (พ.ศ. 2568 = ค.ศ. 2025)
- รายการสินค้า/บริการ → ตารางในเอกสาร อ่านทุกบรรทัด ใส่ใน items[]
- ยอดก่อน VAT, VAT 7%, หัก ณ ที่จ่าย, ยอดรวมสุดท้าย → ส่วนล่างของเอกสาร
- "สำนักงานใหญ่" / "สาขา XXXX" → อ่านของทั้งผู้ขายและผู้ซื้อ`
      : documentType === "invoice"
      ? `เอกสารนี้คือ **ใบแจ้งหนี้ / ใบวางบิล / ใบเสนอราคา / ใบเสร็จรับเงิน / ใบกำกับภาษี**

⚠️⚠️⚠️ สำคัญที่สุด — แยกผู้ขาย vs ผู้ซื้อให้ถูกต้อง! ⚠️⚠️⚠️

**ผู้ขาย (vendor)** = ผู้ออกเอกสาร/ร้านค้า/ผู้รับเงิน
  ✅ อยู่ **ด้านบนสุด** ของเอกสาร — มักมีโลโก้, ชื่อบริษัทตัวใหญ่
  ✅ เลขภาษีของผู้ขาย = เลขภาษีตัว **แรก** ที่เจอใน header
  ✅ ถ้ามี label "[ผู้ขาย/ผู้ออกเอกสาร]" ใน text → ข้อมูลถัดไปคือผู้ขาย

**ผู้ซื้อ (buyer)** = ลูกค้าที่ซื้อของ/จ่ายเงิน — คนละคนกับผู้ขาย!
  ✅ อยู่ส่วน "ลูกค้า" "ผู้ซื้อ" "Customer" "Bill to" "Sold to"
  ✅ เลขภาษีของผู้ซื้อ = เลขภาษีตัว **ที่สอง** (ไม่ใช่ตัวเดียวกับผู้ขาย!)
  ✅ ถ้ามี label "[ลูกค้า/ผู้ซื้อ]" ใน text → ข้อมูลถัดไปคือผู้ซื้อ
  ⚠️ ห้ามเอาชื่อผู้ขายมาใส่เป็นชื่อผู้ซื้อ!

**ตรวจสอบซ้ำ:**
  - vendorName ≠ buyerName (ต้องไม่เหมือนกัน!)
  - vendorTaxId ≠ buyerTaxId (ต้องไม่เหมือนกัน!)
  - ถ้าเจอเลขภาษี 2 ตัว → ตัวแรก = vendor, ตัวที่สอง = buyer

**เอกสาร:**
- เลขที่เอกสาร → "เลขที่" "Invoice No." "Receipt No." "Tax Invoice No."
- วันที่ → "วันที่ออก" "Date" — แปลง พ.ศ. → ค.ศ. เสมอ (พ.ศ. 2568 = ค.ศ. 2025)
- วันครบกำหนด → "Due Date" "วันครบกำหนด"
- รายการสินค้า/บริการ → ตารางในเอกสาร อ่านทุกบรรทัด ใส่ใน items[]
- ยอดก่อน VAT, VAT 7%, หัก ณ ที่จ่าย, ยอดรวมสุดท้าย
- "สำนักงานใหญ่" / "สาขา XXXX" → อ่านของทั้งผู้ขายและผู้ซื้อ`
      : documentType === "id_card"
      ? `เอกสารนี้คือ **สำเนาบัตรประชาชน** (Thai National ID Card)

⚠️ อ่านข้อมูลจากบัตรประชาชน:
- เลขบัตรประชาชน 13 หลัก → ใส่ใน vendorTaxId
- ชื่อ-นามสกุล (ชื่อภาษาไทย) → ใส่ใน vendorName (ใส่คำนำหน้า นาย/นาง/นางสาว ด้วย)
- ที่อยู่ → ใส่ใน vendorAddress
- วันเกิด → ใส่ใน documentDate (แปลง พ.ศ. → ค.ศ.)
- วันหมดอายุ → ใส่ใน dueDate (แปลง พ.ศ. → ค.ศ.)
- documentType → "id_card"
- invoiceNumber → เลขบัตรประชาชน
- totalAmount → null (ไม่มียอดเงิน)
- hasVat → false
- items → []`
      : "";

  return `${typeHint}

Extract ข้อมูลจากเอกสารนี้ตาม schema (ห้ามเว้น field ที่อ่านได้):
{
  "vendorName": "ชื่อผู้ออกเอกสาร / ผู้ขาย / ผู้รับเงิน",
  "vendorAddress": "ที่อยู่ผู้ขาย (ไม่รวมสำนักงานใหญ่/สาขา)",
  "vendorTaxId": "เลขผู้เสียภาษีผู้ขาย 13 หลัก (เอาแค่ตัวเลข)",
  "vendorBranch": "สำนักงานใหญ่ หรือ สาขา XXXX (ของผู้ขาย)",
  "vendorPhone": "เบอร์โทรผู้ขาย",
  "buyerName": "ชื่อผู้ซื้อ / ลูกค้า",
  "buyerAddress": "ที่อยู่ผู้ซื้อ (ไม่รวมสำนักงานใหญ่/สาขา)",
  "buyerTaxId": "เลขผู้เสียภาษีผู้ซื้อ 13 หลัก (เอาแค่ตัวเลข)",
  "buyerBranch": "สำนักงานใหญ่ หรือ สาขา XXXX (ของผู้ซื้อ)",
  "invoiceNumber": "เลขที่เอกสาร (Invoice/Receipt/Tax Invoice No.)",
  "documentType": "invoice | receipt | tax_invoice | quotation",
  "documentDate": "วันที่เอกสาร YYYY-MM-DD (แปลง พ.ศ. → ค.ศ. ถ้าจำเป็น)",
  "dueDate": "วันครบกำหนด YYYY-MM-DD (ถ้ามี)",
  "subtotal": "ยอดก่อน VAT (number)",
  "vatAmount": "VAT 7% (number, null ถ้าไม่มี)",
  "withholdingTax": "หัก ณ ที่จ่าย (number, null ถ้าไม่ระบุ)",
  "totalAmount": "ยอดรวมสุดท้าย (number)",
  "hasVat": true/false,
  "items": [{"description": "...", "quantity": N, "unitPrice": N, "amount": N}],
  "confidence": 0.0-1.0,
  "rawText": "text ทั้งหมดที่อ่านจากเอกสาร (ครบทั้งหน้า — ใช้ debug)"
}

ห้ามตอบ field เป็น null ถ้าในเอกสารมีข้อมูลให้อ่านได้
ตอบกลับ JSON เท่านั้น`;
}


// ===========================================
// Image preprocessing for GPT Vision
// ===========================================

/** Resize image for GPT Vision — sharpen + normalize for better Thai OCR accuracy */
async function prepareImageForGpt(imageBuffer: Buffer, mimeType: string): Promise<{ base64: string; mime: string }> {
  try {
    const sharpLib = await getSharp();
    const metadata = await sharpLib(imageBuffer).metadata();
    const w = metadata.width || 0;
    const h = metadata.height || 0;

    // GPT-4o Vision "high" detail mode samples up to ~1568px on the long edge.
    // We push to 1600 to keep headroom; sharp will not enlarge if the source is smaller.
    // Sharpen + normalize compensate for soft scans where Thai sara/tone marks
    // (e.g. ร↔ซ, ด↔อ) collide on small fonts in receipts.
    const MAX_DIM = 1600;
    const longEdge = Math.max(w, h);

    let pipeline = sharpLib(imageBuffer)
      .rotate()           // honour EXIF rotation (LINE photos often need this)
      .normalize()        // auto contrast — pulls black/white levels for crisper edges
      .sharpen({ sigma: 0.8 });

    if (longEdge > MAX_DIM) {
      console.log(`[OCR] Resizing image for GPT: ${w}x${h} → long edge ${MAX_DIM}px`);
      pipeline = pipeline.resize(MAX_DIM, MAX_DIM, { fit: "inside", withoutEnlargement: true });
    }

    const optimized = await pipeline
      .jpeg({ quality: 92 }) // 85 → 92: small extra bytes, big win on Thai legibility
      .toBuffer();

    return { base64: optimized.toString("base64"), mime: "image/jpeg" };
  } catch (err) {
    console.warn("[OCR] prepareImageForGpt fallback (no preprocessing):", err);
    const base64 = imageBuffer.toString("base64");
    return { base64, mime: mimeType };
  }
}


// ===========================================
// Main Provider Class
// ===========================================

export class OpenAIOcrProvider implements OcrProvider {
  name = "openai" as const;

  async parseReceipt(
    fileBuffer: Buffer,
    mimeType: string,
    documentType?: DocumentType
  ): Promise<OcrParsedReceipt> {
    if (mimeType === "application/pdf") {
      return this.parsePdf(fileBuffer, documentType);
    }
    if (
      mimeType === "image/jpeg" ||
      mimeType === "image/png" ||
      mimeType === "image/webp"
    ) {
      return this.parseImage(fileBuffer, mimeType, documentType);
    }
    throw new Error(`Unsupported MIME type: ${mimeType}`);
  }

  // --------------- PDF Handling ---------------

  private async extractFirstPagePdf(buffer: Buffer): Promise<Buffer> {
    try {
      const srcDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
      if (srcDoc.getPageCount() <= 1) return buffer;

      console.log(`[OCR] Multi-page PDF (${srcDoc.getPageCount()} pages) → extracting page 1 only`);
      const newDoc = await PDFDocument.create();
      const [page] = await newDoc.copyPages(srcDoc, [0]);
      newDoc.addPage(page);
      const bytes = await newDoc.save();
      return Buffer.from(bytes);
    } catch (err) {
      console.warn("[OCR] pdf-lib page extraction failed, using original buffer:", err);
      return buffer;
    }
  }

  private async parsePdf(
    buffer: Buffer,
    documentType?: DocumentType
  ): Promise<OcrParsedReceipt> {
    const pdfResult = await extractPdfText(buffer);

    const safeBuffer = (documentType === "receipt" || documentType === "tax_invoice")
      ? await this.extractFirstPagePdf(buffer)
      : buffer;

    if (pdfResult.hasTextLayer) {
      // Has text layer — send text to GPT parse (fast, no Vision needed)
      console.log("[OCR] PDF has text layer — using extracted text for GPT parsing");
      return this.callParseOnly(pdfResult.text, documentType);
    }

    // Scanned PDF — GPT 2-pass primary (fast), Tesseract fallback
    console.log("[OCR] Scanned PDF — extracting embedded image");

    const imageBuffer = await this.extractFirstImageFromPdf(safeBuffer);
    if (!imageBuffer) {
      console.warn("[OCR] No embedded image found — sending PDF to GPT directly");
      const base64 = safeBuffer.toString("base64");
      return this.callChatCompletionWithPdf(base64, documentType);
    }

    // === PRIMARY: GPT Vision single-pass (fastest) ===
    try {
      console.log("[OCR] Using GPT Vision single-pass on embedded image...");
      const { base64: imgB64, mime: imgMime } = await prepareImageForGpt(imageBuffer, "image/jpeg");
      const dataUrl = `data:${imgMime};base64,${imgB64}`;
      const result = await this.callVisionDirect(dataUrl, documentType);
      if (this.validateResult(result)) {
        console.log("[OCR] ✓ GPT Vision single-pass result validated");
        return result;
      }
      console.warn("[OCR] GPT Vision validation failed — trying 2-pass");
    } catch (err) {
      console.warn("[OCR] GPT Vision single-pass failed:", err);
    }

    // === FALLBACK 1: GPT-4o 2-pass ===
    try {
      console.log("[OCR] Falling back to GPT 2-pass transcribe...");
      const result = await this.gpt2PassTranscribeAndParse(imageBuffer, "image/jpeg", documentType);
      if (this.validateResult(result)) {
        console.log("[OCR] ✓ GPT 2-pass result validated");
        return result;
      }
    } catch (err) {
      console.warn("[OCR] GPT 2-pass failed:", err);
    }

    // === FALLBACK 2: Send PDF directly to GPT ===
    console.warn("[OCR] Falling back to GPT PDF direct");
    const base64 = safeBuffer.toString("base64");
    return this.callChatCompletionWithPdf(base64, documentType);
  }

  // --------------- Image Handling ---------------

  private async parseImage(
    buffer: Buffer,
    mimeType: string,
    documentType?: DocumentType
  ): Promise<OcrParsedReceipt> {
    // === PRIMARY: GPT Vision direct single-pass (fastest: ~5-10s) ===
    try {
      console.log("[OCR] Image — using GPT Vision single-pass...");
      const { base64, mime } = await prepareImageForGpt(buffer, mimeType);
      const dataUrl = `data:${mime};base64,${base64}`;
      const result = await this.callVisionDirect(dataUrl, documentType);
      if (this.validateResult(result)) {
        console.log("[OCR] ✓ GPT Vision single-pass result validated");
        return result;
      }
      console.warn("[OCR] GPT Vision validation failed — trying 2-pass");
    } catch (err) {
      console.warn("[OCR] GPT Vision single-pass failed:", err);
    }

    // === FALLBACK 1: GPT-4o 2-pass (more accurate for Thai names) ===
    try {
      console.log("[OCR] Falling back to GPT 2-pass transcribe...");
      const result = await this.gpt2PassTranscribeAndParse(buffer, mimeType, documentType);
      if (this.validateResult(result)) {
        console.log("[OCR] ✓ GPT 2-pass result validated");
        return result;
      }
    } catch (err) {
      console.warn("[OCR] GPT 2-pass failed:", err);
    }

    // === FALLBACK 2: Tesseract.js (slowest but reliable Thai OCR) ===
    try {
      console.log("[OCR] Falling back to Tesseract OCR...");
      const tesseractText = await extractTextFromImage(buffer, mimeType);
      if (tesseractText && tesseractText.trim().length > 30) {
        console.log(`[OCR] ✓ Tesseract: ${tesseractText.length} chars — sending to GPT for parsing`);
        return this.callParseOnly(tesseractText, documentType);
      }
      console.warn("[OCR] Tesseract returned too little text");
    } catch (err) {
      console.warn("[OCR] Tesseract failed:", err);
    }

    throw new Error("All OCR methods failed for this image");
  }

  // --------------- GPT-4o 2-Pass ---------------

  /**
   * GPT-4o 2-Pass OCR Pipeline:
   * Pass 1: Send image → GPT transcribes exact text (no interpretation)
   * Pass 2: Send transcribed text → GPT parses into structured JSON (no image)
   *
   * This prevents hallucination because Pass 2 never sees the image.
   * Total time: ~5-8 seconds (vs Tesseract.js >120 seconds)
   */
  private async gpt2PassTranscribeAndParse(
    imageBuffer: Buffer,
    mimeType: string,
    documentType?: DocumentType
  ): Promise<OcrParsedReceipt> {
    const startTime = Date.now();

    // --- Pass 1: Transcribe ---
    console.log("[OCR] Pass 1: GPT-4o transcribing image...");
    const { base64, mime } = await prepareImageForGpt(imageBuffer, mimeType);
    const transcribedText = await this.gptTranscribe(base64, mime);

    if (!transcribedText || transcribedText.trim().length < 20) {
      throw new Error("GPT transcribe returned too little text");
    }

    const pass1Time = Date.now() - startTime;
    console.log(`[OCR] Pass 1 done in ${pass1Time}ms — ${transcribedText.length} chars`);

    // --- Pass 2: Parse ---
    console.log("[OCR] Pass 2: GPT parsing transcribed text...");
    const result = await this.callParseOnly(transcribedText, documentType);

    const totalTime = Date.now() - startTime;
    console.log(`[OCR] 2-pass complete in ${totalTime}ms`);

    return result;
  }

  /** Pass 1: Send image to GPT-4o, get back exact transcribed text */
  private async gptTranscribe(imageBase64: string, mimeType: string): Promise<string> {
    const apiKey = getOpenAIKey();
    const model = getOpenAIModel();

    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: TRANSCRIBE_SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "คัดลอกข้อความทั้งหมดจากเอกสารนี้ ตัวต่อตัว รักษา layout เดิม",
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${imageBase64}`,
                  detail: "high",
                },
              },
            ],
          },
        ],
        temperature: 0.0, // Zero temperature for exact transcription
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`GPT transcribe failed: ${response.status} ${errText}`);
    }

    const result = await response.json();
    return result.choices?.[0]?.message?.content || "";
  }

  // --------------- Parse-Only (text → JSON) ---------------

  /** Pass 2: Parse already-extracted text into structured JSON (no image) */
  private async callParseOnly(
    extractedText: string,
    documentType?: DocumentType
  ): Promise<OcrParsedReceipt> {
    const apiKey = getOpenAIKey();
    const model = getOpenAIModel();

    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: PARSE_SYSTEM_PROMPT },
          {
            role: "user",
            content: `${getParseUserPrompt(documentType)}\n\n--- TEXT FROM DOCUMENT (OCR) ---\n${extractedText.slice(0, 8000)}\n--- END ---`,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`GPT parse failed: ${response.status} ${errText}`);
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;
    if (!content) throw new Error("GPT parse returned empty response");

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error("GPT parse returned invalid JSON");
    }

    return this.normalize(parsed);
  }

  // --------------- Vision Direct (legacy fallback) ---------------

  private async callVisionDirect(
    imageDataUrl: string,
    documentType?: DocumentType
  ): Promise<OcrParsedReceipt> {
    const apiKey = getOpenAIKey();
    const model = getOpenAIModel();

    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: PARSE_SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: getParseUserPrompt(documentType) },
              { type: "image_url", image_url: { url: imageDataUrl, detail: "high" } },
            ],
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`GPT Vision failed: ${response.status} ${errText}`);
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;
    if (!content) throw new Error("GPT Vision returned empty response");

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error("GPT Vision returned invalid JSON");
    }

    return this.normalize(parsed);
  }

  /** Send PDF directly to GPT (for when no image extraction possible) */
  private async callChatCompletionWithPdf(
    pdfBase64: string,
    documentType: DocumentType | undefined
  ): Promise<OcrParsedReceipt> {
    const apiKey = getOpenAIKey();
    const model = getOpenAIModel();

    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: PARSE_SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: getParseUserPrompt(documentType) },
              {
                type: "file",
                file: {
                  filename: "document.pdf",
                  file_data: `data:application/pdf;base64,${pdfBase64}`,
                },
              },
            ],
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`GPT PDF failed: ${response.status} ${errText}`);
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;
    if (!content) throw new Error("GPT PDF returned empty response");

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error("GPT PDF returned invalid JSON");
    }

    return this.normalize(parsed);
  }

  // --------------- PDF Image Extraction ---------------

  private async extractFirstImageFromPdf(pdfBuffer: Buffer): Promise<Buffer | null> {
    try {
      await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
      return this.findEmbeddedJpeg(pdfBuffer);
    } catch (err) {
      console.warn("[OCR] Failed to extract image from PDF:", err);
      return null;
    }
  }

  private findEmbeddedJpeg(pdfBuffer: Buffer): Buffer | null {
    const jpegStart = Buffer.from([0xFF, 0xD8, 0xFF]);
    let startIdx = -1;
    let largestImage: Buffer | null = null;
    let largestSize = 0;

    for (let i = 0; i < pdfBuffer.length - 3; i++) {
      if (pdfBuffer[i] === 0xFF && pdfBuffer[i + 1] === 0xD8 && pdfBuffer[i + 2] === 0xFF) {
        startIdx = i;
      }
      if (startIdx >= 0 && pdfBuffer[i] === 0xFF && pdfBuffer[i + 1] === 0xD9) {
        const endIdx = i + 2;
        const size = endIdx - startIdx;
        if (size > largestSize && size > 10000) {
          largestImage = pdfBuffer.subarray(startIdx, endIdx);
          largestSize = size;
        }
        startIdx = -1;
      }
    }

    if (largestImage) {
      console.log(`[OCR] Found embedded JPEG: ${largestSize} bytes`);
    }
    return largestImage;
  }

  // --------------- Validation ---------------

  /** Basic validation of OCR result to detect obvious hallucinations */
  private validateResult(result: OcrParsedReceipt): boolean {
    // Tax IDs should be exactly 13 digits if present
    if (result.vendorTaxId && result.vendorTaxId.replace(/\D/g, "").length !== 13) {
      console.warn(`[OCR] Validation: vendorTaxId "${result.vendorTaxId}" is not 13 digits`);
      return false;
    }
    if (result.buyerTaxId && result.buyerTaxId.replace(/\D/g, "").length !== 13) {
      console.warn(`[OCR] Validation: buyerTaxId "${result.buyerTaxId}" is not 13 digits`);
      return false;
    }

    // Must have at least some data
    if (!result.vendorName && !result.totalAmount && !result.invoiceNumber) {
      console.warn("[OCR] Validation: result is too empty");
      return false;
    }

    // Confidence check
    if (result.confidence < 0.3) {
      console.warn(`[OCR] Validation: confidence too low (${result.confidence})`);
      return false;
    }

    return true;
  }

  // --------------- Normalize ---------------

  private normalize(raw: Record<string, unknown>): OcrParsedReceipt {
    const asString = (v: unknown): string | null => {
      if (v === null || v === undefined || v === "") return null;
      // Normalize Thai: merge ํ+า→ำ (Tesseract splits sara-am), strip zero-width chars
      const s = String(v).normalize("NFC").replace(/\u0E4D\u0E32/g, "\u0E33").replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
      return s || null;
    };
    const asNumber = (v: unknown): number | null => {
      if (v === null || v === undefined || v === "") return null;
      const n = typeof v === "number" ? v : parseFloat(String(v).replace(/,/g, ""));
      return isFinite(n) ? n : null;
    };
    const asBool = (v: unknown): boolean => {
      if (typeof v === "boolean") return v;
      if (typeof v === "string") return v.toLowerCase() === "true";
      return false;
    };

    const taxIdRaw = asString(raw.vendorTaxId);
    const taxId = taxIdRaw ? taxIdRaw.replace(/\D/g, "") : null;
    const validTaxId = taxId && taxId.length === 13 ? taxId : null;

    const buyerTaxIdRaw = asString(raw.buyerTaxId);
    const buyerTaxId = buyerTaxIdRaw ? buyerTaxIdRaw.replace(/\D/g, "") : null;
    const validBuyerTaxId = buyerTaxId && buyerTaxId.length === 13 ? buyerTaxId : null;

    const docTypeRaw = asString(raw.documentType)?.toLowerCase();
    const documentType: DocumentType | null =
      docTypeRaw === "invoice" ||
      docTypeRaw === "receipt" ||
      docTypeRaw === "tax_invoice" ||
      docTypeRaw === "quotation" ||
      docTypeRaw === "id_card"
        ? docTypeRaw
        : null;

    const items: OcrParsedReceipt["items"] = Array.isArray(raw.items)
      ? (raw.items as Record<string, unknown>[]).map((it) => ({
          description: asString(it.description) || "",
          quantity: asNumber(it.quantity) ?? undefined,
          unitPrice: asNumber(it.unitPrice) ?? undefined,
          amount: asNumber(it.amount) ?? 0,
        }))
      : [];

    return {
      vendorName: asString(raw.vendorName),
      vendorAddress: asString(raw.vendorAddress),
      vendorTaxId: validTaxId,
      vendorBranch: asString(raw.vendorBranch),
      vendorPhone: asString(raw.vendorPhone),
      buyerName: asString(raw.buyerName),
      buyerAddress: asString(raw.buyerAddress),
      buyerTaxId: validBuyerTaxId,
      buyerBranch: asString(raw.buyerBranch),
      invoiceNumber: asString(raw.invoiceNumber),
      documentType,
      documentDate: asString(raw.documentDate),
      dueDate: asString(raw.dueDate),
      subtotal: asNumber(raw.subtotal),
      vatAmount: asNumber(raw.vatAmount),
      withholdingTax: asNumber(raw.withholdingTax),
      totalAmount: asNumber(raw.totalAmount),
      hasVat: asBool(raw.hasVat) || (asNumber(raw.vatAmount) || 0) > 0,
      items,
      confidence: asNumber(raw.confidence) ?? 0.8,
      rawText: asString(raw.rawText) || "",
      provider: "openai",
    };
  }
}
