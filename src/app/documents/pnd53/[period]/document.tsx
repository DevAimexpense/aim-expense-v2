"use client";

// ===========================================
// ภ.ง.ด.53 ใบสรุปยอดเดือน — Client document
// A4 portrait, 1 หน้า
// แตกต่างจาก ภ.ง.ด.3:
//   - Title + กฎหมายที่ใช้ (มาตรา 3 เตรส, 69 ทวิ, 65 จัตวา)
//   - "นำส่งภาษีตาม" 3 options ต่างกัน
// ===========================================

import { useEffect, useState } from "react";
import {
  splitTaxIdBoxes,
  splitBranchBoxes,
  formatMoneyAlways,
  parseAddressFields,
  formatBuddhistYear,
} from "@/lib/wht-form-utils";

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
  stats: {
    totalCount: number;
    totalIncome: number;
    totalWHT: number;
    totalSheets: number;
  };
}

export function PND53SummaryDocument({ period, periodInfo, org, stats }: Props) {
  const handlePrint = () => window.print();

  const [printedAt, setPrintedAt] = useState("");
  useEffect(() => {
    setPrintedAt(new Date().toLocaleString("th-TH"));
  }, []);

  const orgTaxBoxes = splitTaxIdBoxes(org.taxId);
  const orgBranchLabel =
    org.branchType === "HQ" ? "00000" :
    org.branchType === "Branch" ? (org.branchNumber || "").padStart(5, "0") :
    "00000";
  const orgBranchBoxes = splitBranchBoxes(orgBranchLabel);
  const addr = parseAddressFields(org.address);

  return (
    <>
      <SummaryStyles />

      <div className="print-toolbar no-print">
        <div className="pt-info">
          <strong>ภ.ง.ด.53 ใบสรุปยอดเดือน</strong>
          <span className="pt-period">{periodInfo.monthName} {periodInfo.yearTH}</span>
          <span className="pt-count">{stats.totalCount} รายการ</span>
        </div>
        <div className="pt-actions">
          <button onClick={handlePrint} className="pt-btn pt-btn-primary">
            🖨️ พิมพ์ / บันทึกเป็น PDF
          </button>
          <a href="/reports/wht?tab=pnd53" className="pt-btn pt-btn-link">
            ← กลับไปรายงาน
          </a>
        </div>
      </div>

      <div className="doc pnd-summary-doc">
        <div className="banner">
          <div className="banner-left">
            <div className="banner-title">แบบยื่นรายการภาษีเงินได้หัก ณ ที่จ่าย</div>
            <div className="banner-sub">ตามมาตรา 3 เตรส และมาตรา 69 ทวิ</div>
            <div className="banner-sub thin">
              และการเสียภาษีตามมาตรา 65 จัตวา แห่งประมวลรัษฎากร
            </div>
          </div>
          <div className="banner-form">
            <div className="form-name">ภ.ง.ด.53</div>
          </div>
        </div>

        <div className="body-grid">
          <div className="col col-left">
            <div className="field-row">
              <div className="field-label">เลขประจำตัวผู้เสียภาษีอากร</div>
              <div className="field-sub">(ของผู้มีหน้าที่หักภาษี ณ ที่จ่าย)</div>
              <div className="field-input">
                <BoxRow values={orgTaxBoxes} groupSize={[1, 4, 5, 2, 1]} />
              </div>
            </div>

            <div className="field-row two-cols">
              <div className="grow">
                <div className="field-label">ชื่อผู้มีหน้าที่หักภาษี ณ ที่จ่าย <span className="muted">(หน่วยงาน)</span> :</div>
                <div className="field-line strong-line">{org.name || "—"}</div>
              </div>
              <div>
                <div className="field-label">สาขาที่</div>
                <div className="field-input">
                  <BoxRow values={orgBranchBoxes} />
                </div>
              </div>
            </div>

            <div className="field-row">
              <div className="field-label">ที่อยู่ :</div>
              <div className="addr-grid">
                <span>อาคาร</span><span className="addr-line"></span>
                <span>ห้องเลขที่</span><span className="addr-line addr-sm"></span>
                <span>ชั้นที่</span><span className="addr-line addr-sm"></span>
                <span>หมู่บ้าน</span><span className="addr-line"></span>
              </div>
              <div className="addr-grid">
                <span>เลขที่</span><span className="addr-line">{addr.raw && !addr.subdistrict ? addr.raw : addr.houseNo}</span>
                <span>หมู่ที่</span><span className="addr-line addr-sm"></span>
                <span>ตรอก/ซอย</span><span className="addr-line">{addr.soi}</span>
                <span>แยก</span><span className="addr-line addr-sm"></span>
              </div>
              <div className="addr-grid">
                <span>ถนน</span><span className="addr-line">{addr.road}</span>
                <span>ตำบล/แขวง</span><span className="addr-line">{addr.subdistrict}</span>
              </div>
              <div className="addr-grid">
                <span>อำเภอ/เขต</span><span className="addr-line">{addr.district}</span>
                <span>จังหวัด</span><span className="addr-line">{addr.province}</span>
              </div>
              <div className="addr-grid">
                <span>รหัสไปรษณีย์</span>
                <span className="addr-postal">{addr.postalCode}</span>
              </div>
            </div>

            <div className="field-row check-line">
              <span className="cb cb-checked"><span className="cb-box checked">✓</span></span>
              <span className="cb-label"><strong>ยื่นปกติ</strong></span>
              <span className="cb cb-line">
                <span className="cb-box"></span>
                <span className="cb-label">ยื่นเพิ่มเติมครั้งที่</span>
                <span className="addr-line addr-sm"></span>
              </span>
            </div>

            <div className="field-row">
              <div className="field-thin">
                มีรายละเอียดการหักเป็นรายผู้มีเงินได้ ปรากฏตาม
              </div>
              <div className="field-thin muted">
                (ให้แสดงรายละเอียดในใบแนบ ภ.ง.ด.53 หรือในสื่อบันทึกในระบบคอมพิวเตอร์อย่างใดอย่างหนึ่งเท่านั้น)
              </div>
              <div className="attach-row">
                <span className="cb cb-checked"><span className="cb-box checked">✓</span></span>
                <span><strong>ใบแนบ ภ.ง.ด.53</strong> ที่แนบมาพร้อมนี้ :</span>
                <span className="grow"></span>
                <span>จำนวน <u className="u-cell">{stats.totalCount}</u> ราย</span>
                <span>จำนวน <u className="u-cell">{stats.totalSheets}</u> แผ่น</span>
              </div>
              <div className="attach-row" style={{ paddingLeft: 24 }}>หรือ</div>
              <div className="attach-row">
                <span className="cb"><span className="cb-box"></span></span>
                <span>สื่อบันทึกในระบบคอมพิวเตอร์ ที่แนบมาพร้อมนี้ :</span>
                <span className="grow"></span>
                <span>จำนวน <span className="addr-line addr-xs"></span> ราย</span>
                <span>จำนวน <span className="addr-line addr-xs"></span> แผ่น</span>
              </div>
              <div className="field-thin muted small-italic">
                (ตามหนังสือแสดงความประสงค์ฯ ทะเบียนรับเลขที่ ............ หรือตามหนังสือข้อตกลงการใช้งานฯ เลขอ้างอิงการลงทะเบียน .............)
              </div>
            </div>
          </div>

          <div className="col col-right">
            <div className="month-block">
              <div className="field-label">นำส่งภาษีตาม</div>
              <div className="check-stack">
                <span className="cb">
                  <span className="cb-box"></span>
                  <span className="cb-label">(1) มาตรา 3 เตรส แห่งประมวลรัษฎากร</span>
                </span>
                <span className="cb">
                  <span className="cb-box"></span>
                  <span className="cb-label">(2) มาตรา 65 จัตวา แห่งประมวลรัษฎากร</span>
                </span>
                <span className="cb">
                  <span className="cb-box"></span>
                  <span className="cb-label">(3) มาตรา 69 ทวิ แห่งประมวลรัษฎากร</span>
                </span>
              </div>
            </div>

            <div className="month-block">
              <div className="field-label">เดือนที่จ่ายเงินได้พึงประเมิน</div>
              <div className="field-sub">
                (ให้ทำเครื่องหมาย "✓" ลงใน "☐" หน้าชื่อเดือน) พ.ศ. <u className="u-cell">{formatBuddhistYear(periodInfo.year)}</u>
              </div>
              <div className="months-grid">
                {[
                  ["(1)", "มกราคม", 1], ["(4)", "เมษายน", 4], ["(7)", "กรกฎาคม", 7], ["(10)", "ตุลาคม", 10],
                  ["(2)", "กุมภาพันธ์", 2], ["(5)", "พฤษภาคม", 5], ["(8)", "สิงหาคม", 8], ["(11)", "พฤศจิกายน", 11],
                  ["(3)", "มีนาคม", 3], ["(6)", "มิถุนายน", 6], ["(9)", "กันยายน", 9], ["(12)", "ธันวาคม", 12],
                ].map(([num, label, monthNum], i) => {
                  const isChecked = periodInfo.month === monthNum;
                  return (
                    <span key={i} className="month-item">
                      <span className={`cb-box ${isChecked ? "checked" : ""}`}>
                        {isChecked ? "✓" : ""}
                      </span>
                      <span className="month-label">{num} {label}</span>
                    </span>
                  );
                })}
              </div>
            </div>

            <div className="tcl-note muted">สำหรับบันทึกข้อมูลจากระบบ TCL</div>
          </div>
        </div>

        <table className="summary-table">
          <thead>
            <tr>
              <th className="summary-col-label">สรุปรายการภาษีที่นำส่ง</th>
              <th className="summary-col-amount">จำนวนเงิน</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>1. รวมยอดเงินได้ทั้งสิ้น . . . . . . . . . . . . . . . . . . . .</td>
              <td className="num">{formatMoneyAlways(stats.totalIncome)}</td>
            </tr>
            <tr>
              <td>2. รวมยอดภาษีที่นำส่งทั้งสิ้น . . . . . . . . . . . . . . . .</td>
              <td className="num">{formatMoneyAlways(stats.totalWHT)}</td>
            </tr>
            <tr>
              <td>3. เงินเพิ่ม <span className="muted">(ถ้ามี)</span> . . . . . . . . . . . . . . . . . . . . . . . . .</td>
              <td className="num"></td>
            </tr>
            <tr>
              <td><strong>4. รวมยอดภาษีที่นำส่งทั้งสิ้น และเงินเพิ่ม (2. + 3.)</strong></td>
              <td className="num"><strong>{formatMoneyAlways(stats.totalWHT)}</strong></td>
            </tr>
          </tbody>
        </table>

        <div className="cert-line">
          ข้าพเจ้าขอรับรองว่า รายการที่แจ้งไว้ข้างต้นนี้ เป็นรายการที่ถูกต้องและครบถ้วนทุกประการ
        </div>

        <div className="signature-row">
          <div className="signature-block">
            <div>ลงชื่อ ......................................................................... ผู้จ่ายเงิน</div>
            <div className="sig-paren">( ......................................................................... )</div>
            <div>ตำแหน่ง ........................................................................</div>
            <div>ยื่นวันที่ .......... เดือน ........................ พ.ศ. ..............</div>
          </div>
          <div className="stamp-circle">
            ประทับตรา<br />นิติบุคคล<br />
            <span className="muted">(ถ้ามี)</span>
          </div>
        </div>

        <div className="bottom-meta">
          <div className="muted small">(ก่อนกรอกรายการ ดูคำชี้แจงด้านหลัง)</div>
          <div className="muted small italic">
            สอบถามข้อมูลเพิ่มเติมได้ที่ศูนย์สารนิเทศสรรพากร RD Intelligence Center โทร. 1161
          </div>
        </div>
      </div>
    </>
  );
}

