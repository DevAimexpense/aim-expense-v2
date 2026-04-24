// ===========================================
// Tesseract.js OCR Helper (Optimized)
// Singleton worker + image resize for speed
// ===========================================

import Tesseract from "tesseract.js";
import type Sharp from "sharp";

// Dynamic import to avoid webpack bundling issues
async function getSharp(): Promise<typeof Sharp> {
  const mod = await import("sharp");
  return mod.default;
}

// --------------- Singleton Worker ---------------
// Pre-load Thai+English model once, reuse across all OCR requests.
// This saves ~10-20s per request (no re-downloading the language model).

let _worker: Tesseract.Worker | null = null;
let _workerReady: Promise<Tesseract.Worker> | null = null;

async function getWorker(): Promise<Tesseract.Worker> {
  if (_worker) return _worker;

  // Prevent multiple parallel initializations
  if (_workerReady) return _workerReady;

  _workerReady = (async () => {
    console.log("[Tesseract] Initializing singleton worker (tha+eng)...");
    const startTime = Date.now();
    const worker = await Tesseract.createWorker("tha+eng", Tesseract.OEM.LSTM_ONLY);
    const elapsed = Date.now() - startTime;
    console.log(`[Tesseract] Worker ready in ${elapsed}ms`);
    _worker = worker;
    return worker;
  })();

  return _workerReady;
}

// --------------- Image Resize ---------------
// Resize large images to max 1400px width before OCR.
// Reduces processing time by ~50-70% with minimal quality loss.

const MAX_WIDTH = 1400;
const MAX_HEIGHT = 2000;

async function resizeIfNeeded(imageBuffer: Buffer): Promise<Buffer> {
  try {
    const sharpLib = await getSharp();
    const metadata = await sharpLib(imageBuffer).metadata();
    const w = metadata.width || 0;
    const h = metadata.height || 0;

    if (w <= MAX_WIDTH && h <= MAX_HEIGHT) {
      console.log(`[Tesseract] Image ${w}x${h} — no resize needed`);
      return imageBuffer;
    }

    console.log(`[Tesseract] Resizing image from ${w}x${h} → max ${MAX_WIDTH}x${MAX_HEIGHT}`);
    const resized = await sharpLib(imageBuffer)
      .resize(MAX_WIDTH, MAX_HEIGHT, { fit: "inside", withoutEnlargement: true })
      .grayscale() // improves OCR accuracy + reduces data
      .sharpen()    // sharpen after resize for better text recognition
      .jpeg({ quality: 85 })
      .toBuffer();

    console.log(`[Tesseract] Resized: ${imageBuffer.length} → ${resized.length} bytes`);
    return resized;
  } catch (err) {
    console.warn("[Tesseract] Resize failed, using original:", err);
    return imageBuffer;
  }
}

// --------------- Public API ---------------

/**
 * Extract text from an image buffer using Tesseract.js (Thai + English)
 * Optimized: singleton worker + image resize
 */
export async function extractTextFromImage(
  imageBuffer: Buffer,
  mimeType: string
): Promise<string> {
  try {
    console.log(`[Tesseract] Starting OCR on ${mimeType} image (${imageBuffer.length} bytes)`);
    const startTime = Date.now();

    // Step 1: Resize image for speed
    const processedBuffer = await resizeIfNeeded(imageBuffer);

    // Step 2: Get singleton worker (pre-loaded)
    const worker = await getWorker();

    // Step 3: Run OCR
    const { data } = await worker.recognize(processedBuffer);

    const elapsed = Date.now() - startTime;
    console.log(`[Tesseract] OCR complete in ${elapsed}ms — extracted ${data.text.length} chars`);

    return data.text;
  } catch (err) {
    console.error("[Tesseract] OCR failed:", err);
    // If worker died, reset it so next request creates a new one
    _worker = null;
    _workerReady = null;
    throw new Error(`Tesseract OCR failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Warm up the Tesseract worker (call at server startup to pre-load model).
 * This is optional — the worker will be created lazily on first OCR request.
 */
export async function warmUpTesseract(): Promise<void> {
  try {
    await getWorker();
    console.log("[Tesseract] Worker warmed up and ready");
  } catch (err) {
    console.warn("[Tesseract] Warm-up failed (will retry on first request):", err);
  }
}
