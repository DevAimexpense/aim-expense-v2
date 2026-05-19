// ===========================================
// Client-side image → data URL with downscaling.
// Used for org logo + authorized-signature uploads — keeps the stored
// string small enough to live in a DB column and embed directly in
// document PDFs (html2canvas renders data URLs without CORS issues).
// ===========================================

/**
 * Read an image File, downscale it so the longest side is at most `maxDim`
 * pixels, and return a PNG data URL (PNG keeps transparency for logos and
 * signatures captured on a transparent background).
 */
export async function imageFileToDataUrl(
  file: File,
  maxDim = 400,
): Promise<string> {
  const sourceUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("อ่านไฟล์ไม่สำเร็จ"));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("ไฟล์รูปภาพไม่ถูกต้อง"));
    el.src = sourceUrl;
  });

  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("เบราว์เซอร์ไม่รองรับการปรับขนาดรูป");
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL("image/png");
}