function BoxRow({ values, groupSize }: { values: string[]; groupSize?: number[] }) {
  if (!groupSize) {
    return (
      <span className="boxes">
        {values.map((v, i) => (<span key={i} className="box">{v}</span>))}
      </span>
    );
  }
  const groups: string[][] = [];
  let p = 0;
  for (const g of groupSize) { groups.push(values.slice(p, p + g)); p += g; }
  return (
    <span className="boxes">
      {groups.map((grp, gi) => (
        <span key={gi} className="box-group">
          {gi > 0 && <span className="box-sep">-</span>}
          {grp.map((v, i) => (<span key={i} className="box">{v}</span>))}
        </span>
      ))}
    </span>
  );
}

function SummaryStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;600;700&display=swap');
      :root { color-scheme: light; }

      .print-toolbar {
        position: sticky; top: 0; z-index: 10;
        background: #fff; border-bottom: 1px solid #e2e8f0;
        padding: 12px 24px; display: flex; align-items: center; justify-content: space-between;
        font-family: 'Sarabun', sans-serif;
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

      .doc.pnd-summary-doc {
        font-family: 'Sarabun', sans-serif;
        background: #fff; color: #000;
        width: 210mm; min-height: 297mm;
        padding: 12mm 14mm; margin: 16px auto;
        box-sizing: border-box;
        font-size: 12px;
      }

      .banner {
        display: flex; gap: 12px; padding-bottom: 6px; margin-bottom: 8px;
        border-bottom: 1px solid #1e3a8a;
      }
      .banner-left { flex: 1; padding: 8px; background: #f0f7ff; border: 1px solid #1e3a8a; border-radius: 4px; }
      .banner-title { font-weight: 700; font-size: 13px; }
      .banner-sub { font-size: 11px; }
      .banner-sub.thin { font-size: 10px; color: #1e3a8a; }
      .banner-form {
        flex: 0 0 110px; display: flex; align-items: center; justify-content: center;
        background: #fff; border: 2px solid #1e3a8a; border-radius: 8px;
      }
      .form-name { font-size: 26px; font-weight: 700; color: #1e3a8a; letter-spacing: 2px; }

      .body-grid {
        display: grid; grid-template-columns: 1.4fr 1fr;
        gap: 12px; margin-bottom: 8px;
      }
      .col { display: flex; flex-direction: column; gap: 6px; }

      .field-row { display: flex; flex-direction: column; gap: 2px; padding: 2px 0; }
      .field-row.two-cols { flex-direction: row; gap: 8px; align-items: flex-end; }
      .field-row.two-cols .grow { flex: 1; }
      .field-row.check-line { flex-direction: row; gap: 8px; flex-wrap: wrap; align-items: center; padding: 4px 0; }
      .field-label { font-weight: 600; font-size: 11px; }
      .field-sub { font-size: 9.5px; color: #555; }
      .field-thin { font-size: 11px; }
      .field-line { border-bottom: 1px solid #1e3a8a; min-height: 18px; padding: 1px 4px; }
      .strong-line { font-weight: 600; }
      .field-input { display: inline-flex; }

      .addr-grid { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; padding: 1px 0; font-size: 11px; }
      .addr-line { flex: 1; min-width: 60px; border-bottom: 1px dotted #1e3a8a; padding: 0 4px; min-height: 16px; }
      .addr-line.addr-sm { flex: 0 0 50px; }
      .addr-line.addr-xs { flex: 0 0 30px; display: inline-block; }
      .addr-postal { display: inline-flex; align-items: center; gap: 1px; }

      .boxes { display: inline-flex; align-items: center; gap: 1px; }
      .box {
        display: inline-block; width: 16px; height: 18px;
        border: 1px solid #1e3a8a; text-align: center;
        font-size: 11px; line-height: 18px; font-weight: 600;
      }
      .box-group { display: inline-flex; align-items: center; gap: 1px; }
      .box-sep { padding: 0 2px; font-weight: 600; }

      .cb { display: inline-flex; align-items: center; gap: 4px; }
      .cb-line { display: inline-flex; align-items: center; gap: 4px; flex: 1; min-width: 200px; }
      .cb-box {
        display: inline-block; width: 14px; height: 14px;
        border: 1px solid #1e3a8a; text-align: center; line-height: 14px;
        font-size: 10px; font-weight: 700;
      }
      .cb-box.checked { background: #fff; color: #000; }
      .cb-label { font-size: 11px; }
      .check-stack { display: flex; flex-direction: column; gap: 6px; padding: 6px 0; }

      .attach-row { display: flex; align-items: center; gap: 8px; padding: 2px 0; font-size: 10.5px; }
      .u-cell {
        display: inline-block; min-width: 38px; text-align: center;
        text-decoration: none; border-bottom: 1px solid #1e3a8a;
        padding: 0 4px; font-weight: 600;
      }
      .small-italic { font-style: italic; font-size: 9.5px; }

      .month-block {
        background: #f0f7ff; border: 1px dashed #1e3a8a;
        border-radius: 4px; padding: 8px;
      }
      .months-grid {
        display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px;
        margin-top: 6px;
      }
      .month-item { display: flex; align-items: center; gap: 4px; font-size: 10.5px; }
      .month-label { white-space: nowrap; }

      .tcl-note { text-align: center; font-size: 10px; padding: 6px; }

      .summary-table { width: 100%; border-collapse: collapse; margin-top: 4px; }
      .summary-table th {
        background: #f0f7ff; border: 1px solid #1e3a8a;
        padding: 4px 8px; font-size: 12px; text-align: center; color: #1e3a8a;
      }
      .summary-table .summary-col-label { width: 70%; }
      .summary-table .summary-col-amount { width: 30%; }
      .summary-table td { border: 1px solid #1e3a8a; padding: 4px 12px; font-size: 11.5px; }
      .summary-table td.num { text-align: right; font-feature-settings: "tnum"; min-width: 120px; }
      .num { font-feature-settings: "tnum"; }

      .cert-line { text-align: center; margin-top: 12px; font-size: 11.5px; }
      .signature-row {
        display: flex; align-items: flex-start; justify-content: center;
        gap: 24px; margin-top: 8px;
      }
      .signature-block { flex: 0 0 360px; line-height: 2; font-size: 11.5px; }
      .sig-paren { padding-left: 60px; color: #333; }
      .stamp-circle {
        flex: 0 0 90px; height: 90px; border: 1px dashed #888; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        text-align: center; font-size: 9.5px; line-height: 1.4; color: #666;
      }

      .bottom-meta {
        display: flex; justify-content: space-between; align-items: center;
        margin-top: 12px; padding-top: 8px; border-top: 1px solid #e2e8f0;
      }
      .small { font-size: 10px; }
      .italic { font-style: italic; }
      .muted { color: #555; }
      .grow { flex: 1; }

      @media print {
        @page { size: A4 portrait; margin: 6mm; }
        body { background: #fff !important; }
        .no-print { display: none !important; }
        .doc.pnd-summary-doc {
          margin: 0; box-shadow: none; padding: 8mm 10mm;
          width: 100%; min-height: auto;
        }
      }

      @media screen {
        body { background: #f1f5f9; }
        .doc.pnd-summary-doc { box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1); }
      }
    `}</style>
  );
}
