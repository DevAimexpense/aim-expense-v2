// ===========================================
// OCR Service — Provider Router
// Primary: Akson (iApp Thai Receipt OCR) — fast & accurate for Thai
// Fallback: OpenAI GPT-4o 2-pass
// ===========================================

import type { OcrProvider, OcrParsedReceipt, DocumentType } from "./types";
import { OpenAIOcrProvider } from "./openai-provider";
import { AksonOcrProvider } from "./akson-provider";

export type { OcrParsedReceipt, DocumentType };

// LINE-24: ข้อความที่ส่งถึงผู้ใช้ต้องเป็นภาษาไทยสั้น ๆ — รายละเอียดของแต่ละ provider
// (ภาษาอังกฤษ, อาจมี status/body ของ API) อยู่ใน log และ `providerErrors` เท่านั้น
export const OCR_TIMEOUT_MESSAGE = "อ่านใบเสร็จนานเกินไป กรุณาลองใหม่อีกครั้ง";
export const OCR_FAILED_MESSAGE = "อ่านใบเสร็จไม่สำเร็จ กรุณาลองใหม่อีกครั้ง";

/** fetch ที่ถูกยกเลิกด้วย AbortSignal.timeout → DOMException name "TimeoutError" (หรือ "AbortError") */
export function isTimeoutError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const name = (err as { name?: string }).name;
  if (name === "TimeoutError" || name === "AbortError") return true;
  const msg = (err as { message?: string }).message ?? "";
  return /aborted due to timeout|TimeoutError|AbortError/i.test(msg);
}

/** ทุก provider ล้มเหลว — `message` เป็นภาษาไทยพร้อมแสดงผู้ใช้, รายละเอียดอยู่ใน `providerErrors` */
export class OcrFailedError extends Error {
  readonly providerErrors: string[];
  readonly timedOut: boolean;
  constructor(providerErrors: string[], timedOut: boolean) {
    super(timedOut ? OCR_TIMEOUT_MESSAGE : OCR_FAILED_MESSAGE);
    this.name = "OcrFailedError";
    this.providerErrors = providerErrors;
    this.timedOut = timedOut;
  }
}

let providers: OcrProvider[] | null = null;

function getProviders(): OcrProvider[] {
  if (providers) return providers;

  const list: OcrProvider[] = [];

  // Primary: Akson (iApp) — dedicated Thai receipt OCR, fast ~3-5s
  if (process.env.AKSONOCR_API_KEY) {
    list.push(new AksonOcrProvider());
    console.log("[OCR] Akson (iApp) provider enabled as PRIMARY");
  }

  // Fallback: OpenAI GPT-4o — general purpose, works for all document types
  list.push(new OpenAIOcrProvider());

  providers = list;
  return list;
}

/**
 * Parse receipt/invoice image with OCR
 * Tries primary provider first, falls back to next on failure
 */
export async function parseReceipt(
  fileBuffer: Buffer,
  mimeType: string,
  documentType?: DocumentType
): Promise<OcrParsedReceipt> {
  const list = getProviders();
  const errors: string[] = [];
  let timedOut = false;

  for (const provider of list) {
    try {
      console.log(`[OCR] Trying provider: ${provider.name}...`);
      const startTime = Date.now();
      const result = await provider.parseReceipt(fileBuffer, mimeType, documentType);
      const elapsed = Date.now() - startTime;
      console.log(`[OCR] ✓ ${provider.name} succeeded in ${elapsed}ms`);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[OCR] ✗ ${provider.name} failed:`, msg);
      errors.push(`${provider.name}: ${msg}`);
      if (isTimeoutError(err)) timedOut = true;
    }
  }

  // LINE-24: log รายละเอียดภาษาอังกฤษที่นี่ — ผู้เรียกได้ error ภาษาไทยไปแสดงผู้ใช้
  console.error(`[OCR] All OCR providers failed${timedOut ? " (timeout)" : ""}: ${errors.join(" | ")}`);
  throw new OcrFailedError(errors, timedOut);
}
