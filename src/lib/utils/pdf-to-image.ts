/**
 * PDF → Image Conversion (Client-side)
 * แปลง PDF หน้าแรกเป็น PNG เพื่อส่ง OCR API
 * ใช้ pdfjs-dist + canvas ใน browser
 */
"use client";

/**
 * Convert the first page of a PDF file to a PNG image.
 * Uses pdfjs-dist to render on an offscreen canvas.
 * @param file - The PDF File to convert
 * @param scale - Render scale (2 = 2x resolution for clarity)
 * @returns A new File object containing the PNG image
 */
export async function pdfFirstPageToImage(
  file: File,
  scale = 2
): Promise<File> {
  // Dynamic import to avoid SSR issues
  const pdfjsLib = await import("pdfjs-dist");

  // Configure worker from CDN matching the installed version
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
  }

  // Read file as ArrayBuffer
  const arrayBuffer = await file.arrayBuffer();

  // Load PDF document
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer),
    // Disable font loading for speed (we only need visual render)
    disableFontFace: false,
  });

  const pdf = await loadingTask.promise;

  // Get first page
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale });

  // Create offscreen canvas
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas 2D context not available");
  }

  // Render page to canvas
  // pdfjs-dist v5 requires `canvas` in RenderParameters
  await page.render({
    canvasContext: ctx,
    viewport,
    canvas,
  } as Parameters<typeof page.render>[0]).promise;

  // Convert canvas to PNG blob
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error("Failed to convert canvas to blob"));
      },
      "image/png",
      0.95
    );
  });

  // Clean up
  page.cleanup();
  await pdf.destroy();

  // Create new File with .png extension
  const baseName = file.name.replace(/\.pdf$/i, "");
  return new File([blob], `${baseName}.png`, { type: "image/png" });
}

/**
 * Check if a file is a PDF
 */
export function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}
