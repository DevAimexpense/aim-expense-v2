// ===========================================
// AksonOCR Provider — HYBRID approach
// Step 1: Akson OCR text extraction (fast ~2-3s)
// Step 2: GPT-4o parse text → structured JSON (accurate ~5-8s)
// Total: ~7-11s — fast AND accurate
// ===========================================

import type { OcrProvider, OcrParsedReceipt, DocumentType } from "./types";

const AKSON_UPLOAD_URL = "https://backend.aksonocr.com/api/v2/upload";
const AKSON_MODEL = "AksonOCR-1.0";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

function getAksonKey(): string {
  const key = process.env.AKSONOCR_API_KEY;
  if (!key) throw new Error("AKSONOCR_API_KEY is not set");
  return key;
}

function getOpenAIKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set");
  return key;
}

function getOpenAIModel(): string {
  return process.env.OPENAI_OCR_MODEL || "gpt-4o";
}

// --------------- Akson OCR Response ---------------

interface AksonOcrResponse {
  model?: string;
  pages?: Array<{
    index: number;
    markdown: string;
    confidence?: number;
  }>;
  confidence?: number;
  usage?: { pages_processed: number };
  error?: string;
  code?: string;
}

// --------------- GPT Parse Prompt ---------------

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

function getIdCardParsePrompt(): string {
  return `เอกสารนี้คือ **สำเนาบัตรประชาชน** ของบุคคลที่เป็นผู้รับเงิน (ผู้ขาย/ผู้ให้บริการ)

Extract ข้อมูลจากบัตรประชาชนนี้ตาม schema:
{
  "vendorName": "ชื่อ-นามสกุล เต็มจากบัตร (ภาษาไทย ถ้ามี)",
  "vendorAddress": "ที่อยู่จากบัตร (รวมเลขที่ ถนน ตำบล อำเภอ จังหวัด)",
  "vendorTaxId": "เลขประจำตัวประชาชน 13 หลัก (เอาแค่ตัวเลข)",
  "vendorBranch": null,
  "vendorPhone": null,
  "buyerName": null,
  "buyerAddress": null,
  "buyerTaxId": null,
  "buyerBranch": null,
  "invoiceNumber": null,
  "documentType": "id_card",
  "documentDate": null,
  "dueDate": null,
  "subtotal": null,
  "vatAmount": null,
  "withholdingTax": null,
  "totalAmount": null,
  "hasVat": false,
  "items": [],
  "confidence": 0.0-1.0
}

⚠️ สำคัญ:
- เลขประจำตัวประชาชนอยู่บนบัตร 13 หลัก → ใส่ใน vendorTaxId
- ชื่อ-นามสกุลให้รวมคำนำหน้า (นาย/นาง/นางสาว) ด้วย
- ตัวอักษรไทยจาก OCR อาจมีช่องว่างระหว่างตัวอักษร เช่น "น า ย" = "นาย" ให้รวมคำกลับ
- ที่อยู่ให้รวมเป็นบรรทัดเดียว
- ห้ามเดาข้อมูลที่ไม่มีในบัตร

ตอบกลับ JSON เท่านั้น`;
}

