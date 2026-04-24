"use client";

import { useEffect, useState } from "react";
import { saveDocumentPdf, runAutoSaveIfRequested } from "@/lib/utils/save-doc-pdf";

interface Props {
  company: { name: string; taxId: string; address: string };
  requester: { name: string };
  payee: { name: string };
  payment: {
    paymentId: string;
    description: string;
    date: string;
    amount: number;
    eventName: string;
    notes: string;
  };
}

export function SubstituteReceiptDocument({ company, requester, payee, payment }: Props) {
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
        docType: "substitute-receipt",
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
      docType: "substitute-receipt",
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
        {/* Title */}
        <div className="doc-title">ใบรับรองแทนใบเสร็จรับเงิน</div>

        {/* บจ./หจก. (ผู้ซื้อ/ผู้รับบริการ) */}
        <div className="company-row">
          <span className="label">บจ. / หจก.</span>
          <span className="ul flex-fill">{company.name || "—"}</span>
          <span className="suffix">(ผู้ซื้อ/ผู้รับบริการ)</span>
        </div>

        {/* Detail table */}
        <table className="doc-table">
          <thead>
            <tr>
              <th style={{ width: "14%" }}>วัน เดือน ปี</th>
              <th>รายละเอียดรายจ่าย</th>
              <th style={{ width: "16%" }} className="text-right">จำนวนเงิน</th>
              <th style={{ width: "16%" }}>หมายเหตุ</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{formatThaiDate(payment.date)}</td>
              <td>
                <div>{payment.description || "ค่าใช้จ่าย"}</div>
                {payment.eventName && (
                  <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "0.125rem" }}>
                    โปรเจกต์: {payment.eventName}
                  </div>
                )}
                {payee.name && (
                  <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                    จ่ายให้: {payee.name}
                  </div>
                )}
              </td>
              <td className="text-right num">{formatMoney(payment.amount)}</td>
              <td style={{ fontSize: "0.75rem" }}>{payment.notes || ""}</td>
            </tr>
            {/* แถวว่าง ~12 แถว เพื่อให้ตารางยาวพอสำหรับพิมพ์ */}
            {Array.from({ length: 11 }).map((_, i) => (
              <tr key={i} className="empty-row">
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
              </tr>
            ))}
            <tr className="total-row">
              <td colSpan={2} className="baht-text">
                ({bahtText(payment.amount)})
              </td>
              <td className="text-right"><strong>รวมทั้งสิ้น</strong></td>
              <td className="text-right num"><strong>{formatMoney(payment.amount)}</strong></td>
            </tr>
          </tbody>
        </table>

        {/* ข้อความรับรอง */}
        <div className="declaration">
          <div className="decl-row">
            <span>ข้าพเจ้า</span>
            <span className="ul flex-fill">{requester.name || "................................"}</span>
            <span>(ผู้เบิกจ่าย)</span>
          </div>
          <div className="decl-text">
            ขอรับรองว่า รายจ่ายข้างต้นนี้ไม่อาจเรียกเก็บใบเสร็จรับเงินจากผู้รับได้
            และข้าพเจ้าได้จ่ายไปในงานของทาง{" "}
            <strong>{company.name}</strong> โดยแท้ ตั้งแต่วันที่{" "}
            <span className="ul">{formatThaiDate(payment.date)}</span> ถึงวันที่{" "}
            <span className="ul">{formatThaiDate(payment.date)}</span>
          </div>
        </div>

        {/* Signatures */}
        <div className="doc-signatures">
          <div className="sig-box">
            <div className="sig-line">ลงชื่อ .....................................................</div>
            <div className="sig-label">(ผู้เบิกจ่าย)</div>
            <div className="sig-name">({requester.name || "................................"})</div>
          </div>
          <div className="sig-box">
            <div className="sig-line">ลงชื่อ .....................................................</div>
            <div className="sig-label">(ผู้อนุมัติ)</div>
            <div className="sig-name">(................................)</div>
          </div>
        </div>

        <div className="doc-footer" suppressHydrationWarning>
          ออกโดย Aim Expense{printedAt ? ` • ${printedAt}` : ""} • Payment ID: {payment.paymentId}
        </div>
      </div>

      <style jsx>{`
        .doc {
          max-width: 210mm;
          margin: 2rem auto;
          background: white;
          padding: 2.5rem 2.5rem;
          box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
          font-family: "IBM Plex Sans Thai", "Sarabun", sans-serif;
          color: #0f172a;
          font-size: 0.875rem;
        }

        .doc-title {
          text-align: center;
          font-size: 1.5rem;
          font-weight: 700;
          margin-bottom: 2rem;
        }

        .company-row {
          display: flex;
          gap: 0.5rem;
          align-items: baseline;
          margin-bottom: 1rem;
        }

        .label {
          min-width: 60px;
        }

        .ul {
          border-bottom: 1px dotted #94a3b8;
          padding: 0 0.25rem;
        }

        .flex-fill {
          flex: 1;
        }

        .suffix {
          font-size: 0.8125rem;
          color: #475569;
          white-space: nowrap;
        }

        .doc-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 1.5rem;
        }

        .doc-table th {
          background: #2563eb;
          color: white;
          padding: 0.5rem 0.625rem;
          border: 1px solid #1e40af;
          font-size: 0.8125rem;
          font-weight: 600;
          text-align: center;
        }

        .doc-table td {
          padding: 0.5rem 0.625rem;
          border: 1px solid #cbd5e1;
          font-size: 0.8125rem;
          vertical-align: top;
        }

        .doc-table th.text-right,
        .doc-table td.text-right {
          text-align: right;
        }

        .doc-table .num {
          font-variant-numeric: tabular-nums;
        }

        .empty-row td {
          height: 1.625rem;
        }

        .total-row {
          background: #dcfce7;
          font-size: 0.875rem;
        }

        .total-row .baht-text {
          background: #86efac;
          text-align: center;
          font-style: italic;
          color: #15803d;
        }

        .declaration {
          margin: 1.5rem 0 2rem;
        }

        .decl-row {
          display: flex;
          gap: 0.5rem;
          align-items: baseline;
          margin-bottom: 0.5rem;
        }

        .decl-text {
          font-size: 0.875rem;
          line-height: 1.75;
        }

        .doc-signatures {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 2rem;
          margin-top: 3rem;
        }

        .sig-box {
          text-align: center;
        }

        .sig-line {
          font-size: 0.875rem;
          margin-bottom: 0.25rem;
        }

        .sig-label {
          font-size: 0.8125rem;
          color: #475569;
          margin-bottom: 0.125rem;
        }

        .sig-name {
          font-size: 0.8125rem;
          color: #64748b;
        }

        .doc-footer {
          margin-top: 3rem;
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
