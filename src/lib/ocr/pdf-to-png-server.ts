// ===========================================
// Server-side PDF → PNG conversion
// Uses pdftoppm (poppler-utils) for reliable conversion
// Works with scanned PDFs that have no text layer
// ===========================================

import { writeFile, readFile, unlink, mkdtemp } from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";
import { join } from "path";
import { tmpdir } from "os";

const execFileAsync = promisify(execFile);

/**
 * Convert the first page of a PDF buffer to a PNG image buffer.
 * Uses pdftoppm (from poppler-utils) — extremely reliable for scanned docs.
 *
 * @param pdfBuffer - The PDF file as a Buffer
 * @param dpi - Render resolution (default 300 for OCR quality)
 * @returns PNG image as Buffer
 */
export async function convertPdfPageToImage(
  pdfBuffer: Buffer,
  dpi = 300
): Promise<Buffer> {
  // Create temp directory
  const tempDir = await mkdtemp(join(tmpdir(), "ocr-pdf-"));
  const pdfPath = join(tempDir, "input.pdf");
  const outputPrefix = join(tempDir, "page");

  try {
    // Write PDF to temp file
    await writeFile(pdfPath, pdfBuffer);

    // Convert first page only (-f 1 -l 1) to PNG at specified DPI
    await execFileAsync("pdftoppm", [
      "-png",
      "-r", String(dpi),
      "-f", "1",
      "-l", "1",
      "-singlefile",
      pdfPath,
      outputPrefix,
    ], { timeout: 30_000 });

    // pdftoppm with -singlefile outputs: {prefix}.png
    const pngPath = `${outputPrefix}.png`;
    const pngBuffer = await readFile(pngPath);

    return pngBuffer;
  } finally {
    // Clean up temp files
    try {
      await unlink(pdfPath).catch(() => {});
      await unlink(`${outputPrefix}.png`).catch(() => {});
      // Remove temp dir
      const { rmdir } = await import("fs/promises");
      await rmdir(tempDir).catch(() => {});
    } catch {
      // Ignore cleanup errors
    }
  }
}
