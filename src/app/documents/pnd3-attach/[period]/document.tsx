"use client";

// ===========================================
// ใบแนบ ภ.ง.ด.3 — Client document
// A4 landscape, 6 รายการ/แผ่น, multi-page
// แต่ละรายการมี:
//   - เลขประจำตัวผู้เสียภาษีอากร (13 boxes) + สาขาที่ (5 boxes)
//   - ชื่อ-สกุล + ที่อยู่
//   - วัน เดือน ปี ที่จ่าย
//   - ประเภทเงินได้
//   - อัตราภาษี %
//   - จำนวนเงินที่จ่าย
//   - ภาษีหัก
//   - เงื่อนไข (1/2/3)
// ===========================================

import { useEffect, useState } from "react";
import {
  splitTaxIdBoxes,
  splitBranchBoxes,
  formatThaiDateShort,
  formatMoney,
  formatMoneyAlways,
  chunkInto,
} from "@/lib/wht-form-utils";

export interface PND3AttachRow {
  paymentId: string;
  paidDate: string; // YYYY-MM-DD
  payeeName: string;
  taxId: string;
  branchLabel: string; // "00000" / 5-digit
  address: string;
  incomeType: string;
  rate: number; // อัตรา %
  incomeAmount: number;
  whtAmount: number;
  condition: number; // 1/2/3
}

interface Props {
  period: string;
  periodInfo: {
    year: number;
    yearTH: number;
    month: number;
    monthName: string;
  };
  org: {
    name: string;
    taxId: string;
    branchType: string;
    branchNumber: string;
    address: string;
  };
  rows: PND3AttachRow[];
}

const ROWS_PER_SHEET = 6;

export function PND3AttachDocument({ period, periodInfo, org, rows }: Props) {
  const handlePrint = () => window.print();

  const [printedAt, setPrintedAt] = useState("");
  useEffect(() => {
    setPrintedAt(new Date().toLocaleString("th-TH"));
  }, []);

  // แบ่งรายการ 6/แผ่น
  const sheets = chunkInto(rows, ROWS_PER_SHEET);
  const totalSheets = sheets.length;

  // Total ของทั้งฟอร์ม (ปรากฏใน "รวมยอดเงินได้และภาษีที่นำส่ง" ของแผ่นสุดท้าย)
  const grandTotalIncome = rows.reduce((s, r) => s + r.incomeAmount, 0);
  const grandTotalWHT = rows.reduce((s, r) => s + r.whtAmount, 0);

  const orgBranchLabel =
    org.branchType === "HQ" ? "00000" :
    org.branchType === "Branch" ? (org.branchNumber || "").padStart(5, "0") :
    "";

  return (
    <>
      <DocStyles />

      {/* Print toolbar — hidden when printing */}
      <div className="print-toolbar no-print">
        <div className="pt-info">
          <strong>ใบแนบ ภ.ง.ด.3</strong>
          <span className="pt-period">{periodInfo.monthName} {periodInfo.yearTH}</span>
          <span className="pt-count">{rows.length} รายการ • {totalSheets} แผ่น</span>
        </div>
        <div className="pt-actions">
          <button onClick={handlePrint} className="pt-btn pt-btn-primary">
            🖨️ พิมพ์ / บันทึกเป็น PDF
          </button>
          <a href={`/reports/wht?tab=pnd3`} className="pt-btn pt-btn-link">
            ← กลับไปรายงาน
          </a>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState period={period} monthName={periodInfo.monthName} yearTH={periodInfo.yearTH} />
      ) : (
        sheets.map((sheetRows, sheetIdx) => (
          <PND3AttachSheet
            key={sheetIdx}
            sheetIdx={sheetIdx}
            totalSheets={totalSheets}
            org={org}
            orgBranchLabel={orgBranchLabel}
            sheetRows={sheetRows}
            startSeq={sheetIdx * ROWS_PER_SHEET + 1}
            isLastSheet={sheetIdx === totalSheets - 1}
            grandTotalIncome={grandTotalIncome}
            grandTotalWHT={grandTotalWHT}
            printedAt={printedAt}
          />
        ))
      )}
    </>
  );
}

