"use client";

import { useEffect, useState } from "react";
import { formatDate as formatThaiDate } from "@/lib/utils/date";
import { FitLine } from "@/components/shared/fit-line";

interface DocData {
  org: {
    name: string;
    taxId: string;
    address: string;
    phone: string;
    branchInfo: string;
    logoUrl?: string | null;
    signatureUrl?: string | null;
    signatoryName?: string | null;
  };
  header: {
    docNumber: string;
    docDate: string;
    validUntil: string;
    status: string;
    customerName: string;
    customerTaxId: string;
    customerAddress: string;
    projectName: string;
    subtotal: number;
    discountAmount: number;
    vatAmount: number;
    vatIncluded: boolean;
    isVat: boolean;
    grandTotal: number;
    notes: string;
    terms: string;
    preparedBy: string;
  };
  /** บัญชีบริษัทที่ตั้งค่าให้แสดงในเอกสารนี้ (จาก CompanyBanks) — ข้อมูลการโอนเงิน */
  banks?: { bankName: string; accountNumber: string; accountName: string; branch: string }[];
  lines: {
    lineNumber: number;
    description: string;
    quantity: number;
    unitPrice: number;
    discountPercent: number;
    lineTotal: number;
  }[];
}

interface Props extends DocData {
  quotationId: string;
}

const formatMoney = (n: number) =>
  n.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

function formatTaxId(taxId: string): string {
  if (!taxId) return "—";
  return taxId.replace(/(\d)(\d{4})(\d{5})(\d{2})(\d)/, "$1-$2-$3-$4-$5");
}

async function generateAndDownloadPdf(
  filename: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    // Wait for fonts + paint
    if ("fonts" in document) {
      await (
        document as Document & { fonts: { ready: Promise<unknown> } }
      ).fonts.ready;
    }
    await new Promise<void>((r) =>
      requestAnimationFrame(() => requestAnimationFrame(() => r()))
    );
    await new Promise<void>((r) => setTimeout(r, 200));

    const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
      import("html2canvas"),
      import("jspdf"),
    ]);

    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });
    const pageWidth = 210;
    const pageHeight = 297;

    const pages = Array.from(document.querySelectorAll(".doc-page"));
    if (pages.length === 0) throw new Error("ไม่พบเอกสารใน DOM");

    for (let i = 0; i < pages.length; i++) {
      const el = pages[i] as HTMLElement;
      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
      });
      const imgData = canvas.toDataURL("image/jpeg", 0.92);
      const imgHeight = (canvas.height * pageWidth) / canvas.width;
      if (i > 0) pdf.addPage();
      // Fit to page (if taller than A4 → trim or scale down — for SME doc this should fit)
      const finalHeight = Math.min(imgHeight, pageHeight);
      pdf.addImage(imgData, "JPEG", 0, 0, pageWidth, finalHeight);
    }

    pdf.save(filename);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "ดาวน์โหลดไม่สำเร็จ",
    };
  }
}

