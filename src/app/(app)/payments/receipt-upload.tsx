"use client";

import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc/client";

interface ExtractedReceipt {
  vendorName: string | null;
  invoiceNumber: string | null; // ใช้เป็น receiptNumber
  documentDate: string | null;
  totalAmount: number | null;
  vatAmount: number | null;
  hasVat: boolean;
  confidence: number;
}

export function ReceiptUploadButton({
  paymentId,
  invoiceNumber,
  paymentAmount,
  onSuccess,
}: {
  paymentId: string;
  invoiceNumber?: string;
  paymentAmount?: number; // ยอดรายการที่จ่าย — ใช้ verify ตรงกับ receipt
  onSuccess?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="app-btn app-btn-ghost app-btn-sm"
        onClick={() => setOpen(true)}
        title="อัปโหลดใบเสร็จ"
        style={{ color: "#16a34a" }}
      >
        🧾
      </button>
      {open && (
        <ReceiptReviewModal
          paymentId={paymentId}
          invoiceNumber={invoiceNumber}
          paymentAmount={paymentAmount}
          onClose={() => setOpen(false)}
          onSuccess={() => {
            setOpen(false);
            onSuccess?.();
          }}
        />
      )}
    </>
  );
}

export function ReceiptReviewModal({
  paymentId,
  invoiceNumber,
  paymentAmount,
  onClose,
  onSuccess,
}: {
  paymentId: string;
  invoiceNumber?: string;
  paymentAmount?: number;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const recordMut = trpc.payment.recordReceipt.useMutation();

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [ocrStatus, setOcrStatus] = useState<"idle" | "processing" | "done" | "failed">("idle");
  const [extracted, setExtracted] = useState<ExtractedReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Form fields (editable after OCR)
  const [receiptNumber, setReceiptNumber] = useState("");
  const [receiptDate, setReceiptDate] = useState("");

  // Preview URL lifecycle
  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const validateFile = (f: File): string | null => {
    const allowed = ["image/jpeg", "image/png", "application/pdf"];
    if (!allowed.includes(f.type)) return "รองรับเฉพาะ jpg, png, pdf";
    if (f.size > 10 * 1024 * 1024) return "ไฟล์ใหญ่เกิน 10 MB";
    return null;
  };

  const handleFileSelect = async (f: File) => {
    setError(null);
    const err = validateFile(f);
    if (err) {
      setError(err);
      return;
    }
    setFile(f);
    await runOcr(f);
  };

  const runOcr = async (f: File) => {
    setOcrStatus("processing");
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("documentType", "receipt");
      const res = await fetch("/api/ocr/receipt", { method: "POST", body: fd });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `OCR ล้มเหลว (HTTP ${res.status})`);
      }
      const result = await res.json();
      const data = result.data as ExtractedReceipt;
      setExtracted(data);
      // Pre-fill form
      setReceiptNumber(data.invoiceNumber || invoiceNumber || "");
      setReceiptDate(data.documentDate || new Date().toISOString().slice(0, 10));
      setOcrStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "OCR ล้มเหลว — กรอกข้อมูลด้วยตนเอง");
      setOcrStatus("failed");
      // Allow manual entry even if OCR fails
      setReceiptNumber(invoiceNumber || "");
      setReceiptDate(new Date().toISOString().slice(0, 10));
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFileSelect(f);
  };

  const handleSave = async () => {
    setError(null);
    if (!file) {
      setError("กรุณาเลือกไฟล์ใบเสร็จ");
      return;
    }
    if (!receiptDate) {
      setError("กรุณากรอกวันที่ใบเสร็จ");
      return;
    }
    setSaving(true);
    try {
      // Step 1: Upload file → ได้ URL
      const formData = new FormData();
      formData.append("file", file);
      formData.append("paymentId", paymentId);
      formData.append("fileType", "receipt");
      if (receiptNumber) formData.append("invoiceNumber", receiptNumber);
      // ส่ง receiptDate → backend จัด folder Year/Month ตามวันที่ใบเสร็จ
      if (receiptDate) formData.append("receiptDate", receiptDate);

      const upRes = await fetch("/api/payments/upload", { method: "POST", body: formData });
      if (!upRes.ok) {
        const data = await upRes.json().catch(() => ({}));
        throw new Error(data.error || "อัปโหลดไฟล์ไม่สำเร็จ");
      }
      const upData = await upRes.json();
      const receiptUrl: string = upData.url || upData.fileUrl || "";

      // Step 2: Record metadata
      await recordMut.mutateAsync({
        paymentId,
        receiptUrl,
        receiptNumber: receiptNumber.trim() || undefined,
        receiptDate,
      });

      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  // Amount mismatch warning
  const amountMismatch =
    extracted?.totalAmount != null &&
    paymentAmount != null &&
    Math.abs(extracted.totalAmount - paymentAmount) > 1;

  return (
    <div
      className="app-modal-backdrop"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="app-modal modal-xl">
        <div className="app-modal-header">
          <h3 className="app-modal-title">🧾 อัปโหลดใบเสร็จ / ใบกำกับภาษี</h3>
          <button onClick={onClose} className="app-btn app-btn-ghost app-btn-icon">
            ✕
          </button>
        </div>
        <div className="app-modal-body">
          {error && <div className="app-error-msg">{error}</div>}

          <div style={{ display: "grid", gridTemplateColumns: file ? "1fr 1fr" : "1fr", gap: "1rem" }}>
            {/* Left: File drop / preview */}
            <div>
              {!file ? (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => inputRef.current?.click()}
                  style={{
                    border: isDragging ? "2px solid #16a34a" : "2px dashed #cbd5e1",
                    borderRadius: 12,
                    padding: "3rem 1rem",
                    textAlign: "center",
                    background: isDragging ? "#f0fdf4" : "#f8fafc",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>🧾</div>
                  <p style={{ fontWeight: 600, margin: 0 }}>
                    แนบใบเสร็จ — ระบบอ่านให้อัตโนมัติ
                  </p>
                  <p style={{ fontSize: "0.8125rem", color: "#64748b", marginTop: "0.25rem" }}>
                    ลากวางหรือคลิก • jpg, png, pdf (สูงสุด 10 MB)
                  </p>
                </div>
              ) : (
                <div>
                  {previewUrl && file.type === "application/pdf" ? (
                    <iframe src={previewUrl} style={{ width: "100%", height: 400, border: "1px solid #e2e8f0", borderRadius: 8 }} />
                  ) : previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={previewUrl} alt="" style={{ width: "100%", maxHeight: 400, objectFit: "contain", border: "1px solid #e2e8f0", borderRadius: 8 }} />
                  ) : null}
                  <button
                    onClick={() => {
                      setFile(null);
                      setExtracted(null);
                      setOcrStatus("idle");
                    }}
                    className="app-btn app-btn-ghost app-btn-sm"
                    style={{ marginTop: "0.5rem", color: "#dc2626" }}
                  >
                    ✕ เลือกไฟล์ใหม่
                  </button>
                </div>
              )}
              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,application/pdf"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileSelect(f);
                  e.target.value = "";
                }}
                style={{ display: "none" }}
              />
            </div>

            {/* Right: OCR result + form */}
            {file && (
              <div>
                {ocrStatus === "processing" && (
                  <div
                    style={{
                      padding: "1rem",
                      background: "#eff6ff",
                      border: "1px solid #bfdbfe",
                      borderRadius: 8,
                      color: "#1e3a8a",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                    }}
                  >
                    <span className="app-spinner" /> ระบบกำลังอ่านใบเสร็จ... (5-15 วินาที)
                  </div>
                )}

                {ocrStatus === "done" && extracted && (
                  <div
                    style={{
                      padding: "0.75rem",
                      background: "#f0fdf4",
                      border: "1px solid #bbf7d0",
                      borderRadius: 8,
                      fontSize: "0.8125rem",
                      color: "#166534",
                      marginBottom: "0.75rem",
                    }}
                  >
                    ✅ ระบบอ่านเสร็จแล้ว
                  </div>
                )}

                {amountMismatch && (
                  <div
                    style={{
                      padding: "0.75rem",
                      background: "#fef2f2",
                      border: "1px solid #fecaca",
                      borderRadius: 8,
                      fontSize: "0.8125rem",
                      color: "#991b1b",
                      marginBottom: "0.75rem",
                    }}
                  >
                    ⚠️ ยอดในใบเสร็จ (฿{formatNumber(extracted!.totalAmount!)}) <b>ไม่ตรง</b> กับยอดที่จ่าย (฿{formatNumber(paymentAmount!)}) — โปรดตรวจสอบ
                  </div>
                )}

                {/* Form */}
                <div className="app-form-group">
                  <label className="app-label app-label-required">เลขที่ใบเสร็จ / ใบกำกับภาษี</label>
                  <input
                    type="text"
                    value={receiptNumber}
                    onChange={(e) => setReceiptNumber(e.target.value)}
                    placeholder="เช่น TX-2026-0001"
                    className="app-input"
                    maxLength={50}
                  />
                </div>
                <div className="app-form-group">
                  <label className="app-label app-label-required">วันที่ออกใบเสร็จ</label>
                  <input
                    type="date"
                    value={receiptDate}
                    onChange={(e) => setReceiptDate(e.target.value)}
                    className="app-input"
                  />
                </div>

                {/* Read-only OCR insights */}
                {extracted && (
                  <details style={{ marginTop: "0.5rem" }}>
                    <summary style={{ fontSize: "0.8125rem", color: "#64748b", cursor: "pointer" }}>
                      🔍 ดูข้อมูลที่ระบบอ่านได้
                    </summary>
                    <div style={{ background: "#f8fafc", padding: "0.625rem", borderRadius: 6, marginTop: "0.5rem", fontSize: "0.75rem" }}>
                      <Row k="ชื่อผู้รับเงิน" v={extracted.vendorName || "-"} />
                      <Row k="ยอดรวม" v={extracted.totalAmount != null ? `฿${formatNumber(extracted.totalAmount)}` : "-"} />
                      <Row k="VAT" v={extracted.hasVat ? `฿${formatNumber(extracted.vatAmount || 0)}` : "ไม่มี"} />
                    </div>
                  </details>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="app-modal-footer">
          <button onClick={onClose} className="app-btn app-btn-secondary" disabled={saving}>
            ยกเลิก
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !file || ocrStatus === "processing" || !receiptNumber.trim() || !receiptDate}
            className="app-btn app-btn-primary"
            style={{ background: "#16a34a", borderColor: "#16a34a" }}
          >
            {saving ? (
              <>
                <span className="app-spinner" /> กำลังบันทึก...
              </>
            ) : (
              "💾 บันทึกใบเสร็จ"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "0.125rem 0" }}>
      <span style={{ color: "#64748b" }}>{k}</span>
      <b>{v}</b>
    </div>
  );
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n || 0);
}
