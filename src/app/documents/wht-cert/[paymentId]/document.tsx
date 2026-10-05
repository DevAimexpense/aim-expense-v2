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
}

type Loaded = { blob: Blob; url: string; docDate: string; docNumber: string; filename: string };

export function WthCertDocument({ paymentId }: WthCertProps) {
  const pdfUrl = `/api/documents/wht-cert/${encodeURIComponent(paymentId)}`;
  const frameRef = useRef<HTMLIFrameElement>(null);

  // โหลด PDF ครั้งเดียว แล้วใช้ไฟล์เดียวกันทั้งแสดง / พิมพ์ / ดาวน์โหลด / บันทึกลง Drive
  const [doc, setDoc] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState("");

  // Save PDF to Drive
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [savedUrl, setSavedUrl] = useState("");
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    let cancelled = false;
    let objectUrl = "";
    const isAuto =
      new URLSearchParams(window.location.search).get("auto") === "1";

    (async () => {
      try {
        const res = await fetch(pdfUrl, { cache: "no-store" });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || "สร้างเอกสารไม่สำเร็จ");
        }
        const blob = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        const loaded: Loaded = {
          blob,
          url: objectUrl,
          docDate: res.headers.get("x-doc-date") || new Date().toISOString().slice(0, 10),
          docNumber: res.headers.get("x-doc-number") || "",
          filename: res.headers.get("x-doc-filename") || "50tawi.pdf",
        };
        setDoc(loaded);

        // Auto-save mode: ?auto=1 → บันทึกลง Drive อัตโนมัติ + postMessage กลับ parent
        await runAutoSaveIfRequested({
          selector: ".wth-doc",
          pdfBlob: loaded.blob,
          paymentId,
          docType: "wht-cert",
          docDate: loaded.docDate,
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
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "สร้างเอกสารไม่สำเร็จ";
        setLoadError(msg);
        // auto mode: แจ้ง parent ว่าไม่สำเร็จ (ไม่งั้น parent จะรอจน timeout)
        if (isAuto && window.parent !== window) {
          try {
            window.parent.postMessage(
              { type: "doc-gen-result", success: false, error: msg },
              window.location.origin
            );
          } catch {
            /* ignore */
          }
        }
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // พิมพ์ PDF ตัวจริง (ไม่ใช่ภาพหน้าจอ) — ถ้า browser ไม่ยอมให้สั่งพิมพ์ใน iframe ให้เปิดแท็บใหม่
  const handlePrint = () => {
    try {
      const w = frameRef.current?.contentWindow;
      if (!w) throw new Error("no frame");
      w.focus();
      w.print();
    } catch {
      if (doc) window.open(doc.url, "_blank", "noopener");
    }
  };

  const handleSavePdf = async () => {
    if (!doc) return;
    setSaveState("saving");
    setSaveError("");
    try {
      const result = await saveDocumentPdf({
        selector: ".wth-doc",
        pdfBlob: doc.blob,
        paymentId,
        docType: "wht-cert",
        docDate: doc.docDate,
      });
      setSavedUrl(result.fileUrl);
      setSaveState("saved");
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
      setSaveState("error");
    }
  };

  return (
    <div className="wth-view">
      <div className="wth-bar">
        <div className="wth-bar-title">
          <strong>หนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ)</strong>
          <span>{doc?.docNumber ? `เลขที่ ${doc.docNumber}` : loadError ? "" : "กำลังสร้างเอกสาร…"}</span>
        </div>
        <div className="wth-bar-actions">
          <button onClick={() => window.history.back()} className="app-btn app-btn-secondary">
            ← กลับ
          </button>
          <button onClick={handlePrint} disabled={!doc} className="app-btn app-btn-secondary">
            🖨️ พิมพ์
          </button>
          {doc && (
            <a href={doc.url} download={doc.filename} className="app-btn app-btn-secondary">
              ⬇️ ดาวน์โหลด PDF
            </a>
          )}
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
              disabled={saveState === "saving" || !doc}
              className="app-btn app-btn-primary"
            >
              {saveState === "saving" ? "⏳ กำลังบันทึก..." : "💾 บันทึก PDF ลง Drive"}
            </button>
          )}
        </div>
      </div>
      {saveError && <div className="wth-error">⚠️ {saveError}</div>}

      {loadError ? (
        <div className="wth-doc wth-msg">
          <p>⚠️ {loadError}</p>
          <a href="/expenses">← กลับไปหน้าบันทึกค่าใช้จ่าย</a>
        </div>
      ) : doc ? (
        <iframe ref={frameRef} src={doc.url} title="หนังสือรับรองหัก ณ ที่จ่าย" className="wth-doc" />
      ) : (
        <div className="wth-doc wth-msg">
          <p>กำลังสร้างเอกสาร…</p>
        </div>
      )}

      {doc && (
        <p className="wth-fallback">
          ถ้าเอกสารไม่แสดง{" "}
          <a href={doc.url} target="_blank" rel="noopener noreferrer">
            เปิด PDF ในแท็บใหม่
          </a>
        </p>
      )}

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
        .wth-msg {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          color: #334155;
          font-size: 0.9375rem;
          text-align: center;
          padding: 2rem;
        }
        .wth-msg a {
          color: #2563eb;
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
