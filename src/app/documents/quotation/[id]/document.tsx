"use client";

interface Props {
  org: {
    name: string;
    taxId: string;
    address: string;
    phone: string;
    branchInfo: string;
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
    grandTotal: number;
    notes: string;
    terms: string;
    preparedBy: string;
  };
  lines: {
    lineNumber: number;
    description: string;
    quantity: number;
    unitPrice: number;
    discountPercent: number;
    lineTotal: number;
  }[];
}

const formatMoney = (n: number) =>
  n.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

function formatThaiDate(iso: string): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const month = [
      "มกราคม",
      "กุมภาพันธ์",
      "มีนาคม",
      "เมษายน",
      "พฤษภาคม",
      "มิถุนายน",
      "กรกฎาคม",
      "สิงหาคม",
      "กันยายน",
      "ตุลาคม",
      "พฤศจิกายน",
      "ธันวาคม",
    ];
    return `${d.getDate()} ${month[d.getMonth()]} ${d.getFullYear() + 543}`;
  } catch {
    return iso;
  }
}

function formatTaxId(taxId: string): string {
  if (!taxId) return "—";
  // 1-2345-67890-12-3
  return taxId.replace(/(\d)(\d{4})(\d{5})(\d{2})(\d)/, "$1-$2-$3-$4-$5");
}

export function QuotationDocument({ org, header, lines }: Props) {
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
          onClick={() => window.history.back()}
          className="app-btn app-btn-secondary"
        >
          ← กลับ
        </button>
        <button
          onClick={() => window.print()}
          className="app-btn app-btn-primary"
        >
          🖨️ พิมพ์ / บันทึก PDF
        </button>
      </div>

      <div className="doc">
        {/* Header */}
        <div className="doc-header">
          <div className="company">
            <div className="company-name">{org.name}</div>
            <div className="company-line">
              เลขประจำตัวผู้เสียภาษี: {formatTaxId(org.taxId)} • {org.branchInfo}
            </div>
            {org.address && <div className="company-line">{org.address}</div>}
            {org.phone && <div className="company-line">โทร: {org.phone}</div>}
          </div>
          <div className="doc-meta">
            <div className="doc-title">ใบเสนอราคา</div>
            <div className="doc-title-sub">QUOTATION</div>
            {header.status !== "draft" && header.status !== "sent" && (
              <div
                className="status-stamp"
                style={{
                  color:
                    header.status === "void" || header.status === "rejected"
                      ? "#dc2626"
                      : "#15803d",
                }}
              >
                {header.status === "accepted" && "✓ ยืนยัน"}
                {header.status === "rejected" && "✗ ปฏิเสธ"}
                {header.status === "void" && "✗ ยกเลิก"}
                {header.status === "converted" && "→ แปลงเป็นใบวางบิล"}
              </div>
            )}
          </div>
        </div>

        {/* Doc info + Customer */}
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

        {/* Lines table */}
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
            {/* Empty rows ทำให้ตารางยาวสวยงาม */}
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

        {/* Totals */}
        <div className="totals-row">
          <div className="terms-block">
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
              <span>ราคา (ก่อน VAT):</span>
              <span className="num">{formatMoney(header.subtotal)}</span>
            </div>
            {header.discountAmount > 0 && (
              <div className="totals-row-line">
                <span>ส่วนลดท้ายบิล:</span>
                <span className="num">−{formatMoney(header.discountAmount)}</span>
              </div>
            )}
            <div className="totals-row-line">
              <span>VAT 7% {header.vatIncluded && "(included)"}:</span>
              <span className="num">{formatMoney(header.vatAmount)}</span>
            </div>
            <div className="totals-row-line grand">
              <span>ยอดรวมสุทธิ:</span>
              <span className="num">{formatMoney(header.grandTotal)}</span>
            </div>
          </div>
        </div>

        {/* Signatures */}
        <div className="signatures">
          <div className="sig-col">
            <div className="sig-line">
              ลงชื่อ ...................................................
            </div>
            <div className="sig-label">ผู้เสนอราคา</div>
            {header.preparedBy && (
              <div className="sig-name">({header.preparedBy})</div>
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

      <style jsx>{`
        .doc {
          max-width: 210mm;
          margin: 1rem auto;
          background: white;
          padding: 2rem;
          box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
          font-family: "IBM Plex Sans Thai", "Sarabun", sans-serif;
          color: #0f172a;
          font-size: 0.875rem;
        }
        .doc-header {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 2rem;
          align-items: start;
          margin-bottom: 1.5rem;
          padding-bottom: 1rem;
          border-bottom: 2px solid #1e40af;
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
        .status-stamp {
          margin-top: 0.5rem;
          font-size: 0.875rem;
          font-weight: 700;
          border: 2px solid currentColor;
          padding: 0.25rem 0.5rem;
          border-radius: 0.25rem;
          display: inline-block;
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
          .doc {
            box-shadow: none;
            margin: 0;
            padding: 1.5rem;
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
