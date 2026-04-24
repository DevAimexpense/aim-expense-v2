"use client";

import { useEffect, useState } from "react";
import { saveDocumentPdf, runAutoSaveIfRequested } from "@/lib/utils/save-doc-pdf";

interface Props {
  company: { name: string; taxId: string; address: string };
  requester: { name: string };
  payee: { name: string; taxId: string; address: string };
  payment: {
    paymentId: string;
    description: string;
    date: string;
    amount: number;
    eventName: string;
    notes: string;
  };
}

export function ReceiptVoucherDocument({ company, requester, payee, payment }: Props) {
  // ใช้ 8 หลักท้ายของ paymentId เป็นเลขที่เอกสาร (สั้น อ่านง่าย)
  const docNumber = payment.paymentId.slice(-8).toUpperCase();

  // Timestamp แสดงเฉพาะ client หลัง mount (ป้องกัน hydration mismatch)
  const [printedAt, setPrintedAt] = useState("");
  useEffect(() => {
    setPrintedAt(new Date().toLocaleString("th-TH"));
  }, []);

  // Save PDF to Drive
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [savedUrl, setSavedUrl] = useState("");
  const [saveError, setSaveError] = useState("");
  const handleSavePdf = async () => {
    setSaveState("saving");
    setSaveError("");
    try {
      const result = await saveDocumentPdf({
        selector: ".doc",
        paymentId: payment.paymentId,
        docType: "receipt-voucher",
        docDate: payment.date,
      });
      setSavedUrl(result.fileUrl);
      setSaveState("saved");
      return { success: true, fileUrl: result.fileUrl };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "บันทึกไม่สำเร็จ";
      setSaveError(msg);
      setSaveState("error");
      return { success: false, error: msg };
    }
  };

  // Auto-save mode: ?auto=1 → trigger save อัตโนมัติ (รอ fonts + DOM) + postMessage กลับ parent
  useEffect(() => {
    runAutoSaveIfRequested({
      selector: ".doc",
      paymentId: payment.paymentId,
      docType: "receipt-voucher",
      docDate: payment.date,
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
    <>
      <div
        className="no-print"
        style={{
          position: "fixed",
          top: "1rem",
          right: "1rem",
          display: "flex",
          gap: "0.5rem",
          zIndex: 10,
        }}
      >
        <button onClick={() => window.history.back()} className="app-btn app-btn-secondary">
          ← กลับ
        </button>
        <button onClick={() => window.print()} className="app-btn app-btn-secondary">
          🖨️ พิมพ์
        </button>
        {saveState === "saved" && savedUrl ? (
          <a href={savedUrl} target="_blank" rel="noopener noreferrer" className="app-btn" style={{ background: "#16a34a", color: "white" }}>
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
      {saveError && (
        <div className="no-print" style={{ position: "fixed", top: "4rem", right: "1rem", background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", padding: "0.5rem 0.875rem", borderRadius: "0.375rem", fontSize: "0.8125rem", zIndex: 10, maxWidth: "300px" }}>
          ⚠️ {saveError}
        </div>
      )}

      <div className="doc">
        {/* Title + top-right meta */}
        <div className="title-row">
          <div className="doc-title">ใบสำคัญรับเงิน</div>
          <div className="meta">
            <div className="meta-row">
              <span>เลขที่</span>
              <span className="ul mono">{docNumber}</span>
            </div>
            <div className="meta-row">
              <span>วันที่</span>
              <span className="ul">{formatThaiDate(payment.date)}</span>
            </div>
          </div>
        </div>

        {/* ผู้ขายสินค้า/ให้บริการ */}
        <div className="seller">
          <div className="row">
            <span className="label">ข้าพเจ้า</span>
            <span className="ul flex-fill">{payee.name || "—"}</span>
            <span className="suffix">(ผู้ขายสินค้า/ให้บริการ)</span>
          </div>
          <div className="row">
            <span className="label">เลขประจำตัวผู้เสียภาษี</span>
            <span className="ul mono">{formatTaxId(payee.taxId)}</span>
            <span className="label" style={{ marginLeft: "1rem" }}>อยู่ที่บ้านเลขที่</span>
            <span className="ul flex-fill">{payee.address || "—"}</span>
          </div>
          <div className="row">
            <span className="label">ได้รับเงินจาก</span>
            <span className="ul flex-fill">{company.name || "—"}</span>
            <span className="suffix">(ผู้ซื้อ/ผู้รับบริการ) ดังรายการต่อไปนี้</span>
          </div>
        </div>

        {/* Detail table */}
        <table className="doc-table">
          <thead>
            <tr>
              <th>รายการ</th>
              <th style={{ width: "22%" }} className="text-right">จำนวนเงิน</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <div>{payment.description || "ค่าใช้จ่าย"}</div>
                {payment.eventName && (
                  <div className="sub">โปรเจกต์: {payment.eventName}</div>
                )}
                {payment.notes && (
                  <div className="sub">หมายเหตุ: {payment.notes}</div>
                )}
              </td>
              <td className="text-right num">{formatMoney(payment.amount)}</td>
            </tr>
            {/* Empty rows เพื่อให้ตารางยาวตาม format */}
            {Array.from({ length: 13 }).map((_, i) => (
              <tr key={i} className="empty-row">
                <td>&nbsp;</td>
                <td>&nbsp;</td>
              </tr>
            ))}
            <tr className="total-row">
              <td className="baht-text">( {bahtText(payment.amount)} )</td>
              <td className="text-right num">
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>รวมเป็นเงิน (บาท)</span>
                  <strong>{formatMoney(payment.amount)}</strong>
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        {/* Signatures */}
        <div className="signatures">
          <div className="sig-col">
            <div className="sig-line">ลงชื่อ ...................................................</div>
            <div className="sig-label">ผู้รับเงิน</div>
          </div>
          <div className="sig-col">
            <div className="sig-line">ลงชื่อ ...................................................</div>
            <div className="sig-label">ผู้จ่ายเงิน</div>
          </div>
        </div>

        {/* หมายเหตุ */}
        <div className="note">หมายเหตุ : แนบสำเนาบัตรประจำตัวประชาชนผู้รับเงิน</div>

        <div className="doc-footer" suppressHydrationWarning>
          ออกโดย Aim Expense{printedAt ? ` • ${printedAt}` : ""} • Payment ID: {payment.paymentId}
        </div>
      </div>

      <style jsx>{`
        .doc {
          max-width: 210mm;
          margin: 2rem auto;
          background: white;
          padding: 2.5rem;
          box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
          font-family: "IBM Plex Sans Thai", "Sarabun", sans-serif;
          color: #0f172a;
          font-size: 0.875rem;
        }

        .title-row {
          display: grid;
          grid-template-columns: 1fr auto;
          align-items: start;
          margin-bottom: 1.5rem;
        }

        .doc-title {
          text-align: center;
          font-size: 1.5rem;
          font-weight: 700;
          padding-left: 6rem; /* ให้ text อยู่กลางโดยหักพื้นที่ meta */
        }

        .meta {
          display: grid;
          gap: 0.25rem;
          font-size: 0.875rem;
        }

        .meta-row {
          display: flex;
          gap: 0.5rem;
          align-items: baseline;
        }

        .seller {
          margin-bottom: 1.25rem;
        }

        .row {
          display: flex;
          gap: 0.5rem;
          align-items: baseline;
          margin-bottom: 0.75rem;
          flex-wrap: wrap;
        }

        .label {
          white-space: nowrap;
        }

        .suffix {
          font-size: 0.8125rem;
          color: #475569;
          white-space: nowrap;
        }

        .ul {
          border-bottom: 1px dotted #94a3b8;
          padding: 0 0.375rem;
          min-width: 80px;
        }

        .flex-fill {
          flex: 1;
          min-width: 150px;
        }

        .mono {
          font-family: ui-monospace, monospace;
        }

        .doc-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 2rem;
        }

        .doc-table th {
          background: #7c3aed;
          color: white;
          padding: 0.625rem 0.875rem;
          border: 1px solid #6d28d9;
          font-size: 0.9375rem;
          font-weight: 600;
          text-align: center;
        }

        .doc-table td {
          padding: 0.5rem 0.875rem;
          border: 1px solid #cbd5e1;
          font-size: 0.875rem;
          vertical-align: top;
        }

        .doc-table th.text-right,
        .doc-table td.text-right {
          text-align: right;
        }

        .doc-table .num {
          font-variant-numeric: tabular-nums;
        }

        .sub {
          font-size: 0.75rem;
          color: #64748b;
          margin-top: 0.125rem;
        }

        .empty-row td {
          height: 1.625rem;
        }

        .total-row {
          background: #f1f5f9;
          font-weight: 600;
        }

        .total-row .baht-text {
          text-align: center;
          font-style: italic;
          color: #475569;
          background: #e2e8f0;
        }

        .signatures {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 2rem;
          margin-top: 3rem;
        }

        .sig-col {
          text-align: left;
        }

        .sig-line {
          font-size: 0.875rem;
          margin-bottom: 0.25rem;
        }

        .sig-label {
          font-size: 0.875rem;
          margin-left: 2rem;
        }

        .note {
          color: #dc2626;
          font-size: 0.8125rem;
          margin-top: 2rem;
          margin-bottom: 1rem;
        }

        .doc-footer {
          margin-top: 2rem;
          padding-top: 0.75rem;
          border-top: 1px solid #e2e8f0;
          font-size: 0.625rem;
          color: #94a3b8;
          text-align: center;
        }

        @media print {
          .doc {
            box-shadow: none;
            margin: 0;
            padding: 15mm;
            max-width: 100%;
          }
          body { background: white !important; }
          @page { size: A4; margin: 0; }
        }
      `}</style>
    </>
  );
}

function formatMoney(n: number): string {
  if (!n) return "-";
  return new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function formatTaxId(s: string): string {
  if (!s) return "—";
  const digits = s.replace(/\D/g, "");
  if (digits.length === 13) {
    return `${digits[0]}-${digits.slice(1, 5)}-${digits.slice(5, 10)}-${digits.slice(10, 12)}-${digits[12]}`;
  }
  return digits || "—";
}

function formatThaiDate(iso: string): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const months = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear() + 543}`;
  } catch { return iso; }
}

function bahtText(n: number): string {
  if (!n || n === 0) return "ศูนย์บาทถ้วน";
  const integer = Math.floor(n);
  const decimal = Math.round((n - integer) * 100);
  const intText = numberToThai(integer);
  if (decimal === 0) return `${intText}บาทถ้วน`;
  return `${intText}บาท${numberToThai(decimal)}สตางค์`;
}

function numberToThai(n: number): string {
  if (n === 0) return "";
  const digits = ["", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
  const positions = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน", "ล้าน"];
  const s = String(Math.abs(n));
  let out = "";
  const len = s.length;
  for (let i = 0; i < len; i++) {
    const d = parseInt(s[i], 10);
    const pos = len - i - 1;
    if (d === 0) continue;
    if (pos === 1 && d === 1) out += positions[pos];
    else if (pos === 1 && d === 2) out += "ยี่" + positions[pos];
    else if (pos === 0 && d === 1 && len > 1) out += "เอ็ด";
    else out += digits[d] + positions[pos];
  }
  return out;
}
