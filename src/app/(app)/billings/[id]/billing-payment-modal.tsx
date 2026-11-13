"use client";

// ===========================================
// บันทึกรับเงินของใบวางบิล — ใช้กับใบที่ "ออกใบกำกับภาษีไม่ได้" (กิจการไม่จด VAT
// หรือใบวางบิลที่ไม่มี VAT) ซึ่งต้องไปต่อทางใบเสร็จรับเงิน
// (ใบที่มี VAT บันทึกรับเงินที่หน้าใบกำกับภาษีเหมือนเดิม — S25B)
//
// แยกยอดให้เห็นชัดแบบ FlowAccount:
//   เงินที่ได้รับจริง + หัก ณ ที่จ่าย + รายการปรับลด = ยอดที่ตัดหนี้
//   ยอดเงินขาด/เกิน = ยอดตัดหนี้ − ยอดที่ต้องชำระ (ขาด → "รับบางส่วน", เกิน → บันทึกไม่ได้)
// ยอดที่ส่งให้ billing.recordPayment = ยอดตัดหนี้ (นิยามเดียวกับ "รับแล้ว / คงค้าง" = GrandTotal)
// ===========================================

import { useState } from "react";
import { todayBangkok } from "@/lib/utils/date";
import { trpc } from "@/lib/trpc/client";
import DateInput from "@/components/shared/date-input";

const round2 = (n: number) => Math.round(n * 100) / 100;
const formatTHB = (n: number) =>
  n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const toNum = (s: string) => round2(parseFloat(s) || 0);

const PAYMENT_METHODS = [
  { value: "transfer", label: "เงินโอน" },
  { value: "cash", label: "เงินสด" },
  { value: "cheque", label: "เช็ค" },
] as const;
type Method = (typeof PAYMENT_METHODS)[number]["value"];

const ADJUSTMENT_TYPES = ["ส่วนลดพิเศษ", "ค่าธรรมเนียมธนาคาร", "ปัดเศษ", "อื่น ๆ"] as const;
const WHT_OPTIONS = [1, 2, 3, 5];