function getParseUserPrompt(documentType?: DocumentType): string {
  if (documentType === "id_card") return getIdCardParsePrompt();

  const typeHint =
    documentType === "receipt"
      ? `เอกสารนี้คือ **ใบเสร็จรับเงิน / ใบกำกับภาษี** (หลังจ่ายเงินแล้ว)`
      : documentType === "invoice"
      ? `เอกสารนี้คือ **ใบแจ้งหนี้ / ใบวางบิล / ใบเสนอราคา / ใบเสร็จรับเงิน / ใบกำกับภาษี**`
      : "";

  return `${typeHint}

⚠️⚠️⚠️ สำคัญที่สุด — แยกผู้ขาย vs ผู้ซื้อให้ถูกต้อง! ⚠️⚠️⚠️

**ผู้ขาย (vendor)** = ผู้ออกเอกสาร/ร้านค้า/ผู้รับเงิน
  ✅ อยู่ **ด้านบนสุด** ของเอกสาร — มักมีโลโก้, ชื่อบริษัทตัวใหญ่
  ✅ เลขภาษีของผู้ขาย = เลขภาษีตัว **แรก** ที่เจอใน header
  ⚠️ ชื่อผู้ขายต้องคัดลอกตรงตัวจาก text ที่ให้มา ห้ามแปลหรือเปลี่ยน

**ผู้ซื้อ (buyer)** = ลูกค้าที่ซื้อของ/จ่ายเงิน — คนละคนกับผู้ขาย!
  ✅ อยู่ส่วน "ลูกค้า" "ผู้ซื้อ" "Customer" "Bill to" "Sold to"
  ✅ เลขภาษีของผู้ซื้อ = เลขภาษีตัว **ที่สอง** (ไม่ใช่ตัวเดียวกับผู้ขาย!)
  ⚠️ ห้ามเอาชื่อผู้ขายมาใส่เป็นชื่อผู้ซื้อ!

**ตรวจสอบซ้ำ:**
  - vendorName ≠ buyerName (ต้องไม่เหมือนกัน!)
  - vendorTaxId ≠ buyerTaxId (ต้องไม่เหมือนกัน!)

Extract ข้อมูลจากเอกสารนี้ตาม schema:
{
  "vendorName": "ชื่อผู้ออกเอกสาร / ผู้ขาย / ผู้รับเงิน",
  "vendorAddress": "ที่อยู่ผู้ขาย",
  "vendorTaxId": "เลขผู้เสียภาษีผู้ขาย 13 หลัก (เอาแค่ตัวเลข)",
  "vendorBranch": "สำนักงานใหญ่ หรือ สาขา XXXX (ของผู้ขาย)",
  "vendorPhone": "เบอร์โทรผู้ขาย",
  "buyerName": "ชื่อผู้ซื้อ / ลูกค้า",
  "buyerAddress": "ที่อยู่ผู้ซื้อ",
  "buyerTaxId": "เลขผู้เสียภาษีผู้ซื้อ 13 หลัก (เอาแค่ตัวเลข)",
  "buyerBranch": "สำนักงานใหญ่ หรือ สาขา XXXX (ของผู้ซื้อ)",
  "invoiceNumber": "เลขที่เอกสาร",
  "documentType": "invoice | receipt | tax_invoice | quotation",
  "documentDate": "วันที่เอกสาร YYYY-MM-DD (แปลง พ.ศ. → ค.ศ.)",
  "dueDate": "วันครบกำหนด YYYY-MM-DD (ถ้ามี)",
  "subtotal": "ยอดก่อน VAT (number)",
  "vatAmount": "VAT 7% (number, null ถ้าไม่มี)",
  "withholdingTax": "หัก ณ ที่จ่าย (number, null ถ้าไม่ระบุ)",
  "totalAmount": "ยอดรวมสุดท้าย (number)",
  "hasVat": true/false,
  "items": [{"description": "...", "quantity": N, "unitPrice": N, "amount": N}],
  "confidence": 0.0-1.0
}

ตอบกลับ JSON เท่านั้น`;
}

// --------------- Helper Functions ---------------

function normThai(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v)
    .normalize("NFC")
    .replace(/\u0E4D\u0E32/g, "\u0E33")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim();
  return s || null;
}

function asNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/,/g, ""));
  return isFinite(n) ? n : null;
}

function asBool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v.toLowerCase() === "true";
  return false;
}

// --------------- Provider Class ---------------

export class AksonOcrProvider implements OcrProvider {
  name = "aksonocr" as const;

  async parseReceipt(
    fileBuffer: Buffer,
    mimeType: string,
    documentType?: DocumentType
  ): Promise<OcrParsedReceipt> {
    const totalStart = Date.now();

    // === Step 1: Akson OCR — fast text extraction ===
    console.log("[Akson+GPT] Step 1: Akson OCR text extraction...");
    const step1Start = Date.now();
    const ocrText = await this.aksonExtractText(fileBuffer, mimeType);
    const step1Time = Date.now() - step1Start;
    console.log(`[Akson+GPT] Step 1 done in ${step1Time}ms — ${ocrText.length} chars`);

    if (!ocrText || ocrText.trim().length < 20) {
      throw new Error("Akson OCR returned too little text");
    }

    // === Step 2: GPT-4o parse text → structured JSON ===
    console.log("[Akson+GPT] Step 2: GPT-4o parsing text to JSON...");
    const step2Start = Date.now();
    const result = await this.gptParseText(ocrText, documentType);
    const step2Time = Date.now() - step2Start;
    console.log(`[Akson+GPT] Step 2 done in ${step2Time}ms`);

    const totalTime = Date.now() - totalStart;
    console.log(`[Akson+GPT] Total: ${totalTime}ms (Akson: ${step1Time}ms + GPT: ${step2Time}ms)`);

    return result;
  }

