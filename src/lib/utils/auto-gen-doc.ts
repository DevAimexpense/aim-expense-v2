// ===========================================
// Background Document Generation Trigger (Robust version)
// สร้าง hidden iframe เพื่อ load doc page ในโหมด auto-save
// → doc page จะ auto-trigger save PDF → postMessage กลับมา
// → ลบ iframe เมื่อเสร็จ
//
// ใช้สำหรับ trigger auto-save เอกสารระบบ (WHT cert / substitute-receipt / receipt-voucher)
// โดยไม่รบกวน UX ของ user (ทำ background)
// ===========================================

export type SystemDocType = "wht-cert" | "substitute-receipt" | "receipt-voucher";

/**
 * ตัดสินว่า payment นั้นควร auto-generate doc type ไหนบ้าง
 * Rule:
 * - wthAmount > 0 → "wht-cert"
 * - documentType = "substitute_receipt" → "substitute-receipt"
 * - documentType = "id_card" + wthAmount = 0 → "receipt-voucher"
 * - อื่น ๆ → null (ไม่ต้องสร้าง)
 */
export function resolveDocTypeForPayment(params: {
  wthAmount: number;
  documentType?: string;
}): SystemDocType | null {
  if (params.wthAmount > 0) return "wht-cert";
  if (params.documentType === "substitute_receipt") return "substitute-receipt";
  if (params.documentType === "id_card") return "receipt-voucher";
  return null;
}

export type AutoGenResult = {
  success: boolean;
  fileUrl?: string;
  error?: string;
};

export type AutoGenOptions = {
  onProgress?: (status: "started" | "loaded" | "capturing" | "uploading" | "done" | "error", info?: { message?: string; fileUrl?: string }) => void;
  timeoutMs?: number; // default 90s (Thai fonts + html2canvas + Drive upload ต้องการเวลา)
};

/**
 * Trigger auto-save document ในเบื้องหลัง (fire-and-forget)
 * ใช้ hidden iframe เปิดหน้า doc ด้วย ?auto=1 → หน้านั้นจะ auto-save แล้วส่ง postMessage กลับ
 */
export function triggerBackgroundDocGen(
  paymentId: string,
  docType: SystemDocType,
  options: AutoGenOptions = {}
): Promise<AutoGenResult> {
  const { onProgress, timeoutMs = 90000 } = options;

  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve({ success: false, error: "not-in-browser" });
      return;
    }

    const tag = `[auto-gen ${docType} ${paymentId}]`;
    console.log(`${tag} creating iframe...`);
    onProgress?.("started");

    const iframe = document.createElement("iframe");
    iframe.style.cssText =
      "position:fixed;left:-9999px;top:-9999px;width:900px;height:1400px;border:0;visibility:hidden;pointer-events:none;";
    iframe.setAttribute("aria-hidden", "true");
    iframe.setAttribute("data-auto-gen", `${docType}-${paymentId}`);

    let settled = false;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    let loadFallbackId: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (settled) return;
      settled = true;
      if (timerId) clearTimeout(timerId);
      if (loadFallbackId) clearTimeout(loadFallbackId);
      window.removeEventListener("message", handler);
      try {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      } catch { /* ignore */ }
    };

    const handler = (e: MessageEvent) => {
      // Same-origin check
      if (e.source !== iframe.contentWindow) return;
      const data = e.data;
      if (!data || typeof data !== "object") return;
      if (data.type !== "doc-gen-result") {
        // Progress messages (optional)
        if (data.type === "doc-gen-progress") {
          console.log(`${tag} progress:`, data.stage, data.message || "");
          if (data.stage === "capturing") onProgress?.("capturing");
          else if (data.stage === "uploading") onProgress?.("uploading");
        }
        return;
      }
      console.log(`${tag} received result:`, data.success ? "SUCCESS" : "FAIL", data);
      const success = !!data.success;
      if (success) {
        onProgress?.("done", { fileUrl: data.fileUrl });
      } else {
        onProgress?.("error", { message: data.error });
      }
      cleanup();
      resolve({ success, fileUrl: data.fileUrl, error: data.error });
    };
    window.addEventListener("message", handler);

    iframe.addEventListener("load", () => {
      console.log(`${tag} iframe loaded`);
      onProgress?.("loaded");
    });

    iframe.addEventListener("error", (e) => {
      console.error(`${tag} iframe load error:`, e);
      onProgress?.("error", { message: "iframe-load-error" });
      cleanup();
      resolve({ success: false, error: "iframe-load-error" });
    });

    // Hard timeout — ถ้า iframe ค้างเกิน timeoutMs → ยกเลิก
    timerId = setTimeout(() => {
      if (settled) return;
      console.warn(`${tag} TIMEOUT after ${timeoutMs}ms`);
      onProgress?.("error", { message: "timeout" });
      cleanup();
      resolve({ success: false, error: "timeout" });
    }, timeoutMs);

    // Append iframe และ set src — append ก่อนเพื่อให้ DOM มี element อยู่ตอน load
    document.body.appendChild(iframe);
    iframe.src = `/documents/${docType}/${paymentId}?auto=1`;
  });
}

// ----- Toast helper (lightweight, no dependency) -----
// แสดง toast feedback ให้ user รู้ว่า auto-save กำลังทำงาน
// ไม่ block UI, fade-in/out smooth

