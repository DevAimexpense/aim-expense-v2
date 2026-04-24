"use client";

import { useEffect } from "react";

/**
 * Client component: ใส่ในหน้า fallback (เช่น "payment not found")
 * ถ้า URL มี ?auto=1 → ส่ง postMessage error กลับ parent iframe
 * เพื่อให้ auto-save loop ยกเลิกทันที (ไม่ต้องรอ 90s timeout)
 */
export function AutoFailMessenger({
  paymentId,
  reason,
}: {
  paymentId: string;
  reason: string;
}) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("auto") !== "1") return;
    console.warn(`[auto-save ${paymentId}] FAIL — ${reason}`);
    if (window.parent !== window) {
      try {
        window.parent.postMessage(
          { type: "doc-gen-result", success: false, error: reason },
          window.location.origin
        );
      } catch { /* ignore */ }
    }
  }, [paymentId, reason]);
  return null;
}