export function QuotationDocument({ quotationId, org, header, lines, banks }: Props) {
  const [downloadState, setDownloadState] = useState<
    "idle" | "downloading" | "done" | "error"
  >("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const filename = `${header.docNumber || "quotation"}.pdf`;

  const handleDownload = async () => {
    setDownloadState("downloading");
    setErrorMsg("");
    const result = await generateAndDownloadPdf(filename);
    if (result.ok) {
      setDownloadState("done");
      setTimeout(() => setDownloadState("idle"), 2000);
    } else {
      setErrorMsg(result.error || "ดาวน์โหลดไม่สำเร็จ");
      setDownloadState("error");
    }
  };

  // Auto-download via ?download=1 query (used by bulk download)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const search = new URLSearchParams(window.location.search);
    if (search.get("download") !== "1") return;

    let closed = false;
    const run = async () => {
      setDownloadState("downloading");
      const result = await generateAndDownloadPdf(filename);
      if (result.ok) {
        // Slight delay so download dialog has time to appear
        setTimeout(() => {
          if (!closed) {
            window.close();
          }
        }, 500);
      } else {
        setErrorMsg(result.error || "ดาวน์โหลดไม่สำเร็จ");
        setDownloadState("error");
      }
    };
    run();
    return () => {
      closed = true;
    };
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
        <button
          onClick={() => window.close()}
          className="app-btn app-btn-secondary"
        >
          ✕ ปิด
        </button>
        <button
          onClick={() => window.print()}
          className="app-btn app-btn-secondary"
        >
          🖨️ พิมพ์
        </button>
        <button
          onClick={handleDownload}
          disabled={downloadState === "downloading"}
          className="app-btn app-btn-primary"
        >
          {downloadState === "downloading" && (
            <>
              <span className="app-spinner" /> กำลังสร้าง PDF...
            </>
          )}
          {downloadState === "done" && "✅ ดาวน์โหลดแล้ว"}
          {downloadState === "idle" && "💾 ดาวน์โหลด PDF"}
          {downloadState === "error" && "💾 ลองอีกครั้ง"}
        </button>
      </div>
      {errorMsg && (
        <div
          className="no-print"
          style={{
            position: "fixed",
            top: "4rem",
            right: "1rem",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#991b1b",
            padding: "0.5rem 0.875rem",
            borderRadius: "0.375rem",
            fontSize: "0.8125rem",
            zIndex: 10,
            maxWidth: "300px",
          }}
        >
          ⚠️ {errorMsg}
        </div>
      )}

      <input type="hidden" data-quotation-id={quotationId} />

      {/* Page 1: ต้นฉบับ */}
      <DocPage copyType="original" org={org} header={header} lines={lines} banks={banks} />
      {/* Page 2: สำเนา */}
      <DocPage copyType="copy" org={org} header={header} lines={lines} banks={banks} />

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
        .copy-stamp {
          display: inline-block;
          padding: 0.25rem 1rem;
          font-size: 0.875rem;
          font-weight: 700;
          letter-spacing: 0.15em;
          border: 2px solid currentColor;
          border-radius: 0.25rem;
        }
        .copy-original {
          color: #1e40af;
          background: #eff6ff;
        }
        .copy-copy {
          color: #b45309;
          background: #fef3c7;
        }
        .doc-header {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 1.25rem;
          align-items: start;
          margin-bottom: 1.5rem;
          padding-bottom: 1rem;
          border-bottom: 2px solid #1e40af;
        }
        .company-logo {
          max-height: 56px;
          max-width: 200px;
          object-fit: contain;
          margin-bottom: 0.5rem;
        }
        .company-name {
          font-size: 1.125rem;
          font-weight: 700;
          margin-bottom: 0.25rem;
        }
        .company-line {
          font-size: 0.8125rem;
          color: #475569;
          line-height: 1.4;
        }
        .doc-meta {
          text-align: right;
        }
        .doc-title {
          font-size: 1.5rem;
          font-weight: 700;
          color: #1e40af;
        }
        .doc-title-sub {
          font-size: 0.75rem;
          color: #64748b;
          letter-spacing: 0.1em;
        }
        .info-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 2rem;
          margin-bottom: 1.5rem;
        }
        .info-block {
          font-size: 0.875rem;
        }
        .info-label {
          font-size: 0.75rem;
          color: #64748b;
          margin-bottom: 0.25rem;
        }
        .info-name {
          font-weight: 600;
          margin-bottom: 0.25rem;
        }
        .info-line {
          font-size: 0.8125rem;
          color: #475569;
          line-height: 1.4;
        }
        .info-block.right {
          text-align: right;
        }
        .info-row {
          display: flex;
          justify-content: space-between;
          gap: 1rem;
          margin-bottom: 0.25rem;
        }
        .info-row span {
          color: #64748b;
        }
        .doc-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 1.5rem;
        }
        .doc-table th {
          background: #1e40af;
          color: white;
          padding: 0.5rem 0.625rem;
          border: 1px solid #1e3a8a;
          font-size: 0.875rem;
          font-weight: 600;
          text-align: center;
        }
        .doc-table td {
          padding: 0.4rem 0.625rem;
          border: 1px solid #cbd5e1;
          font-size: 0.875rem;
          vertical-align: top;
        }
        .doc-table th.text-right,
        .doc-table td.text-right {
          text-align: right;
        }
        .doc-table .text-center {
          text-align: center;
        }
        .doc-table .num {
          font-variant-numeric: tabular-nums;
        }
        .empty-row td {
          height: 1.5rem;
          background: #fafafa;
        }
        .totals-row {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 2rem;
          margin-bottom: 2rem;
        }
        .bank-block {
          margin-bottom: 0.75rem;
          padding: 0.5rem 0.75rem;
          border: 1px solid #e2e8f0;
          border-radius: 0.375rem;
          background: #f8fafc;
        }
        .bank-line {
          font-size: 0.8125rem;
          line-height: 1.5;
        }
        .bank-line + .bank-line {
          margin-top: 0.375rem;
          padding-top: 0.375rem;
          border-top: 1px dashed #e2e8f0;
        }
        .bank-line-main {
          white-space: nowrap;
        }
        .bank-line-name {
          color: #475569;
        }
        .terms-block {
          font-size: 0.8125rem;
        }
        .terms-title {
          font-weight: 600;
          color: #1e40af;
          margin-bottom: 0.25rem;
        }
        .terms-text {
          white-space: pre-wrap;
          color: #475569;
          line-height: 1.5;
        }
        .totals-block {
          min-width: 250px;
          font-size: 0.875rem;
        }
        .totals-row-line {
          display: flex;
          justify-content: space-between;
          gap: 1rem;
          padding: 0.25rem 0;
        }
        .totals-row-line.grand {
          border-top: 2px solid #1e40af;
          margin-top: 0.5rem;
          padding-top: 0.5rem;
          font-weight: 700;
          font-size: 1rem;
          color: #1e40af;
        }
        .signatures {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 4rem;
          margin-top: 3rem;
        }
        .sig-col {
          text-align: center;
        }
        .sig-img {
          display: block;
          margin: 0 auto -0.5rem;
          height: 48px;
          object-fit: contain;
        }
        .sig-line {
          margin-bottom: 0.375rem;
        }
        .sig-label {
          font-size: 0.875rem;
          color: #475569;
        }
        .sig-name {
          font-size: 0.75rem;
          color: #64748b;
          margin-top: 0.25rem;
        }
        .sig-date {
          font-size: 0.8125rem;
          color: #475569;
          margin-top: 0.5rem;
        }
        .mono {
          font-family: ui-monospace, monospace;
        }

        @media print {
          .no-print {
            display: none !important;
          }
          /* พิมพ์: ให้ 1 ฉบับ (ต้นฉบับ/สำเนา) อยู่ใน 1 หน้า A4 — ขอบกระดาษใช้ @page แล้ว
             จึงไม่ต้องมี padding ซ้ำ และบีบระยะห่าง/แถวว่างลง ไม่ให้ช่องลงชื่อล้นไปหน้าใหม่ */
          .doc-page {
            box-shadow: none;
            margin: 0;
            padding: 0;
            max-width: none;
          }
          .doc-page + .doc-page {
            page-break-before: always;
          }
          .doc-header {
            margin-bottom: 0.75rem;
            padding-bottom: 0.625rem;
          }
          .info-grid,
          .doc-table {
            margin-bottom: 0.75rem;
          }
          .doc-table td {
            padding-top: 0.25rem;
            padding-bottom: 0.25rem;
          }
          .empty-row td {
            height: 1.125rem;
            padding-top: 0;
            padding-bottom: 0;
            line-height: 1;
          }
          .doc-table tr {
            break-inside: avoid;
          }
          .totals-row {
            margin-bottom: 0.75rem;
            break-inside: avoid;
          }
          .signatures {
            margin-top: 1.5rem;
            break-inside: avoid;
          }
          @page {
            size: A4;
            margin: 1cm;
          }
        }
      `}</style>
    </>
  );
}

// ===== Inner: a single document page =====

function DocPage({
  copyType,
  org,
  header,
  lines,
  banks,
}: {
  copyType: "original" | "copy";
} & DocData) {
  return (
    <div className={`doc-page doc-page-${copyType}`}>
      <div className="doc-header">
        <div className="company">
          {org.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={org.logoUrl} alt="" className="company-logo" />
          )}
          <div className="company-name">{org.name}</div>
          <div className="company-line">
            เลขประจำตัวผู้เสียภาษี: {formatTaxId(org.taxId)} • {org.branchInfo}
          </div>
          {org.address && (
            // ที่อยู่ยาว → ย่อตัวอักษรให้อยู่บรรทัดเดียว (รหัสไปรษณีย์ไม่ตกบรรทัด)
            <FitLine className="company-line">{org.address}</FitLine>
          )}
          {org.phone && <div className="company-line">โทร: {org.phone}</div>}
        </div>
        <div className="doc-meta">
          <div className="doc-title">ใบเสนอราคา</div>
          <div className="doc-title-sub">QUOTATION</div>
          <div
            className={`copy-stamp copy-${copyType}`}
            style={{ marginTop: "0.5rem" }}
          >
            {copyType === "copy" ? "สำเนา" : "ต้นฉบับ"}
          </div>
        </div>
      </div>

      <div className="info-grid">
        <div className="info-block">
          <div className="info-label">ลูกค้า</div>
          <div className="info-name">{header.customerName || "—"}</div>
          {header.customerTaxId && (
            <div className="info-line">
              เลขผู้เสียภาษี: {formatTaxId(header.customerTaxId)}
            </div>
          )}
          {header.customerAddress && (
            <div className="info-line">{header.customerAddress}</div>
          )}
        </div>
        <div className="info-block right">
          <div className="info-row">
            <span>เลขที่:</span>
            <strong className="mono">{header.docNumber}</strong>
          </div>
          <div className="info-row">
            <span>วันที่:</span>
            <strong>{formatThaiDate(header.docDate)}</strong>
          </div>
          <div className="info-row">
            <span>ใช้ได้ถึง:</span>
            <strong>{formatThaiDate(header.validUntil)}</strong>
          </div>
          {header.projectName && (
            <div className="info-row">
              <span>โครงการ:</span>
              <strong>{header.projectName}</strong>
            </div>
          )}
        </div>
      </div>

      <table className="doc-table">
        <thead>
          <tr>
            <th style={{ width: "40px" }}>ลำดับ</th>
            <th>รายละเอียด</th>
            <th style={{ width: "70px" }} className="text-right">
              จำนวน
            </th>
            <th style={{ width: "100px" }} className="text-right">
              ราคา/หน่วย
            </th>
            <th style={{ width: "70px" }} className="text-right">
              ส่วนลด %
            </th>
            <th style={{ width: "120px" }} className="text-right">
              ยอดรวม
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.lineNumber}>
              <td className="text-center">{l.lineNumber}</td>
              <td>{l.description}</td>
              <td className="text-right num">{formatMoney(l.quantity)}</td>
              <td className="text-right num">{formatMoney(l.unitPrice)}</td>
              <td className="text-right num">
                {l.discountPercent > 0 ? `${l.discountPercent}%` : "-"}
              </td>
              <td className="text-right num">{formatMoney(l.lineTotal)}</td>
            </tr>
          ))}
          {Array.from({ length: Math.max(0, 10 - lines.length) }).map(
            (_, i) => (
              <tr key={`empty-${i}`} className="empty-row">
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
              </tr>
            )
          )}
        </tbody>
      </table>

      <div className="totals-row">
        <div className="terms-block">
          {!!banks?.length && (
            <div className="bank-block">
              <div className="terms-title">ชำระเงินโดยโอนเข้าบัญชี</div>
              {banks.map((b, i) => (
                <div key={i} className="bank-line">
                  {/* บรรทัด 1: ธนาคาร + สาขา + เลขที่บัญชี · บรรทัด 2: ชื่อบัญชี */}
                  <div className="bank-line-main">
                    <strong>{b.bankName}</strong>
                    {b.branch ? ` สาขา${b.branch}` : ""} · เลขที่บัญชี{" "}
                    <span className="mono">{b.accountNumber}</span>
                  </div>
                  {b.accountName && (
                    <div className="bank-line-name">ชื่อบัญชี {b.accountName}</div>
                  )}
                </div>
              ))}
            </div>
          )}
          {header.terms && (
            <>
              <div className="terms-title">เงื่อนไข</div>
              <div className="terms-text">{header.terms}</div>
            </>
          )}
          {header.notes && (
            <>
              <div className="terms-title" style={{ marginTop: "0.75rem" }}>
                หมายเหตุ
              </div>
              <div className="terms-text">{header.notes}</div>
            </>
          )}
        </div>
        <div className="totals-block">
          <div className="totals-row-line">
            <span>{header.isVat ? "ราคา (ก่อน VAT):" : "ยอดรวม:"}</span>
            <span className="num">{formatMoney(header.subtotal)}</span>
          </div>
          {header.discountAmount > 0 && (
            <div className="totals-row-line">
              <span>ส่วนลดท้ายบิล:</span>
              <span className="num">−{formatMoney(header.discountAmount)}</span>
            </div>
          )}
          {header.isVat && (
            <div className="totals-row-line">
              <span>VAT 7% {header.vatIncluded && "(included)"}:</span>
              <span className="num">{formatMoney(header.vatAmount)}</span>
            </div>
          )}
          <div className="totals-row-line grand">
            <span>ยอดรวมสุทธิ:</span>
            <span className="num">{formatMoney(header.grandTotal)}</span>
          </div>
        </div>
      </div>

      <div className="signatures">
        <div className="sig-col">
          {org.signatureUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={org.signatureUrl} alt="" className="sig-img" />
          )}
          <div className="sig-line">
            ลงชื่อ ...................................................
          </div>
          <div className="sig-label">ผู้เสนอราคา</div>
          {(org.signatoryName || header.preparedBy) && (
            <div className="sig-name">
              ({org.signatoryName || header.preparedBy})
            </div>
          )}
        </div>
        <div className="sig-col">
          <div className="sig-line">
            ลงชื่อ ...................................................
          </div>
          <div className="sig-label">ผู้อนุมัติจากลูกค้า</div>
          <div className="sig-date">วันที่ ........../........../..........</div>
        </div>
      </div>
    </div>
  );
}
