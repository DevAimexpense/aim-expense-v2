"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc/client";

const round2 = (n: number) => Math.round(n * 100) / 100;

const formatTHB = (n: number) =>
  n.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const todayISO = () => new Date().toISOString().slice(0, 10);

const PAYMENT_METHODS: { value: "cash" | "transfer" | "cheque"; label: string }[] = [
  { value: "cash", label: "เงินสด" },
  { value: "transfer", label: "เงินโอน" },
  { value: "cheque", label: "เช็ค" },
];

const WHT_OPTIONS = [1, 3, 5];

export function RecordTaxInvoicePaymentModal({
  taxInvoiceId,
  docNumber,
  subtotal,
  grandTotal,
  initial,
  onClose,
  onSuccess,
}: {
  taxInvoiceId: string;
  docNumber: string;
  subtotal: number;
  grandTotal: number;
  initial?: {
    paidDate: string;
    paymentMethod: "cash" | "transfer" | "cheque" | "";
    paidAmount: number;
    whtPercent: number;
    whtAmount: number;
    adjustmentAmount: number;
    adjustmentNote: string;
    paymentEvidenceUrl: string;
    whtCertUrl: string;
  };
  onClose: () => void;
  onSuccess: () => void;
}) {
  const recordMut = trpc.taxInvoice.recordPayment.useMutation();

  const [paidDate, setPaidDate] = useState(initial?.paidDate || todayISO());
  const [paymentMethod, setPaymentMethod] = useState<
    "cash" | "transfer" | "cheque"
  >(initial?.paymentMethod ? initial.paymentMethod : "transfer");

  // WHT
  const [hasWHT, setHasWHT] = useState((initial?.whtPercent ?? 0) > 0);
  const [whtPercent, setWhtPercent] = useState<number>(
    initial?.whtPercent || 3,
  );

  // Adjustment
  const [hasAdjustment, setHasAdjustment] = useState(
    (initial?.adjustmentAmount ?? 0) !== 0,
  );
  const [adjustmentSign, setAdjustmentSign] = useState<"+" | "-">(
    (initial?.adjustmentAmount ?? 0) >= 0 ? "+" : "-",
  );
  const [adjustmentAmount, setAdjustmentAmount] = useState<number>(
    Math.abs(initial?.adjustmentAmount || 0),
  );
  const [adjustmentNote, setAdjustmentNote] = useState(
    initial?.adjustmentNote || "",
  );

  // Computed values
  const whtAmount = useMemo(
    () => (hasWHT ? round2((subtotal * whtPercent) / 100) : 0),
    [hasWHT, subtotal, whtPercent],
  );
  const adjustmentSigned = useMemo(
    () =>
      hasAdjustment
        ? (adjustmentSign === "+" ? 1 : -1) * (adjustmentAmount || 0)
        : 0,
    [hasAdjustment, adjustmentSign, adjustmentAmount],
  );
  const computedNet = useMemo(
    () => round2(grandTotal - whtAmount + adjustmentSigned),
    [grandTotal, whtAmount, adjustmentSigned],
  );

  // Net (user-editable). Initial = previously-saved paid amount or formula default.
  const [netReceived, setNetReceived] = useState<number>(
    initial?.paidAmount || computedNet,
  );
  const [netDirty, setNetDirty] = useState(false);

  // Auto-update net when computed changes (unless user has manually edited).
  // Effect, not render-side write, so React doesn't re-render in a loop.
  useEffect(() => {
    if (!netDirty) {
      setNetReceived(computedNet);
    }
  }, [computedNet, netDirty]);

  // Files (uploaded URLs after successful upload)
  const [evidenceUrl, setEvidenceUrl] = useState(
    initial?.paymentEvidenceUrl || "",
  );
  const [whtCertUrl, setWhtCertUrl] = useState(initial?.whtCertUrl || "");
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [whtFile, setWhtFile] = useState<File | null>(null);
  const evidenceInputRef = useRef<HTMLInputElement>(null);
  const whtInputRef = useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = useState<"" | "evidence" | "whtCert">("");
  const [error, setError] = useState<string | null>(null);

  const uploadOne = async (
    file: File,
    fileType: "evidence" | "whtCert",
  ): Promise<string | null> => {
    setUploading(fileType);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("taxInvoiceId", taxInvoiceId);
      fd.append("fileType", fileType);
      fd.append("paidDate", paidDate);
      const res = await fetch("/api/tax-invoices/upload", {
        method: "POST",
        body: fd,
      });
      const json = (await res.json()) as
        | { success: true; fileUrl: string }
        | { error: string };
      if (!res.ok || !("success" in json)) {
        throw new Error(("error" in json && json.error) || "อัปโหลดไม่สำเร็จ");
      }
      return json.fileUrl;
    } catch (e) {
      setError(
        `อัปโหลด${fileType === "evidence" ? "หลักฐานการโอน" : "ใบหัก ณ ที่จ่าย"}ไม่สำเร็จ: ${e instanceof Error ? e.message : ""}`,
      );
      return null;
    } finally {
      setUploading("");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!paidDate) {
      setError("กรุณาเลือกวันที่รับชำระ");
      return;
    }
    if (netReceived < 0) {
      setError("ยอดรับสุทธิต้องไม่ติดลบ");
      return;
    }

    // Upload pending files first (before recordPayment writes URLs)
    let finalEvidenceUrl = evidenceUrl;
    let finalWhtUrl = whtCertUrl;
    if (evidenceFile) {
      const url = await uploadOne(evidenceFile, "evidence");
      if (!url) return; // error already set
      finalEvidenceUrl = url;
      setEvidenceUrl(url);
      setEvidenceFile(null);
    }
    if (hasWHT && whtFile) {
      const url = await uploadOne(whtFile, "whtCert");
      if (!url) return;
      finalWhtUrl = url;
      setWhtCertUrl(url);
      setWhtFile(null);
    }

    try {
      await recordMut.mutateAsync({
        taxInvoiceId,
        paidDate,
        paymentMethod,
        netReceived: round2(netReceived),
        whtPercent: hasWHT ? whtPercent : 0,
        whtAmount: hasWHT ? whtAmount : 0,
        adjustmentAmount: hasAdjustment ? adjustmentSigned : 0,
        adjustmentNote: hasAdjustment
          ? adjustmentNote.trim() || undefined
          : undefined,
        paymentEvidenceUrl: finalEvidenceUrl || undefined,
        whtCertUrl: finalWhtUrl || undefined,
      });
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    }
  };

  const isLoading = recordMut.isPending || uploading !== "";

  return (
    <div
      className="app-modal-backdrop"
      onClick={(e) => e.target === e.currentTarget && !isLoading && onClose()}
    >
      <div className="app-modal modal-lg" style={{ maxWidth: "640px" }}>
        <form onSubmit={handleSubmit}>
          <div className="app-modal-header">
            <h3 className="app-modal-title">💰 บันทึกการชำระเงิน</h3>
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="app-btn app-btn-ghost app-btn-icon"
              aria-label="ปิด"
            >
              ✕
            </button>
          </div>
          <div className="app-modal-body">
            {/* Header info — TI doc number + grand total */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: "#fef2f2",
                border: "1px solid #fecaca",
                borderRadius: "0.5rem",
                padding: "0.625rem 0.875rem",
                marginBottom: "1rem",
              }}
            >
              <div>
                <div style={{ fontSize: "0.75rem", color: "#7f1d1d" }}>
                  เลขใบกำกับภาษี
                </div>
                <div
                  className="mono"
                  style={{
                    fontSize: "1rem",
                    fontWeight: 700,
                    color: "#991b1b",
                  }}
                >
                  {docNumber}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "0.75rem", color: "#7f1d1d" }}>
                  ยอดรวม (incl. VAT)
                </div>
                <div
                  style={{
                    fontSize: "1.125rem",
                    fontWeight: 700,
                    color: "#991b1b",
                  }}
                  className="num"
                >
                  {formatTHB(grandTotal)}
                </div>
              </div>
            </div>

            {error && <div className="app-error-msg">{error}</div>}

            {/* 1. Date */}
            <div className="app-form-grid cols-2">
              <div className="app-form-group">
                <label className="app-label app-label-required">
                  วันที่รับชำระ
                </label>
                <input
                  type="date"
                  value={paidDate}
                  onChange={(e) => setPaidDate(e.target.value)}
                  max={todayISO()}
                  className="app-input"
                />
              </div>
              {/* 5. Payment method */}
              <div className="app-form-group">
                <label className="app-label app-label-required">
                  วิธีชำระเงิน
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) =>
                    setPaymentMethod(e.target.value as typeof paymentMethod)
                  }
                  className="app-select"
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* 2. WHT */}
            <div
              style={{
                marginTop: "0.75rem",
                padding: "0.75rem",
                border: "1px solid #e2e8f0",
                borderRadius: "0.5rem",
              }}
            >
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                <input
                  type="checkbox"
                  checked={hasWHT}
                  onChange={(e) => {
                    setHasWHT(e.target.checked);
                    setNetDirty(false);
                  }}
                />
                หักภาษี ณ ที่จ่าย (Withholding tax)
              </label>
              {hasWHT && (
                <div
                  className="app-form-grid cols-2"
                  style={{ marginTop: "0.625rem" }}
                >
                  <div className="app-form-group" style={{ marginBottom: 0 }}>
                    <label className="app-label">% หัก ณ ที่จ่าย</label>
                    <select
                      value={whtPercent}
                      onChange={(e) => {
                        setWhtPercent(parseFloat(e.target.value));
                        setNetDirty(false);
                      }}
                      className="app-select"
                    >
                      {WHT_OPTIONS.map((p) => (
                        <option key={p} value={p}>
                          {p}%
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="app-form-group" style={{ marginBottom: 0 }}>
                    <label className="app-label">ยอดหัก ณ ที่จ่าย (คำนวณ)</label>
                    <input
                      type="text"
                      value={formatTHB(whtAmount)}
                      readOnly
                      className="app-input num"
                      style={{ background: "#f8fafc", fontWeight: 600 }}
                    />
                    <p className="app-hint">
                      = ฐานภาษี ({formatTHB(subtotal)}) × {whtPercent}%
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* 3. Adjustment */}
            <div
              style={{
                marginTop: "0.75rem",
                padding: "0.75rem",
                border: "1px solid #e2e8f0",
                borderRadius: "0.5rem",
              }}
            >
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                <input
                  type="checkbox"
                  checked={hasAdjustment}
                  onChange={(e) => {
                    setHasAdjustment(e.target.checked);
                    setNetDirty(false);
                  }}
                />
                รายการปรับลด / เพิ่ม
              </label>
              {hasAdjustment && (
                <div style={{ marginTop: "0.625rem" }}>
                  <div
                    className="app-form-grid cols-2"
                    style={{ alignItems: "end" }}
                  >
                    <div className="app-form-group" style={{ marginBottom: 0 }}>
                      <label className="app-label">ประเภท + จำนวนเงิน (บาท)</label>
                      <div style={{ display: "flex", gap: "0.375rem" }}>
                        <select
                          value={adjustmentSign}
                          onChange={(e) => {
                            setAdjustmentSign(e.target.value as "+" | "-");
                            setNetDirty(false);
                          }}
                          className="app-select"
                          style={{ width: "100px" }}
                        >
                          <option value="-">ลด (−)</option>
                          <option value="+">เพิ่ม (+)</option>
                        </select>
                        <input
                          type="number"
                          value={adjustmentAmount}
                          onChange={(e) => {
                            setAdjustmentAmount(parseFloat(e.target.value) || 0);
                            setNetDirty(false);
                          }}
                          min={0}
                          step={0.01}
                          className="app-input num"
                          style={{ flex: 1 }}
                        />
                      </div>
                    </div>
                    <div className="app-form-group" style={{ marginBottom: 0 }}>
                      <label className="app-label">หมายเหตุ (optional)</label>
                      <input
                        type="text"
                        value={adjustmentNote}
                        onChange={(e) => setAdjustmentNote(e.target.value)}
                        maxLength={200}
                        className="app-input"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 4. Net received */}
            <div
              style={{
                marginTop: "0.75rem",
                padding: "0.75rem 0.875rem",
                background: "#f0fdf4",
                border: "1px solid #bbf7d0",
                borderRadius: "0.5rem",
              }}
            >
              <div
                className="app-form-grid cols-2"
                style={{ alignItems: "end" }}
              >
                <div className="app-form-group" style={{ marginBottom: 0 }}>
                  <label className="app-label app-label-required">
                    ยอดรับสุทธิ (บาท)
                  </label>
                  <input
                    type="number"
                    value={netReceived}
                    onChange={(e) => {
                      setNetReceived(parseFloat(e.target.value) || 0);
                      setNetDirty(true);
                    }}
                    min={0}
                    step={0.01}
                    className="app-input num"
                    style={{ fontWeight: 700, fontSize: "1.0625rem" }}
                  />
                </div>
                <div style={{ fontSize: "0.75rem", color: "#166534" }}>
                  <div style={{ fontWeight: 600, marginBottom: "0.25rem" }}>
                    คำนวณ default:
                  </div>
                  <div>ยอดรวม: {formatTHB(grandTotal)}</div>
                  {hasWHT && <div>− WHT: {formatTHB(whtAmount)}</div>}
                  {hasAdjustment && adjustmentAmount > 0 && (
                    <div>
                      {adjustmentSign === "+" ? "+" : "−"} ปรับ:{" "}
                      {formatTHB(adjustmentAmount)}
                    </div>
                  )}
                  <div style={{ fontWeight: 600, marginTop: "0.125rem" }}>
                    = {formatTHB(computedNet)}
                  </div>
                  {netDirty && Math.abs(netReceived - computedNet) > 0.01 && (
                    <button
                      type="button"
                      onClick={() => {
                        setNetReceived(computedNet);
                        setNetDirty(false);
                      }}
                      style={{
                        marginTop: "0.25rem",
                        fontSize: "0.6875rem",
                        background: "transparent",
                        border: "none",
                        color: "#2563eb",
                        textDecoration: "underline",
                        cursor: "pointer",
                        padding: 0,
                      }}
                    >
                      ↻ รีเซ็ตเป็นค่า default
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* 6. Payment evidence file */}
            <div className="app-form-group" style={{ marginTop: "0.75rem" }}>
              <label className="app-label">
                หลักฐานการโอน / รับเงิน (optional)
              </label>
              <FileSlot
                file={evidenceFile}
                onChange={setEvidenceFile}
                inputRef={evidenceInputRef}
                existingUrl={evidenceUrl}
                onClearExisting={() => setEvidenceUrl("")}
              />
            </div>

            {/* 7. WHT cert (only if WHT) */}
            {hasWHT && (
              <div className="app-form-group">
                <label className="app-label">
                  ใบหัก ณ ที่จ่าย (optional — เพิ่มทีหลังได้)
                </label>
                <FileSlot
                  file={whtFile}
                  onChange={setWhtFile}
                  inputRef={whtInputRef}
                  existingUrl={whtCertUrl}
                  onClearExisting={() => setWhtCertUrl("")}
                />
              </div>
            )}
          </div>
          <div className="app-modal-footer">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="app-btn app-btn-secondary"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="app-btn app-btn-primary"
            >
              {isLoading ? (
                <>
                  <span className="app-spinner" />{" "}
                  {uploading
                    ? `กำลังอัปโหลด${uploading === "evidence" ? "หลักฐาน" : "ใบหัก ณ จ่าย"}...`
                    : "กำลังบันทึก..."}
                </>
              ) : (
                "💾 บันทึกการชำระเงิน"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FileSlot({
  file,
  onChange,
  inputRef,
  existingUrl,
  onClearExisting,
}: {
  file: File | null;
  onChange: (f: File | null) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  existingUrl: string;
  onClearExisting: () => void;
}) {
  if (existingUrl) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0.5rem 0.625rem",
          background: "#f0f9ff",
          border: "1px solid #bae6fd",
          borderRadius: "0.375rem",
          fontSize: "0.8125rem",
        }}
      >
        <span>📎</span>
        <a
          href={existingUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "#0369a1", flex: 1 }}
        >
          ดูไฟล์ที่อัปโหลด →
        </a>
        <button
          type="button"
          onClick={onClearExisting}
          className="app-btn app-btn-ghost app-btn-sm"
          style={{ color: "#dc2626" }}
        >
          แทนที่
        </button>
      </div>
    );
  }
  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        onChange={(e) => onChange(e.target.files?.[0] || null)}
        className="app-input"
      />
      {file && (
        <p
          style={{
            fontSize: "0.75rem",
            color: "#475569",
            marginTop: "0.25rem",
          }}
        >
          📎 {file.name} ({Math.round(file.size / 1024)} KB)
        </p>
      )}
    </div>
  );
}