export function RecordBillingPaymentModal({
  billingId,
  docNumber,
  customerName,
  subtotal,
  balance,
  paidAmount,
  whtPercent: billingWhtPercent,
  existingWhtCertUrl,
  onClose,
  onSuccess,
}: {
  billingId: string;
  docNumber: string;
  customerName: string;
  /** ฐานภาษีหัก ณ ที่จ่าย (ยอดก่อน VAT หลังส่วนลด) */
  subtotal: number;
  /** ยอดคงค้าง (GrandTotal − รับแล้ว) */
  balance: number;
  paidAmount: number;
  /** % หัก ณ ที่จ่ายที่ระบุไว้ในใบวางบิล (0 = ไม่มี) */
  whtPercent: number;
  /** ใบ 50 ทวิ ที่เคยแนบไว้แล้ว (ถ้ามี) */
  existingWhtCertUrl?: string;
  onClose: () => void;
  onSuccess: (newStatus: string) => void;
}) {
  const recordMut = trpc.billing.recordPayment.useMutation();
  const today = todayBangkok();
  const due = round2(balance);
  const whtFor = (p: number) => round2((subtotal * p) / 100);

  // ค่าเริ่มต้น: ใบที่ระบุ WHT ไว้และยังไม่เคยรับเงิน → ติ๊กหัก ณ ที่จ่ายให้เลย
  const initialHasWht = billingWhtPercent > 0 && paidAmount === 0;
  const initialPercent = billingWhtPercent > 0 ? billingWhtPercent : 3;
  const initialWht = initialHasWht ? whtFor(initialPercent) : 0;

  const [paidDate, setPaidDate] = useState(today);
  const [paymentMethod, setPaymentMethod] = useState<Method>("transfer");
  const [cash, setCash] = useState(String(round2(due - initialWht)));

  const [hasWht, setHasWht] = useState(initialHasWht);
  const [whtPercent, setWhtPercent] = useState(initialPercent);
  const [whtAmount, setWhtAmount] = useState(String(whtFor(initialPercent)));

  const [hasAdj, setHasAdj] = useState(false);
  const [adjType, setAdjType] = useState<(typeof ADJUSTMENT_TYPES)[number]>("ส่วนลดพิเศษ");
  const [adjAmount, setAdjAmount] = useState("0");

  const [notes, setNotes] = useState("");
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [whtFile, setWhtFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState<"" | "evidence" | "whtCert">("");
  const [error, setError] = useState<string | null>(null);

  /** อัปโหลดไฟล์ไป Drive ของธุรกิจ (route เดิม /api/billings/upload) — คืน false ถ้าไม่สำเร็จ */
  const uploadOne = async (file: File, fileType: "evidence" | "whtCert"): Promise<boolean> => {
    setUploading(fileType);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("billingId", billingId);
      fd.append("fileType", fileType);
      fd.append("paidDate", paidDate);
      const res = await fetch("/api/billings/upload", { method: "POST", body: fd });
      const json = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok || !json.success) throw new Error(json.error || "อัปโหลดไม่สำเร็จ");
      return true;
    } catch (e) {
      setError(
        `อัปโหลด${fileType === "evidence" ? "หลักฐานการโอน" : "ใบหัก ณ ที่จ่าย (50 ทวิ)"}ไม่สำเร็จ: ${
          e instanceof Error ? e.message : ""
        } — ยังไม่ได้บันทึกรับเงิน`,
      );
      return false;
    } finally {
      setUploading("");
    }
  };

  const cashNum = toNum(cash);
  const whtNum = hasWht ? toNum(whtAmount) : 0;
  const adjNum = hasAdj ? toNum(adjAmount) : 0;
  const settled = round2(cashNum + whtNum + adjNum); // ยอดที่ตัดหนี้
  const diff = round2(settled - due); // < 0 ขาด · > 0 เกิน

  /** เปลี่ยนส่วนหัก/ปรับ → ให้เงินที่ได้รับจริงเท่ากับยอดที่เหลือ (ช่วยกรอก) */
  const refillCash = (wht: number, adj: number) => setCash(String(Math.max(0, round2(due - wht - adj))));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!paidDate) return setError("กรุณาเลือกวันที่รับชำระ");
    if (cashNum < 0 || whtNum < 0 || adjNum < 0) return setError("จำนวนเงินต้องไม่ติดลบ");
    if (settled <= 0) return setError("กรุณากรอกจำนวนเงินที่ได้รับ");
    if (diff > 0) return setError(`ยอดเกินยอดที่ต้องชำระ ${formatTHB(diff)} บาท — ตรวจจำนวนเงินอีกครั้ง`);
    // แนบไฟล์ก่อน — อัปโหลดไม่ผ่านจะยังไม่บันทึกรับเงิน (ผู้ใช้แก้แล้วกดใหม่ได้)
    if (evidenceFile) {
      if (!(await uploadOne(evidenceFile, "evidence"))) return;
      setEvidenceFile(null);
    }
    if (hasWht && whtFile) {
      if (!(await uploadOne(whtFile, "whtCert"))) return;
      setWhtFile(null);
    }
    try {
      const res = await recordMut.mutateAsync({
        billingId,
        amount: settled,
        paidDate,
        paymentMethod,
        notes: notes.trim() || undefined,
        breakdown: {
          cashReceived: cashNum,
          whtPercent: hasWht ? whtPercent : 0,
          whtAmount: whtNum,
          adjustmentType: hasAdj ? adjType : undefined,
          adjustmentAmount: adjNum,
        },
      });
      onSuccess(res.newStatus);
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    }
  };

  const isLoading = recordMut.isPending || uploading !== "";
  const row: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "minmax(120px, 34%) 1fr",
    alignItems: "center",
    gap: "0.5rem 0.75rem",
    marginBottom: "0.75rem",
  };
  const labelStyle: React.CSSProperties = { fontWeight: 600, fontSize: "0.875rem", color: "#334155" };
  const checkLabel: React.CSSProperties = { ...labelStyle, display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" };
  const pair: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" };

  return (
    <div
      className="app-modal-backdrop"
      onClick={(e) => e.target === e.currentTarget && !isLoading && onClose()}
    >
      <div className="app-modal" style={{ maxWidth: "600px" }}>
        <form onSubmit={handleSubmit}>
          <div className="app-modal-header">
            <h3 className="app-modal-title">💰 บันทึกรับเงิน</h3>
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
            {error && <div className="app-error-msg">{error}</div>}

            <div style={row}>
              <span style={labelStyle}>เลขที่เอกสาร</span>
              <span>
                <strong className="mono">{docNumber}</strong>
                {customerName && <span style={{ color: "#475569" }}> ({customerName})</span>}
              </span>
            </div>
            <div style={row}>
              <span style={labelStyle}>{paidAmount > 0 ? "ยอดคงค้าง" : "ยอดที่ต้องชำระ"}</span>
              <span className="num" style={{ fontWeight: 700, fontSize: "1.0625rem" }}>
                {formatTHB(due)} บาท
              </span>
            </div>

            <div style={{ borderTop: "1px solid #e2e8f0", margin: "0.25rem 0 0.875rem" }} />

            <div style={row}>
              <span style={labelStyle}>
                วันที่รับชำระ{" "}
                <span style={{ fontWeight: 400, fontSize: "0.75rem", color: "#64748b", display: "block" }}>
                  วันที่เงินเข้าจริง — ใบเสร็จจะลงวันที่นี้
                </span>
              </span>
              <DateInput value={paidDate} onChange={(v) => setPaidDate(v)} max={today} className="app-input" />
            </div>

            <div style={row}>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as Method)}
                className="app-select"
                aria-label="วิธีรับเงิน"
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={cash}
                onChange={(e) => setCash(e.target.value)}
                className="app-input num"
                aria-label="จำนวนเงินที่ได้รับจริง"
                style={{ textAlign: "right" }}
              />
            </div>

            <div style={row}>
              <span style={labelStyle}>
                ยอดรับสุทธิ{" "}
                <span style={{ fontWeight: 400, fontSize: "0.75rem", color: "#64748b" }}>(เงินที่ได้รับจริง)</span>
              </span>
              <span className="num" style={{ textAlign: "right", fontWeight: 700, fontSize: "1.0625rem" }}>
                {formatTHB(cashNum)}
              </span>
            </div>

            <div style={row}>
              <label style={checkLabel}>
                <input
                  type="checkbox"
                  checked={hasAdj}
                  onChange={(e) => {
                    setHasAdj(e.target.checked);
                    refillCash(whtNum, e.target.checked ? toNum(adjAmount) : 0);
                  }}
                />
                รายการปรับลด
              </label>
              <div style={pair}>
                <select
                  value={adjType}
                  onChange={(e) => setAdjType(e.target.value as (typeof ADJUSTMENT_TYPES)[number])}
                  disabled={!hasAdj}
                  className="app-select"
                  aria-label="ประเภทรายการปรับลด"
                >
                  {ADJUSTMENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={adjAmount}
                  onChange={(e) => {
                    setAdjAmount(e.target.value);
                    refillCash(whtNum, toNum(e.target.value));
                  }}
                  disabled={!hasAdj}
                  className="app-input num"
                  aria-label="จำนวนเงินปรับลด"
                  style={{ textAlign: "right" }}
                />
              </div>
            </div>

            <div style={row}>
              <label style={checkLabel}>
                <input
                  type="checkbox"
                  checked={hasWht}
                  onChange={(e) => {
                    setHasWht(e.target.checked);
                    refillCash(e.target.checked ? toNum(whtAmount) : 0, adjNum);
                  }}
                />
                หัก ณ ที่จ่าย
              </label>
              <div style={pair}>
                <select
                  value={whtPercent}
                  onChange={(e) => {
                    const p = parseFloat(e.target.value);
                    setWhtPercent(p);
                    setWhtAmount(String(whtFor(p)));
                    refillCash(whtFor(p), adjNum);
                  }}
                  disabled={!hasWht}
                  className="app-select"
                  aria-label="อัตราหัก ณ ที่จ่าย"
                >
                  {WHT_OPTIONS.map((p) => (
                    <option key={p} value={p}>
                      {p}%
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={whtAmount}
                  onChange={(e) => {
                    setWhtAmount(e.target.value);
                    refillCash(toNum(e.target.value), adjNum);
                  }}
                  disabled={!hasWht}
                  className="app-input num"
                  aria-label="จำนวนเงินหัก ณ ที่จ่าย"
                  style={{ textAlign: "right" }}
                />
              </div>
            </div>

            <div
              style={{
                ...row,
                padding: "0.625rem 0.75rem",
                borderRadius: "0.5rem",
                background: diff === 0 ? "#f0fdf4" : diff < 0 ? "#fff7ed" : "#fef2f2",
                border: `1px solid ${diff === 0 ? "#bbf7d0" : diff < 0 ? "#fed7aa" : "#fecaca"}`,
              }}
            >
              <span style={labelStyle}>ยอดเงินขาด / เงินเกิน</span>
              <span style={{ textAlign: "right" }}>
                <span
                  className="num"
                  style={{
                    fontWeight: 700,
                    color: diff === 0 ? "#166534" : diff < 0 ? "#c2410c" : "#b91c1c",
                  }}
                >
                  {diff === 0 ? "0.00" : `${diff < 0 ? "ขาด" : "เกิน"} ${formatTHB(Math.abs(diff))}`} บาท
                </span>
                <span style={{ display: "block", fontSize: "0.75rem", color: "#64748b" }}>
                  {diff === 0
                    ? "รับครบ → สถานะ “ชำระครบ” แล้วออกใบเสร็จรับเงินได้"
                    : diff < 0
                      ? "รับไม่ครบ → สถานะ “รับบางส่วน” ส่วนที่ขาดยังคงค้าง"
                      : "ยอดรวมเกินยอดที่ต้องชำระ — บันทึกไม่ได้"}
                </span>
              </span>
            </div>

            <div
              style={{
                fontSize: "0.75rem",
                color: "#64748b",
                margin: "-0.25rem 0 0.875rem",
                textAlign: "right",
              }}
              className="num"
            >
              ตัดหนี้ {formatTHB(settled)} = รับจริง {formatTHB(cashNum)}
              {hasWht ? ` + หัก ณ ที่จ่าย ${formatTHB(whtNum)}` : ""}
              {hasAdj ? ` + ${adjType} ${formatTHB(adjNum)}` : ""}
            </div>

            <div style={row}>
              <span style={labelStyle}>
                หลักฐานการโอน{" "}
                <span style={{ fontWeight: 400, fontSize: "0.75rem", color: "#64748b" }}>(ไม่บังคับ)</span>
              </span>
              <FilePick file={evidenceFile} onChange={setEvidenceFile} label="หลักฐานการโอน" />
            </div>

            {hasWht && (
              <div style={row}>
                <span style={labelStyle}>
                  ใบหัก ณ ที่จ่าย (50 ทวิ){" "}
                  <span style={{ fontWeight: 400, fontSize: "0.75rem", color: "#64748b" }}>(แนบทีหลังได้)</span>
                </span>
                <div>
                  {existingWhtCertUrl && !whtFile && (
                    <a
                      href={existingWhtCertUrl.split("\n").pop()}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ display: "block", fontSize: "0.8125rem", color: "#0369a1", marginBottom: "0.25rem" }}
                    >
                      📎 มีไฟล์แนบแล้ว — ดูไฟล์ (เลือกไฟล์ใหม่เพื่อแทนที่)
                    </a>
                  )}
                  <FilePick file={whtFile} onChange={setWhtFile} label="ใบหัก ณ ที่จ่าย (50 ทวิ)" />
                </div>
              </div>
            )}

            <div style={{ ...row, alignItems: "start", marginBottom: 0 }}>
              <span style={{ ...labelStyle, paddingTop: "0.5rem" }}>หมายเหตุ</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={500}
                rows={3}
                className="app-input"
                placeholder="(ไม่บังคับ)"
              />
            </div>
          </div>

          <div className="app-modal-footer">
            <button type="button" onClick={onClose} disabled={isLoading} className="app-btn app-btn-secondary">
              ยกเลิก
            </button>
            <button type="submit" disabled={isLoading || diff > 0} className="app-btn app-btn-primary">
              {isLoading ? (
                <>
                  <span className="app-spinner" />{" "}
                  {uploading === "evidence"
                    ? "กำลังอัปโหลดหลักฐาน..."
                    : uploading === "whtCert"
                      ? "กำลังอัปโหลด 50 ทวิ..."
                      : "กำลังบันทึก..."}
                </>
              ) : (
                "บันทึก"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** เลือกไฟล์รูป/PDF 1 ไฟล์ (ตรวจชนิด/ขนาดจริงที่ฝั่งเซิร์ฟเวอร์ใน /api/billings/upload) */
function FilePick({
  file,
  onChange,
  label,
}: {
  file: File | null;
  onChange: (f: File | null) => void;
  label: string;
}) {
  return (
    <div>
      <input
        type="file"
        accept="image/*,application/pdf"
        onChange={(e) => onChange(e.target.files?.[0] || null)}
        className="app-input"
        aria-label={label}
      />
      {file && (
        <p style={{ fontSize: "0.75rem", color: "#475569", margin: "0.25rem 0 0" }}>
          📎 {file.name} ({Math.max(1, Math.round(file.size / 1024)).toLocaleString()} KB) — อัปโหลดตอนกดบันทึก
        </p>
      )}
    </div>
  );
}
