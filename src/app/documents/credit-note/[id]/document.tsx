"use client";

// ===========================================
// ใบลดหนี้ / ใบเพิ่มหนี้ — รายการครบตาม ม.86/9-10:
//   คำว่า "ใบลดหนี้"/"ใบเพิ่มหนี้" · ผู้ออก (ชื่อ ที่อยู่ เลขผู้เสียภาษี สาขา) · ผู้ซื้อ (ชื่อ ที่อยู่ เลข สาขา)
//   · เลขที่/วันที่ · อ้างเลขที่และวันที่ใบกำกับเดิม · มูลค่าตามใบกำกับเดิม · มูลค่าที่ถูกต้อง · ผลต่าง
//   · ภาษีของผลต่าง · คำอธิบายเหตุ · ต้นฉบับ/สำเนา
// ===========================================

import { useState } from "react";
import { DriveSaveStatus, type DriveSaveProps } from "@/components/documents/drive-save-status";
import { buildDocPagesPdf } from "@/lib/utils/sales-doc-autosave";
import { formatDate } from "@/lib/utils/date";

type Props = {
  driveSave: DriveSaveProps;
  org: {
    name: string;
    taxId: string | null;
    address: string;
    phone: string;
    branchInfo: string;
    logoUrl: string | null;
    signatureUrl: string | null;
    signatoryName: string | null;
  };
  note: {
    kind: "credit" | "debit";
    docNumber: string;
    docDate: string;
    status: "issued" | "void";
    sourceDocNumber: string;
    sourceDocDate: string;
    originalSubtotal: number;
    priorAdjustment: number;
    correctSubtotal: number;
    diffAmount: number;
    vatAmount: number;
    grandTotal: number;
    reasonLabel: string;
    reason: string;
    description: string;
    customerName: string;
    customerTaxId: string;
    customerBranch: string;
    customerAddress: string;
    preparedBy: string;
  };
};

const money = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function NotePage({ copyType, org, note }: { copyType: "original" | "copy" } & Omit<Props, "driveSave">) {
  const title = note.kind === "credit" ? "ใบลดหนี้" : "ใบเพิ่มหนี้";
  const titleEn = note.kind === "credit" ? "CREDIT NOTE" : "DEBIT NOTE";
  const currentValue = note.originalSubtotal + note.priorAdjustment;
  return (
    <div className="doc-page">
      {note.status === "void" && <div className="void-watermark">ยกเลิก</div>}
      <div className="cn-header">
        <div>
          {org.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={org.logoUrl} alt="" className="cn-logo" />
          )}
          <div className="cn-company">{org.name}</div>
          <div className="cn-line">{org.address}</div>
          <div className="cn-line">
            เลขประจำตัวผู้เสียภาษี {org.taxId || "-"} · {org.branchInfo}
          </div>
          {org.phone && <div className="cn-line">โทร {org.phone}</div>}
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="cn-title">{title}</div>
          <div className="cn-title-en">{titleEn}</div>
          <div className={`cn-stamp ${copyType === "original" ? "cn-original" : "cn-copy"}`}>
            {copyType === "original" ? "ต้นฉบับ" : "สำเนา"}
          </div>
          <div className="cn-line" style={{ marginTop: "0.5rem" }}>
            เลขที่ <strong>{note.docNumber}</strong>
          </div>
          <div className="cn-line">วันที่ {formatDate(note.docDate)}</div>
        </div>
      </div>

      <div className="cn-box">
        <div>
          <strong>ลูกค้า:</strong> {note.customerName}
        </div>
        <div>{note.customerAddress}</div>
        <div>
          เลขประจำตัวผู้เสียภาษี {note.customerTaxId || "-"}
          {note.customerBranch ? ` · ${note.customerBranch}` : ""}
        </div>
      </div>

      <div className="cn-box">
        อ้างอิงใบกำกับภาษีเลขที่ <strong>{note.sourceDocNumber}</strong> ลงวันที่ {formatDate(note.sourceDocDate)}
      </div>

      <table className="cn-table">
        <tbody>
          <tr>
            <td>มูลค่าสินค้า/บริการตามใบกำกับภาษีเดิม</td>
            <td className="num">{money(note.originalSubtotal)}</td>
          </tr>
          {note.priorAdjustment !== 0 && (
            <tr>
              <td>ปรับโดยใบลดหนี้/ใบเพิ่มหนี้ก่อนหน้า (มูลค่าก่อนออกใบนี้ {money(currentValue)})</td>
              <td className="num">{money(note.priorAdjustment)}</td>
            </tr>
          )}
          <tr>
            <td>มูลค่าที่ถูกต้อง</td>
            <td className="num">{money(note.correctSubtotal)}</td>
          </tr>
          <tr>
            <td>
              <strong>ผลต่าง ({note.kind === "credit" ? "ลดลง" : "เพิ่มขึ้น"})</strong>
            </td>
            <td className="num">
              <strong>{money(note.diffAmount)}</strong>
            </td>
          </tr>
          <tr>
            <td>ภาษีมูลค่าเพิ่ม 7% ของผลต่าง</td>
            <td className="num">{money(note.vatAmount)}</td>
          </tr>
          <tr className="cn-total">
            <td>รวมผลต่างทั้งสิ้น</td>
            <td className="num">{money(note.grandTotal)}</td>
          </tr>
        </tbody>
      </table>

      <div className="cn-box">
        <div>
          <strong>เหตุที่{note.kind === "credit" ? "ลด" : "เพิ่ม"}หนี้:</strong> {note.reasonLabel}
        </div>
        <div>คำอธิบาย: {note.reason}</div>
        {note.description && <div>รายการ: {note.description}</div>}
      </div>

      <div className="cn-sign">
        <div>
          {org.signatureUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={org.signatureUrl} alt="" className="cn-signature" />
          )}
          <div>({org.signatoryName || note.preparedBy || "ผู้มีอำนาจลงนาม"})</div>
          <div className="cn-line">ผู้ออกเอกสาร</div>
        </div>
      </div>
    </div>
  );
}

