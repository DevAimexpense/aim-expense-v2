"use client";

// ===========================================
// หนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ) — ตัวแสดง PDF
// เอกสารจริงคือ PDF vector จาก /api/documents/wht-cert/[paymentId]
// (ฟอร์มกรมสรรพากรต้นฉบับ + ข้อมูลเขียนทับด้วย pdf-lib) — หน้านี้ไม่วาดฟอร์มเอง
// ===========================================

import { useEffect, useRef, useState } from "react";
import { saveDocumentPdf, runAutoSaveIfRequested } from "@/lib/utils/save-doc-pdf";

interface WthCertProps {
  paymentId: string;
  paymentDate: string;
  docNumber: { book: string; number: string };
  payeeName: string;
}

export function WthCertDocument({ paymentId, paymentDate, docNumber, payeeName }: WthCertProps) {
  const pdfUrl = `/api/documents/wht-cert/${encodeURIComponent(paymentId)}`;
  const frameRef = useRef<HTMLIFrameElement>(null);

  // พิมพ์ PDF ตัวจริง (ไม่ใช่ภาพหน้าจอ) — ถ้า browser ไม่ยอมให้สั่งพิมพ์ใน iframe ให้เปิดแท็บใหม่
  const handlePrint = () => {
    try {
      const w = frameRef.current?.contentWindow;
      if (!w) throw new Error("no frame");
      w.focus();
      w.print();
    } catch {
      window.open(pdfUrl, "_blank", "noopener");
    }
  };

  // Save PDF to Drive
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [savedUrl, setSavedUrl] = useState("");
  const [saveError, setSaveError] = useState("");
  const handleSavePdf = async () => {
    setSaveState("saving");
    setSaveError("");
    try {
      const result = await saveDocumentPdf({
        selector: ".wth-doc",
        pdfUrl,
        paymentId,
        docType: "wht-cert",
        docDate: paymentDate,
      });
      setSavedUrl(result.fileUrl);
      setSaveState("saved");
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
      setSaveState("error");
    }
  };

  // Auto-save mode: ?auto=1 → บันทึกลง Drive อัตโนมัติ + postMessage กลับ parent
  useEffect(() => {
    runAutoSaveIfRequested({
      selector: ".wth-doc",
      pdfUrl,
      paymentId,
      docType: "wht-cert",
      docDate: paymentDate,
      onStateChange: (state, info) => {
        if (state === "saving") setSaveState("saving");
        else if (state === "saved") {
          setSaveState("saved");
          setSavedUrl(info?.fileUrl || "");
        } else if (state === "error") {
          setSaveState("error");
          setSaveError(info?.error || "");
        }
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="wth-view">
      <div className="wth-bar">
        <div className="wth-bar-title">
          <strong>หนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ)</strong>
          <span>
            เล่มที่ {docNumber.book} เลขที่ {docNumber.number}
            {payeeName ? ` • ${payeeName}` : ""}
          </span>
        </div>
        <div className="wth-bar-actions">
          <button onClick={() => window.history.back()} className="app-btn app-btn-secondary">
            ← กลับ
          </button>
          <button onClick={handlePrint} className="app-btn app-btn-secondary">
            🖨️ พิมพ์
          </button>
          <a href={`${pdfUrl}?download=1`} className="app-btn app-btn-secondary">
            ⬇️ ดาวน์โหลด PDF
          </a>
          {saveState === "saved" && savedUrl ? (
            <a
              href={savedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="app-btn"
              style={{ background: "#16a34a", color: "white" }}
            >
              ✅ บันทึกแล้ว — ดูใน Drive
            </a>
          ) : (
            <button
              onClick={handleSavePdf}
              disabled={saveState === "saving"}
              className="app-btn app-btn-primary"
            >
              {saveState === "saving" ? "⏳ กำลังบันทึก..." : "💾 บันทึก PDF ลง Drive"}
            </button>
          )}
        </div>
      </div>
      {saveError && <div className="wth-error">⚠️ {saveError}</div>}

      <iframe ref={frameRef} src={pdfUrl} title="หนังสือรับรองหัก ณ ที่จ่าย" className="wth-doc" />

      <p className="wth-fallback">
        ถ้าเอกสารไม่แสดง{" "}
        <a href={pdfUrl} target="_blank" rel="noopener noreferrer">
          เปิด PDF ในแท็บใหม่
        </a>
      </p>

      <style jsx>{`
        .wth-view {
          display: flex;
          flex-direction: column;
          height: 100vh;
          background: #e2e8f0;
        }
        .wth-bar {
          display: flex;
          gap: 0.75rem;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          padding: 0.625rem 1rem;
          background: white;
          border-bottom: 1px solid #cbd5e1;
        }
        .wth-bar-title {
          display: flex;
          flex-direction: column;
          font-size: 0.875rem;
          color: #0f172a;
        }
        .wth-bar-title span {
          font-size: 0.75rem;
          color: #64748b;
        }
        .wth-bar-actions {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }
        .wth-error {
          background: #fef2f2;
          border-bottom: 1px solid #fecaca;
          color: #991b1b;
          padding: 0.5rem 1rem;
          font-size: 0.8125rem;
        }
        .wth-doc {
          flex: 1;
          width: 100%;
          border: 0;
          background: #e2e8f0;
        }
        .wth-fallback {
          margin: 0;
          padding: 0.375rem 1rem;
          font-size: 0.75rem;
          color: #64748b;
          background: white;
          border-top: 1px solid #cbd5e1;
        }
        .wth-fallback a {
          color: #2563eb;
        }
      `}</style>
    </div>
  );
}