const DOC_LABEL: Record<SystemDocType, string> = {
  "wht-cert": "หนังสือรับรองหัก ณ ที่จ่าย",
  "substitute-receipt": "ใบรับรองแทนใบเสร็จ",
  "receipt-voucher": "ใบสำคัญรับเงิน",
};

function ensureToastContainer(): HTMLDivElement {
  let container = document.getElementById("auto-gen-toast-container") as HTMLDivElement | null;
  if (!container) {
    container = document.createElement("div");
    container.id = "auto-gen-toast-container";
    container.style.cssText =
      "position:fixed;bottom:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:8px;pointer-events:none;font-family:'IBM Plex Sans Thai',system-ui,sans-serif;";
    document.body.appendChild(container);
  }
  return container;
}

function createToast(docType: SystemDocType): {
  setStatus: (status: "saving" | "capturing" | "uploading" | "done" | "error", info?: { fileUrl?: string; message?: string }) => void;
  close: () => void;
} {
  const container = ensureToastContainer();
  const toast = document.createElement("div");
  toast.style.cssText =
    "background:#1e293b;color:#fff;padding:12px 16px;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,0.25);min-width:260px;max-width:360px;pointer-events:auto;font-size:13px;line-height:1.4;transition:all 0.25s ease;opacity:0;transform:translateY(12px);";
  toast.innerHTML = `
    <div style="display:flex;align-items:flex-start;gap:10px;">
      <div class="agt-icon" style="font-size:16px;line-height:1;margin-top:1px;">⏳</div>
      <div style="flex:1;min-width:0;">
        <div class="agt-title" style="font-weight:600;margin-bottom:2px;">กำลังบันทึก ${DOC_LABEL[docType]} ลง Drive...</div>
        <div class="agt-sub" style="opacity:0.75;font-size:12px;">กำลังเตรียมเอกสาร</div>
      </div>
    </div>`;
  container.appendChild(toast);
  // Fade in
  requestAnimationFrame(() => {
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";
  });

  const iconEl = toast.querySelector(".agt-icon") as HTMLElement;
  const titleEl = toast.querySelector(".agt-title") as HTMLElement;
  const subEl = toast.querySelector(".agt-sub") as HTMLElement;

  const close = () => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(12px)";
    setTimeout(() => {
      try { toast.remove(); } catch { /* ignore */ }
    }, 280);
  };

  return {
    setStatus: (status, info) => {
      if (status === "saving") {
        iconEl.textContent = "⏳";
        subEl.textContent = "กำลังเตรียมเอกสาร";
      } else if (status === "capturing") {
        iconEl.textContent = "📸";
        subEl.textContent = "กำลังสร้าง PDF...";
      } else if (status === "uploading") {
        iconEl.textContent = "☁️";
        subEl.textContent = "กำลังอัปโหลดเข้า Google Drive...";
      } else if (status === "done") {
        toast.style.background = "#065f46";
        iconEl.textContent = "✅";
        titleEl.textContent = `บันทึก ${DOC_LABEL[docType]} สำเร็จ`;
        if (info?.fileUrl) {
          subEl.innerHTML = `<a href="${info.fileUrl}" target="_blank" rel="noopener" style="color:#86efac;text-decoration:underline;">เปิดใน Google Drive</a>`;
        } else {
          subEl.textContent = "บันทึกลง Drive แล้ว";
        }
        setTimeout(close, 5000);
      } else if (status === "error") {
        toast.style.background = "#991b1b";
        iconEl.textContent = "⚠️";
        titleEl.textContent = `บันทึก ${DOC_LABEL[docType]} ไม่สำเร็จ`;
        subEl.textContent = info?.message || "กรุณากดบันทึกเองที่หน้าเอกสาร";
        setTimeout(close, 8000);
      }
    },
    close,
  };
}

/**
 * Trigger auto-gen แบบ fire-and-forget — ไม่ await, ไม่ block UI
 * เหมาะสำหรับเรียกตอน payment สร้างเสร็จ → user ปิด modal ต่อได้เลย
 *
 * Default: แสดง toast progress อัตโนมัติ ถ้าอยากปิด → ส่ง `{ silent: true }`
 */
export function fireAutoGenDoc(
  paymentId: string,
  docType: SystemDocType,
  options: AutoGenOptions & { silent?: boolean } = {}
): void {
  const { silent = false, onProgress: userProgress, ...rest } = options;

  let toast: ReturnType<typeof createToast> | null = null;
  if (!silent && typeof window !== "undefined") {
    try {
      toast = createToast(docType);
    } catch (e) {
      console.warn("[auto-gen] failed to create toast:", e);
    }
  }

  const combinedProgress: AutoGenOptions["onProgress"] = (status, info) => {
    userProgress?.(status, info);
    if (!toast) return;
    if (status === "started") toast.setStatus("saving");
    else if (status === "loaded") toast.setStatus("saving");
    else if (status === "capturing") toast.setStatus("capturing");
    else if (status === "uploading") toast.setStatus("uploading");
    else if (status === "done") toast.setStatus("done", info);
    else if (status === "error") toast.setStatus("error", info);
  };

  triggerBackgroundDocGen(paymentId, docType, { ...rest, onProgress: combinedProgress }).then((result) => {
    if (result.success) {
      console.log(`[auto-gen] ✓ saved ${docType} for ${paymentId}:`, result.fileUrl);
    } else {
      console.warn(`[auto-gen] ✗ failed ${docType} for ${paymentId}:`, result.error);
    }
  });
}