export function CreditNoteDocument({ driveSave, org, note }: Props) {
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  const download = async () => {
    setState("busy");
    try {
      const blob = await buildDocPagesPdf();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${note.docNumber || "note"}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      setState("idle");
    } catch {
      setState("error");
    }
  };
  return (
    <>
      <div className="no-print" style={{ position: "fixed", top: "1rem", right: "1rem", display: "flex", gap: "0.5rem", zIndex: 10 }}>
        <DriveSaveStatus {...driveSave} />
        <button onClick={() => window.close()} className="app-btn app-btn-secondary">
          ✕ ปิด
        </button>
        <button onClick={() => window.print()} className="app-btn app-btn-secondary">
          🖨️ พิมพ์
        </button>
        <button onClick={download} disabled={state === "busy"} className="app-btn app-btn-primary">
          {state === "busy" ? "กำลังสร้าง PDF..." : state === "error" ? "💾 ลองอีกครั้ง" : "💾 ดาวน์โหลด PDF"}
        </button>
      </div>

      <NotePage copyType="original" org={org} note={note} />
      <NotePage copyType="copy" org={org} note={note} />

      <style jsx global>{`
        .doc-page {
          max-width: 210mm;
          margin: 1rem auto;
          background: white;
          padding: 2rem;
          box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
          font-family: "IBM Plex Sans Thai", "Sarabun", sans-serif;
          color: #0f172a;
          font-size: 0.875rem;
          position: relative;
        }
        .void-watermark {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%) rotate(-30deg);
          font-size: 7rem;
          font-weight: 800;
          color: rgba(220, 38, 38, 0.18);
          pointer-events: none;
        }
        .cn-header {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 1.25rem;
          padding-bottom: 1rem;
          margin-bottom: 1rem;
          border-bottom: 2px solid #b91c1c;
        }
        .cn-logo {
          max-height: 56px;
          max-width: 200px;
          object-fit: contain;
          margin-bottom: 0.5rem;
        }
        .cn-company {
          font-size: 1.125rem;
          font-weight: 700;
        }
        .cn-line {
          font-size: 0.8125rem;
          color: #475569;
          line-height: 1.5;
        }
        .cn-title {
          font-size: 1.5rem;
          font-weight: 800;
          color: #b91c1c;
        }
        .cn-title-en {
          font-size: 0.75rem;
          letter-spacing: 0.1em;
          color: #64748b;
        }
        .cn-stamp {
          display: inline-flex;
          align-items: center;
          height: 1.75rem;
          padding: 0 0.875rem 0.1em;
          margin-top: 0.5rem;
          font-weight: 700;
          border: 2px solid currentColor;
          border-radius: 0.25rem;
        }
        .cn-original {
          color: #b91c1c;
        }
        .cn-copy {
          color: #b45309;
        }
        .cn-box {
          border: 1px solid #e2e8f0;
          border-radius: 0.375rem;
          padding: 0.625rem 0.875rem;
          margin-bottom: 0.75rem;
          line-height: 1.6;
        }
        .cn-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 0.75rem;
        }
        .cn-table td {
          border: 1px solid #e2e8f0;
          padding: 0.5rem 0.75rem;
        }
        .cn-table td.num {
          text-align: right;
          width: 30%;
          font-variant-numeric: tabular-nums;
        }
        .cn-total td {
          font-weight: 700;
          background: #f8fafc;
        }
        .cn-sign {
          display: flex;
          justify-content: flex-end;
          text-align: center;
          margin-top: 2rem;
        }
        .cn-signature {
          max-height: 48px;
          max-width: 160px;
          object-fit: contain;
        }
        @media print {
          body {
            background: white;
          }
          .no-print {
            display: none !important;
          }
          .doc-page {
            box-shadow: none;
            margin: 0 auto;
            page-break-after: always;
          }
        }
      `}</style>
    </>
  );
}
