// ===========================================
// PDF Text Extraction Helper
// Using unpdf — designed for serverless/Node.js (no DOM APIs needed)
// ===========================================

export interface PdfExtractResult {
  text: string;
  pages: number;
  hasTextLayer: boolean;
}

/**
 * Extract text from PDF buffer using unpdf.
 * unpdf wraps pdfjs with browser API polyfills for Node/edge environments.
 */
export async function extractPdfText(buffer: Buffer): Promise<PdfExtractResult> {
  try {
    const { extractText } = await import("unpdf");

    const result = await extractText(new Uint8Array(buffer), {
      mergePages: true,
    });

    const fullText = String(result.text || "").trim();

    return {
      text: fullText,
      pages: result.totalPages || 0,
      hasTextLayer: fullText.length > 30,
    };
  } catch (err) {
    console.error("[unpdf] extraction failed:", err);
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`PDF ไม่สามารถอ่านได้: ${message}`);
  }
}
