// ===========================================
// OCR Types — shared across providers
// ===========================================

export type DocumentType = "invoice" | "receipt" | "tax_invoice" | "quotation" | "id_card";

export interface OcrParsedReceipt {
  /** Vendor/Payee (ผู้ขาย/ผู้ออกเอกสาร) */
  vendorName: string | null;
  vendorAddress: string | null;
  vendorTaxId: string | null; // 13 digits
  vendorBranch: string | null; // "สำนักงานใหญ่" | "สาขา XXXX"
  vendorPhone: string | null;

  /** Buyer (ผู้ซื้อ/ลูกค้า) */
  buyerName: string | null;
  buyerAddress: string | null;
  buyerTaxId: string | null; // 13 digits
  buyerBranch: string | null; // "สำนักงานใหญ่" | "สาขา XXXX"

  /** Document metadata */
  invoiceNumber: string | null;
  documentType: DocumentType | null;
  documentDate: string | null; // ISO date
  dueDate: string | null; // ISO date

  /** Amounts (in THB) */
  subtotal: number | null; // ยอดก่อน VAT
  vatAmount: number | null; // VAT (ถ้ามี)
  withholdingTax: number | null; // WTH (ถ้าระบุใน invoice)
  totalAmount: number | null; // ยอดรวมสุดท้าย

  /** VAT flag */
  hasVat: boolean;

  /** Line items (optional) */
  items: Array<{
    description: string;
    quantity?: number;
    unitPrice?: number;
    amount: number;
  }>;

  /** Meta */
  confidence: number; // 0-1
  rawText: string; // for debugging
  provider: "openai" | "aksonocr" | "manual";
}

export interface OcrProvider {
  name: "openai" | "aksonocr";
  parseReceipt(
    fileBuffer: Buffer,
    mimeType: string,
    documentType?: DocumentType
  ): Promise<OcrParsedReceipt>;
}