// ----- One sheet (6 rows) -----
function PND3AttachSheet({
  sheetIdx,
  totalSheets,
  org,
  orgBranchLabel,
  sheetRows,
  startSeq,
  isLastSheet,
  grandTotalIncome,
  grandTotalWHT,
}: {
  sheetIdx: number;
  totalSheets: number;
  org: Props["org"];
  orgBranchLabel: string;
  sheetRows: PND3AttachRow[];
  startSeq: number;
  isLastSheet: boolean;
  grandTotalIncome: number;
  grandTotalWHT: number;
  printedAt: string;
}) {
  const orgTaxBoxes = splitTaxIdBoxes(org.taxId);
  const orgBranchBoxesArr = splitBranchBoxes(orgBranchLabel);

  // sheet subtotal (this page only)
  const sheetTotalIncome = sheetRows.reduce((s, r) => s + r.incomeAmount, 0);
  const sheetTotalWHT = sheetRows.reduce((s, r) => s + r.whtAmount, 0);

  // pad rows to ROWS_PER_SHEET (last sheet may have <6)
  const paddedRows: (PND3AttachRow | null)[] = [...sheetRows];
  while (paddedRows.length < ROWS_PER_SHEET) paddedRows.push(null);

  return (
    <div className="doc pnd3-attach-doc">
      {/* Top header */}
      <div className="hdr">
        <div className="hdr-left">
          <div className="hdr-title">ใบแนบ <span className="hdr-form">ภ.ง.ด.3</span></div>
          <div className="hdr-taxid">
            <span className="hdr-taxid-label">เลขประจำตัวผู้เสียภาษีอากร</span>
            <span className="hdr-taxid-sub">(ของผู้มีหน้าที่หักภาษี ณ ที่จ่าย)</span>
            <BoxRow values={orgTaxBoxes} groupSize={[1, 4, 5, 2, 1]} />
            <span className="hdr-branch-label">สาขาที่</span>
            <BoxRow values={orgBranchBoxesArr} />
          </div>
        </div>
        <div className="hdr-right">
          <div className="hdr-page">
            แผ่นที่ <u className="u-cell">{sheetIdx + 1}</u>
            ในจำนวน <u className="u-cell">{totalSheets}</u> แผ่น
          </div>
        </div>
      </div>

      {/* Table */}
      <table className="rows">
        <thead>
          <tr>
            <th rowSpan={2} className="c-seq">ลำดับ<br />ที่</th>
            <th colSpan={2} className="c-payee">
              <div>เลขประจำตัวผู้เสียภาษีอากร <span className="muted">(ของผู้มีเงินได้)</span></div>
              <div className="thin">ชื่อผู้มีเงินได้ <span className="muted">(ให้ระบุให้ชัดเจนว่าเป็น นาย นาง นางสาว หรือยศ)</span></div>
              <div className="thin">ที่อยู่ของผู้มีเงินได้ <span className="muted">(ให้ระบุเลขที่ ตรอก/ซอย ถนน ตำบล/แขวง อำเภอ/เขต จังหวัด)</span></div>
            </th>
            <th colSpan={4} className="c-detail">รายละเอียดเกี่ยวกับการจ่ายเงิน</th>
            <th colSpan={2} className="c-sum">รวมเงินภาษีที่หักและนำส่งในครั้งนี้</th>
          </tr>
          <tr>
            <th className="c-taxid">เลขประจำตัว / สาขาที่</th>
            <th className="c-name">ชื่อ-ที่อยู่</th>
            <th className="c-date">วัน เดือน ปี<br />ที่จ่าย</th>
            <th className="c-type">❶ ประเภทเงินได้</th>
            <th className="c-rate">อัตรา<br />ภาษี<br />ร้อยละ</th>
            <th className="c-amount">จำนวนเงินที่จ่ายแต่ละประเภท<br />เฉพาะคนหนึ่งๆ ในครั้งนี้</th>
            <th className="c-tax">จำนวนเงิน</th>
            <th className="c-cond">❷<br />เงื่อนไข</th>
          </tr>
        </thead>
        <tbody>
          {paddedRows.map((r, i) => (
            <PND3Row key={i} seq={startSeq + i} row={r} />
          ))}
          {/* รวมยอดเงินได้และภาษีที่นำส่ง — ของแผ่นนี้ */}
          <tr className="footer-row">
            <td colSpan={6} className="footer-label">
              รวมยอดเงินได้และภาษีที่นำส่ง <span className="muted">
                (นำไปรวมกับใบแนบ ภ.ง.ด.3 แผ่นอื่น (ถ้ามี))
              </span>
            </td>
            <td className="num">{formatMoneyAlways(sheetTotalIncome)}</td>
            <td className="num">{formatMoneyAlways(sheetTotalWHT)}</td>
            <td></td>
          </tr>
          {isLastSheet && totalSheets > 1 && (
            <tr className="footer-row footer-grand">
              <td colSpan={6} className="footer-label">
                <strong>รวมยอดทั้งสิ้น (ทุกแผ่น)</strong>
              </td>
              <td className="num"><strong>{formatMoneyAlways(grandTotalIncome)}</strong></td>
              <td className="num"><strong>{formatMoneyAlways(grandTotalWHT)}</strong></td>
              <td></td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Notes + Signature row */}
      <div className="bottom-row">
        <div className="notes">
          <div className="notes-line">(ให้กรอกลำดับที่ต่อเนื่องกันไปทุกแผ่นตามเงินได้แต่ละประเภท)</div>
          <div className="notes-title"><u>หมายเหตุ</u></div>
          <div className="notes-item">
            ❶ ให้ระบุว่าจ่ายเป็นค่าอะไร เช่น ค่าเช่าอาคาร ค่าสอบบัญชี ค่าทนายความ ค่าวิชาชีพของแพทย์
            ค่าก่อสร้าง รางวัล ส่วนลดหรือประโยชน์ใดๆ เนื่องจากการส่งเสริมการขาย รางวัลในการประกวด
            การแข่งขัน การชิงโชค ค่าจ้างแสดงภาพยนตร์ ร้องเพลงดนตรี ค่าจ้างทำของ ค่าจ้างโฆษณา ค่าขนส่งสินค้า ฯลฯ
          </div>
          <div className="notes-item">
            ❷ เงื่อนไขการหักภาษีให้กรอกดังนี้:
            <ul>
              <li>หัก ณ ที่จ่าย กรอก 1</li>
              <li>ออกให้ตลอดไป กรอก 2</li>
              <li>ออกให้ครั้งเดียว กรอก 3</li>
            </ul>
          </div>
        </div>
        <div className="signature">
          <div className="sig-stamp">
            <div className="sig-stamp-circle">ประทับตรา<br />นิติบุคคล<br /><span className="muted">(ถ้ามี)</span></div>
          </div>
          <div className="sig-block">
            <div>ลงชื่อ ........................................................... ผู้จ่ายเงิน</div>
            <div className="sig-paren">( ........................................................... )</div>
            <div>ตำแหน่ง ........................................................................</div>
            <div>ยื่นวันที่ .......... เดือน ........................ พ.ศ. ..............</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ----- Single row (1 of 6) -----
function PND3Row({ seq, row }: { seq: number; row: PND3AttachRow | null }) {
  if (!row) {
    // empty row — keep height
    return (
      <tr className="data-row empty-row">
        <td className="c-seq">{seq}</td>
        <td className="c-taxid"></td>
        <td className="c-name"></td>
        <td className="c-date"></td>
        <td className="c-type"></td>
        <td className="c-rate"></td>
        <td className="c-amount"></td>
        <td className="c-tax"></td>
        <td className="c-cond"></td>
      </tr>
    );
  }
  // Row-level: ใช้ text format (กล่อง box เล็กเกินไป — ล้นช่อง)
  const taxIdDisplay = formatTaxIdText(row.taxId);
  const branchDisplay = row.branchLabel || "00000";
  return (
    <tr className="data-row">
      <td className="c-seq">{seq}</td>
      <td className="c-taxid">
        <div className="taxid-text">{taxIdDisplay}</div>
        <div className="taxid-branch-text">
          <span className="muted">สาขา</span> {branchDisplay}
        </div>
      </td>
      <td className="c-name">
        <div className="cell-name">{row.payeeName}</div>
        <div className="cell-addr">{row.address}</div>
      </td>
      <td className="c-date">{formatThaiDateShort(row.paidDate)}</td>
      <td className="c-type">{row.incomeType}</td>
      <td className="c-rate">{row.rate ? row.rate.toFixed(row.rate < 1 ? 2 : 1) : ""}</td>
      <td className="c-amount num">{formatMoney(row.incomeAmount)}</td>
      <td className="c-tax num">{formatMoney(row.whtAmount)}</td>
      <td className="c-cond">{row.condition}</td>
    </tr>
  );
}

// ----- Format helpers -----
function formatTaxIdText(taxId: string): string {
  const d = (taxId || "").replace(/\D/g, "");
  if (d.length !== 13) return taxId || "—";
  return `${d[0]}-${d.slice(1, 5)}-${d.slice(5, 10)}-${d.slice(10, 12)}-${d[12]}`;
}

// ----- Box-row helper (เลขประจำตัว / สาขาที่ — แสดงเป็นกรอบเล็ก) -----
function BoxRow({
  values,
  groupSize,
  small = false,
}: {
  values: string[];
  groupSize?: number[];
  small?: boolean;
}) {
  if (!groupSize) {
    // simple — all boxes contiguous
    return (
      <span className={`boxes ${small ? "boxes-sm" : ""}`}>
        {values.map((v, i) => (
          <span key={i} className="box">{v}</span>
        ))}
      </span>
    );
  }
  // grouped — separator between groups
  const groups: string[][] = [];
  let p = 0;
  for (const g of groupSize) {
    groups.push(values.slice(p, p + g));
    p += g;
  }
  return (
    <span className={`boxes ${small ? "boxes-sm" : ""}`}>
      {groups.map((grp, gi) => (
        <span key={gi} className="box-group">
          {gi > 0 && <span className="box-sep">-</span>}
          {grp.map((v, i) => (
            <span key={i} className="box">{v}</span>
          ))}
        </span>
      ))}
    </span>
  );
}

function EmptyState({ period, monthName, yearTH }: { period: string; monthName: string; yearTH: number }) {
  return (
    <div style={{
      padding: "3rem 2rem", textAlign: "center", fontFamily: "'IBM Plex Sans Thai', sans-serif",
    }}>
      <h2 style={{ fontSize: "1.25rem", marginBottom: "0.5rem" }}>
        ไม่มีรายการหัก ณ ที่จ่าย (ภงด.3) ในเดือน {monthName} {yearTH}
      </h2>
      <p style={{ color: "#64748b", marginBottom: "1.5rem" }}>
        ไม่พบรายการที่จ่ายเงินจริงและมีการหักภาษี ณ ที่จ่าย จากบุคคลธรรมดาในช่วงเวลา {period} ค่ะ
      </p>
      <a href="/reports/wht?tab=pnd3" style={{ color: "#2563eb" }}>← กลับไปรายงาน</a>
    </div>
  );
}

// ----- CSS -----
function DocStyles() {
  return (
    <style jsx global>{`
      :root { color-scheme: light; }

      .print-toolbar {
        position: sticky; top: 0; z-index: 10;
        background: #fff; border-bottom: 1px solid #e2e8f0;
        padding: 12px 24px; display: flex; align-items: center; justify-content: space-between;
        font-family: 'IBM Plex Sans Thai', 'Sarabun', sans-serif;
      }
      .pt-info { display: flex; align-items: center; gap: 16px; }
      .pt-info strong { font-size: 16px; }
      .pt-period { color: #475569; }
      .pt-count { color: #64748b; font-size: 13px; }
      .pt-actions { display: flex; gap: 8px; }
      .pt-btn {
        padding: 8px 16px; border: 1px solid #cbd5e1; border-radius: 6px;
        background: #fff; color: #1e293b; cursor: pointer;
        text-decoration: none; font-family: inherit; font-size: 14px;
      }
      .pt-btn-primary { background: #2563eb; color: #fff; border-color: #2563eb; }
      .pt-btn-primary:hover { background: #1d4ed8; }
      .pt-btn-link { background: #f8fafc; color: #475569; }

      .doc.pnd3-attach-doc {
        font-family: 'IBM Plex Sans Thai', 'Sarabun', sans-serif;
        background: #fff; color: #000;
        width: 297mm;        /* A4 landscape */
        min-height: 210mm;
        padding: 8mm 10mm;
        margin: 16px auto;
        box-sizing: border-box;
        font-size: 10.5px;
        page-break-after: always;
      }
      .doc.pnd3-attach-doc:last-of-type { page-break-after: auto; }

      /* Header */
      .hdr {
        display: flex; align-items: flex-start; justify-content: space-between;
        margin-bottom: 6px;
      }
      .hdr-left { flex: 1; }
      .hdr-title { font-size: 18px; font-weight: 700; }
      .hdr-form {
        display: inline-block; padding: 2px 12px; border: 2px solid #000; border-radius: 4px;
        margin-left: 8px;
      }
      .hdr-taxid {
        margin-top: 4px; display: flex; flex-wrap: wrap; align-items: center; gap: 6px;
      }
      .hdr-taxid-label { font-weight: 500; }
      .hdr-taxid-sub { color: #555; font-size: 9px; }
      .hdr-branch-label { margin-left: 12px; }
      .hdr-right { text-align: right; }
      .hdr-page { font-size: 11px; }
      .u-cell {
        display: inline-block; min-width: 36px; text-align: center;
        text-decoration: none; border-bottom: 1px solid #000;
        padding: 0 4px; font-weight: 600;
      }

      /* Boxes (เลข 13 หลัก / สาขา 5 หลัก) */
      .boxes { display: inline-flex; align-items: center; gap: 1px; }
      .box {
        display: inline-block; width: 14px; height: 18px;
        border: 1px solid #000; text-align: center;
        font-size: 11px; line-height: 18px; font-weight: 600;
      }
      .boxes-sm .box { width: 11px; height: 14px; font-size: 9px; line-height: 14px; }
      .box-group { display: inline-flex; align-items: center; gap: 1px; }
      .box-sep { padding: 0 1px; font-weight: 600; }

      /* Main rows table */
      .rows {
        width: 100%; border-collapse: collapse;
        table-layout: fixed; margin-top: 4px;
      }
      .rows th, .rows td {
        border: 1px solid #000;
        padding: 3px 4px;
        vertical-align: top;
        font-size: 10px;
      }
      .rows th {
        background: #fff; font-weight: 600; text-align: center;
        font-size: 9.5px; line-height: 1.2;
        padding: 4px 3px;
      }
      .rows .thin { font-weight: 400; font-size: 9px; }
      .rows .muted { color: #555; font-size: 8.5px; font-weight: 400; }

      /* Column widths (sum = 100%) */
      .c-seq    { width: 4%; text-align: center; vertical-align: middle; font-weight: 600; }
      .c-taxid  { width: 22%; }
      .c-name   { width: 24%; }
      .c-date   { width: 8%; text-align: center; vertical-align: middle; }
      .c-type   { width: 14%; }
      .c-rate   { width: 5%; text-align: center; vertical-align: middle; }
      .c-amount { width: 10%; text-align: right; vertical-align: middle; }
      .c-tax    { width: 9%; text-align: right; vertical-align: middle; }
      .c-cond   { width: 4%; text-align: center; vertical-align: middle; }
      .c-payee  { /* colspan header — no width */ }
      .c-detail { /* colspan header — no width */ }
      .c-sum    { /* colspan header — no width */ }

      /* Data row cells */
      .data-row td { height: 38px; }
      .empty-row td { height: 38px; color: transparent; }
      .cell-name { font-weight: 500; margin-bottom: 2px; }
      .cell-addr { font-size: 9px; color: #333; }
      .num { font-feature-settings: "tnum"; text-align: right; }
      .taxid-branch { display: flex; align-items: center; gap: 4px; margin-top: 2px; }
      .taxid-text {
        font-family: 'Courier New', monospace; font-size: 10px;
        font-weight: 600; letter-spacing: 0.5px;
      }
      .taxid-branch-text {
        font-family: 'Courier New', monospace; font-size: 9.5px;
        margin-top: 2px; color: #333;
      }

      /* Footer rows */
      .footer-row td { background: #f8fafc; height: 24px; }
      .footer-label { text-align: right; padding-right: 8px !important; }
      .footer-grand td { background: #f1f5f9; }

      /* Notes + Signature row */
      .bottom-row {
        display: flex; gap: 12px; margin-top: 8px;
      }
      .notes { flex: 2; font-size: 9.5px; line-height: 1.4; }
      .notes-line { font-style: italic; margin-bottom: 4px; }
      .notes-title { font-weight: 600; margin-bottom: 2px; }
      .notes-item { margin-bottom: 4px; }
      .notes-item ul { margin: 2px 0 0 16px; padding: 0; }
      .signature {
        flex: 1; display: flex; gap: 8px; align-items: flex-start;
      }
      .sig-stamp {
        flex: 0 0 80px; display: flex; justify-content: center; align-items: center;
      }
      .sig-stamp-circle {
        width: 70px; height: 70px; border: 1px dashed #888; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        text-align: center; font-size: 8.5px; line-height: 1.3; color: #666;
        padding: 4px;
      }
      .sig-block { flex: 1; font-size: 10px; line-height: 1.9; }
      .sig-paren { padding-left: 36px; color: #333; }

      /* Print rules */
      @media print {
        @page { size: A4 landscape; margin: 6mm; }
        body { background: #fff !important; }
        .no-print { display: none !important; }
        .doc.pnd3-attach-doc {
          margin: 0; box-shadow: none; padding: 6mm 8mm;
          width: 100%; min-height: auto;
        }
      }

      @media screen {
        body { background: #f1f5f9; }
        .doc.pnd3-attach-doc {
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }
      }
    `}</style>
  );
}