  // --------------- Step 1: Akson OCR Text Extraction ---------------

  private async aksonExtractText(buffer: Buffer, mimeType: string): Promise<string> {
    const apiKey = getAksonKey();

    const ext = mimeType === "application/pdf" ? "pdf"
      : mimeType === "image/png" ? "png"
      : mimeType === "image/webp" ? "webp"
      : "jpg";

    const blob = new Blob([buffer as unknown as BlobPart], { type: mimeType });
    const formData = new FormData();
    formData.append("file", blob, `receipt.${ext}`);
    formData.append("model", AKSON_MODEL);

    const sizeKB = (buffer.length / 1024).toFixed(0);
    console.log(`[Akson OCR] Sending ${sizeKB}KB ${ext} (model: ${AKSON_MODEL})...`);

    const response = await fetch(AKSON_UPLOAD_URL, {
      method: "POST",
      headers: {
        "X-API-Key": apiKey,
      },
      body: formData,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Akson OCR API error: ${response.status} ${errText}`);
    }

    const data = (await response.json()) as AksonOcrResponse;

    if (data.error || data.code) {
      throw new Error(`Akson OCR: ${data.error || data.code}`);
    }

    // Combine markdown text from all pages
    const allText = (data.pages || [])
      .map((p) => p.markdown || "")
      .join("\n\n---\n\n");

    return allText;
  }

  // --------------- Step 2: GPT Parse Text → JSON ---------------

  private async gptParseText(
    ocrText: string,
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
            content: `${getParseUserPrompt(documentType)}\n\n--- TEXT FROM DOCUMENT (OCR) ---\n${ocrText.slice(0, 8000)}\n--- END ---`,
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

    return this.normalize(parsed, ocrText);
  }

  // --------------- Normalize ---------------

  private normalize(raw: Record<string, unknown>, ocrText: string): OcrParsedReceipt {
    const taxIdRaw = normThai(raw.vendorTaxId);
    const taxId = taxIdRaw ? taxIdRaw.replace(/\D/g, "") : null;
    const validTaxId = taxId && taxId.length === 13 ? taxId : null;

    const buyerTaxIdRaw = normThai(raw.buyerTaxId);
    const buyerTaxId = buyerTaxIdRaw ? buyerTaxIdRaw.replace(/\D/g, "") : null;
    const validBuyerTaxId = buyerTaxId && buyerTaxId.length === 13 ? buyerTaxId : null;

    const docTypeRaw = normThai(raw.documentType)?.toLowerCase();
    const documentType: DocumentType | null =
      docTypeRaw === "invoice" ||
      docTypeRaw === "receipt" ||
      docTypeRaw === "tax_invoice" ||
      docTypeRaw === "quotation"
        ? docTypeRaw
        : null;

    const items: OcrParsedReceipt["items"] = Array.isArray(raw.items)
      ? (raw.items as Record<string, unknown>[]).map((it) => ({
          description: normThai(it.description) || "",
          quantity: asNumber(it.quantity) ?? undefined,
          unitPrice: asNumber(it.unitPrice) ?? undefined,
          amount: asNumber(it.amount) ?? 0,
        }))
      : [];

    const vatAmount = asNumber(raw.vatAmount);

    return {
      vendorName: normThai(raw.vendorName),
      vendorAddress: normThai(raw.vendorAddress),
      vendorTaxId: validTaxId,
      vendorBranch: normThai(raw.vendorBranch),
      vendorPhone: normThai(raw.vendorPhone),
      buyerName: normThai(raw.buyerName),
      buyerAddress: normThai(raw.buyerAddress),
      buyerTaxId: validBuyerTaxId,
      buyerBranch: normThai(raw.buyerBranch),
      invoiceNumber: normThai(raw.invoiceNumber),
      documentType,
      documentDate: normThai(raw.documentDate),
      dueDate: normThai(raw.dueDate),
      subtotal: asNumber(raw.subtotal),
      vatAmount,
      withholdingTax: asNumber(raw.withholdingTax),
      totalAmount: asNumber(raw.totalAmount),
      hasVat: asBool(raw.hasVat) || (vatAmount != null && vatAmount > 0),
      items,
      confidence: asNumber(raw.confidence) ?? 0.8,
      rawText: ocrText.slice(0, 500),
      provider: "aksonocr",
    };
  }
}
