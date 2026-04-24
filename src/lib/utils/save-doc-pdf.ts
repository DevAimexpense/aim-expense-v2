// ===========================================
// Client-side helper: capture HTML element → PDF → upload to Drive
// ใช้ html2canvas + jspdf
// ===========================================

/**
 * รอ DOM + fonts + next animation frame ก่อน capture
 * — ป้องกัน html2canvas capture ก่อน DOM paint เสร็จ (โดยเฉพาะ Thai fonts)
 */
async function waitForDomReady(): Promise<void> {
  // Wait for fonts ready (Thai fonts ต้องโหลดจาก Google Fonts)
  if (typeof document !== "undefined" && "fonts" in document) {
    try {
      await (document as Document & { fonts: { ready: Promise<unknown> } }).fonts.ready;
    } catch { /* ignore */ }
  }
  // 2 rAF เพื่อให้แน่ใจว่า layout + paint เสร็จ
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  // Buffer เพิ่ม 200ms
  await new Promise<void>((resolve) => setTimeout(resolve, 200));
}

/**
 * รอให้ element ปรากฏใน DOM + มี size > 0 (max wait)
 */
async function waitForElement(selector: string, maxWaitMs = 10000): Promise<HTMLElement> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const el = document.querySelector(selector) as HTMLElement | null;
    if (el && el.offsetWidth > 0 && el.offsetHeight > 0) return el;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`ไม่พบเอกสารใน DOM (${selector}) หลังรอ ${maxWaitMs}ms`);
}

/**
 * Capture element as PDF and upload to /api/documents/save-pdf
 * @param options.selector - CSS selector ของ doc container (เช่น ".doc", ".wth-doc")
 * @param options.paymentId - payment ID
 * @param options.docType - "wht-cert" | "substitute-receipt" | "receipt-voucher"
 * @param options.docDate - วันที่ออกเอกสาร (ISO YYYY-MM-DD)
 * @param options.onStage - callback ต่างช่วงสถานะ (optional)
 */
export async function saveDocumentPdf(options: {
  selector: string;
  paymentId: string;
  docType: "wht-cert" | "substitute-receipt" | "receipt-voucher";
  docDate: string;
  onStage?: (stage: "waiting" | "capturing" | "uploading" | "done") => void;
}): Promise<{ fileUrl: string; fileName: string; folderPath: string }> {
  options.onStage?.("waiting");
  await waitForDomReady();
  const element = await waitForElement(options.selector, 10000);

  // Dynamic imports (client only)
  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  options.onStage?.("capturing");

  // Capture as canvas (retina scale 2 → clarity)
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
    logging: false,
  });

  // Create PDF (A4 portrait = 210 × 297 mm)
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  const imgData = canvas.toDataURL("image/jpeg", 0.92);

  // ถ้าสูงเกิน A4 → แบ่งหลายหน้า
  if (imgHeight <= pageHeight) {
    pdf.addImage(imgData, "JPEG", 0, 0, imgWidth, imgHeight);
  } else {
    let position = 0;
    let heightLeft = imgHeight;
    pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }
  }

  // Blob → FormData → POST
  const blob = pdf.output("blob");
  const fd = new FormData();
  fd.append("file", new File([blob], `${options.docType}.pdf`, { type: "application/pdf" }));
  fd.append("paymentId", options.paymentId);
  fd.append("docType", options.docType);
  fd.append("docDate", options.docDate);

  options.onStage?.("uploading");
  const res = await fetch("/api/documents/save-pdf", { method: "POST", body: fd });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || "บันทึก PDF ไม่สำเร็จ");
  }
  const json = await res.json();
  options.onStage?.("done");
  return json;
}

// Module-level guard กัน double-run (จาก React Strict Mode dev double-mount)
// key = `${docType}:${paymentId}` → ถ้าเคยเรียกแล้วใน window นี้ จะ skip
const __autoSaveStarted = new Set<string>();

/**
 * Hook-like helper: run ใน useEffect ของ doc page ที่มี ?auto=1
 * — รอ DOM ready, เรียก save, ส่ง postMessage กลับ parent window (iframe parent)
 * — catch error ครบ → ส่ง doc-gen-result กลับเสมอ
 * — กัน double-run ภายใน window เดียวกัน (Strict Mode safe)
 */
export async function runAutoSaveIfRequested(params: {
  selector: string;
  paymentId: string;
  docType: "wht-cert" | "substitute-receipt" | "receipt-voucher";
  docDate: string;
  onStateChange?: (state: "saving" | "saved" | "error", info?: { fileUrl?: string; error?: string }) => void;
}): Promise<void> {
  if (typeof window === "undefined") return;
  const search = new URLSearchParams(window.location.search);
  if (search.get("auto") !== "1") return;

  // กัน Strict Mode double-mount + กัน user reload หน้าซ้ำ
  const guardKey = `${params.docType}:${params.paymentId}`;
  if (__autoSaveStarted.has(guardKey)) {
    console.log(`[auto-save ${guardKey}] SKIP — already started in this window`);
    return;
  }
  __autoSaveStarted.add(guardKey);

  const tag = `[auto-save ${params.docType} ${params.paymentId}]`;
  const sendProgress = (stage: "capturing" | "uploading") => {
    if (window.parent !== window) {
      try {
        window.parent.postMessage(
          { type: "doc-gen-progress", stage },
          window.location.origin
        );
      } catch { /* ignore */ }
    }
  };

  const sendResult = (result: { success: boolean; fileUrl?: string; error?: string }) => {
    if (window.parent !== window) {
      try {
        window.parent.postMessage(
          { type: "doc-gen-result", ...result },
          window.location.origin
        );
      } catch (e) {
        console.error(`${tag} postMessage failed:`, e);
      }
    }
  };

  console.log(`${tag} auto-save starting...`);
  params.onStateChange?.("saving");
  try {
    const result = await saveDocumentPdf({
      selector: params.selector,
      paymentId: params.paymentId,
      docType: params.docType,
      docDate: params.docDate,
      onStage: (stage) => {
        if (stage === "capturing") sendProgress("capturing");
        if (stage === "uploading") sendProgress("uploading");
      },
    });
    console.log(`${tag} SUCCESS:`, result.fileUrl);
    params.onStateChange?.("saved", { fileUrl: result.fileUrl });
    sendResult({ success: true, fileUrl: result.fileUrl });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "บันทึกไม่สำเร็จ";
    console.error(`${tag} ERROR:`, msg, e);
    // Cleanup guard เพื่อให้ retry ได้ (user refresh เพื่อลองใหม่)
    __autoSaveStarted.delete(guardKey);
    params.onStateChange?.("error", { error: msg });
    sendResult({ success: false, error: msg });
  }
}
