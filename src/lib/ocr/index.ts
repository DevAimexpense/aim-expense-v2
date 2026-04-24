// ===========================================
// OCR Service — Provider Router
// Primary: Akson (iApp Thai Receipt OCR) — fast & accurate for Thai
// Fallback: OpenAI GPT-4o 2-pass
// ===========================================

import type { OcrProvider, OcrParsedReceipt, DocumentType } from "./types";
import { OpenAIOcrProvider } from "./openai-provider";
import { AksonOcrProvider } from "./akson-provider";

export type { OcrParsedReceipt, DocumentType };

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
    }
  }

  throw new Error(`All OCR providers failed: ${errors.join(" | ")}`);
}
