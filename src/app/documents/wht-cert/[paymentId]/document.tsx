"use client";

import { useEffect, useState } from "react";
import type { WhtIncomeSection } from "@/lib/wht-doc-utils";
import { saveDocumentPdf, runAutoSaveIfRequested } from "@/lib/utils/save-doc-pdf";

interface WthCertProps {
  docNumber: { book: string; number: string };
  pndForm: "3" | "53"; // ภ.ง.ด.3 (บุคคล) / ภ.ง.ด.53 (นิติบุคคล)
  incomeSection: WhtIncomeSection; // section ในฟอร์มที่ amount จะใส่
  incomeLabel: string; // label ของประเภทเงินได้ (แสดงใน section 5/6)
  payer: { name: string; taxId: string; address: string; branchInfo: string };
  payee: { name: string; taxId: string; address: string; branchInfo: string };
  payment: {
    paymentId: string;
    description: string;
    paymentDate: string;
    totalBeforeTax: number;
    wthRate: number;
    wthAmount: number;
    eventName: string;
  };
}

export function WthCertDocument({
  docNumber,
  pndForm,
  incomeSection,
  incomeLabel,
  payer,
  payee,
  payment,
}: WthCertProps) {
  const handlePrint = () => window.print();

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
        selector: ".wth-doc",
        paymentId: payment.paymentId,
        docType: "wht-cert",
        docDate: payment.paymentDate,
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

  // Auto-save mode: ?auto=1 → auto-trigger save (รอ fonts + DOM ready) + postMessage to parent
  useEffect(() => {
    runAutoSaveIfRequested({
      selector: ".wth-doc",
      paymentId: payment.paymentId,
      docType: "wht-cert",
      docDate: payment.paymentDate,
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

  // ช่วย render amount เฉพาะ section ที่ตรง
  const amt = (forSection: WhtIncomeSection) =>
    incomeSection === forSection ? formatMoney(payment.totalBeforeTax) : "";
  const tax = (forSection: WhtIncomeSection) =>
    incomeSection === forSection ? formatMoney(payment.wthAmount) : "";
  const dateCol = (forSection: WhtIncomeSection) =>
    incomeSection === forSection ? formatThaiDate(payment.paymentDate) : "";

  const CheckBox = ({ checked, children }: { checked: boolean; children: React.ReactNode }) => (
    <span className="cb">
      <span className={`cb-box ${checked ? "checked" : ""}`}>{checked ? "✓" : ""}</span>
      <span>{children}</span>
    </span>
  );

  return (
    <>
      {/* Print controls */}
      <div
        className="doc-actions no-print"
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
        <button onClick={handlePrint} className="app-btn app-btn-secondary">
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

      <div className="wth-doc">
        {/* Top: copy info + title + book/number */}
        <div className="wth-top">
          <div className="wth-copies">
            <div>ฉบับที่ 1 (สำหรับผู้ถูกหักภาษี ณ ที่จ่าย ใช้แนบพร้อมกับแบบแสดงรายการภาษี)</div>
            <div>ฉบับที่ 2 (สำหรับผู้ถูกหักภาษี ณ ที่จ่าย เก็บไว้เป็นหลักฐาน)</div>
          </div>
          <div className="wth-title-wrap">
            <div className="wth-title">หนังสือรับรองการหักภาษี ณ ที่จ่าย</div>
            <div className="wth-subtitle">ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร</div>
          </div>
          <div className="wth-bn">
            <div>เล่มที่ <span className="ul">{docNumber.book}</span></div>
            <div>เลขที่ <span className="ul mono">{docNumber.number}</span></div>
          </div>
        </div>

        {/* Main box with inner border */}
        <div className="wth-box">
          {/* ผู้มีหน้าที่หักภาษี ณ ที่จ่าย */}
          <div className="wth-party">
            <div className="party-row">
              <div className="party-label">ผู้มีหน้าที่หักภาษี ณ ที่จ่าย :-</div>
              <div className="tax-boxes">
                <span className="tax-boxes-label">เลขประจำตัวผู้เสียภาษีอากร (13 หลัก)</span>
                <TaxIdBoxes taxId={payer.taxId} />
              </div>
            </div>
            <div className="party-row">
              <div className="field-label">ชื่อ</div>
              <div className="field-value">
                {payer.name}
                {payer.branchInfo ? ` (${payer.branchInfo})` : ""}
              </div>
            </div>
            <div className="party-hint">(ให้ระบุว่าเป็น บุคคล นิติบุคคล บริษัท สมาคม หรือคณะบุคคล)</div>
            <div className="party-row">
              <div className="field-label">ที่อยู่</div>
              <div className="field-value">{payer.address || "—"}</div>
            </div>
            <div className="party-hint">(ให้ระบุชื่ออาคาร/หมู่บ้าน ห้องเลขที่ ชั้น เลขที่ ตรอก/ซอย หมู่ที่ ถนน ตำบล/แขวง อำเภอ/เขต จังหวัด)</div>
          </div>

          {/* ผู้ถูกหักภาษี ณ ที่จ่าย */}
          <div className="wth-party">
            <div className="party-row">
              <div className="party-label">ผู้ถูกหักภาษี ณ ที่จ่าย :-</div>
              <div className="tax-boxes">
                <span className="tax-boxes-label">เลขประจำตัวผู้เสียภาษีอากร (13 หลัก)</span>
                <TaxIdBoxes taxId={payee.taxId} />
              </div>
            </div>
            <div className="party-row">
              <div className="field-label">ชื่อ</div>
              <div className="field-value">
                {payee.name || "—"}
                {payee.branchInfo ? ` (${payee.branchInfo})` : ""}
              </div>
            </div>
            <div className="party-hint">(ให้ระบุว่าเป็น บุคคล นิติบุคคล บริษัท สมาคม หรือคณะบุคคล)</div>
            <div className="party-row">
              <div className="field-label">ที่อยู่</div>
              <div className="field-value">{payee.address || "—"}</div>
            </div>
            <div className="party-hint">(ให้ระบุชื่ออาคาร/หมู่บ้าน ห้องเลขที่ ชั้น เลขที่ ตรอก/ซอย หมู่ที่ ถนน ตำบล/แขวง อำเภอ/เขต จังหวัด)</div>
          </div>

          {/* ลำดับที่ในแบบ ภ.ง.ด. */}
          <div className="wth-form-row">
            <div className="field-label">ลำดับที่ <span className="ul mono">&nbsp;&nbsp;1&nbsp;&nbsp;</span> ในแบบ</div>
            <div className="form-checks">
              <CheckBox checked={false}>(1) ภ.ง.ด.1ก</CheckBox>
              <CheckBox checked={false}>(2) ภ.ง.ด.1ก พิเศษ</CheckBox>
              <CheckBox checked={false}>(3) ภ.ง.ด.2</CheckBox>
              <CheckBox checked={pndForm === "3"}>(4) ภ.ง.ด.3</CheckBox>
              <CheckBox checked={false}>(5) ภ.ง.ด.2ก</CheckBox>
              <CheckBox checked={false}>(6) ภ.ง.ด.3ก</CheckBox>
              <CheckBox checked={pndForm === "53"}>(7) ภ.ง.ด.53</CheckBox>
            </div>
          </div>

          {/* Detail table */}
          <table className="wth-table">
            <thead>
              <tr>
                <th style={{ width: "52%" }}>ประเภทเงินได้พึงประเมินที่จ่าย</th>
                <th style={{ width: "14%" }}>วัน เดือน<br />หรือปีภาษี ที่จ่าย</th>
                <th style={{ width: "17%" }} className="text-right">จำนวนเงินที่จ่าย</th>
                <th style={{ width: "17%" }} className="text-right">ภาษีที่หัก<br />และนำส่งไว้</th>
              </tr>
            </thead>
            <tbody>
              {/* Section 1 — เงินเดือน */}
              <tr>
                <td>1. เงินเดือน ค่าจ้าง เบี้ยเลี้ยง โบนัส ฯลฯ ตามมาตรา 40 (1)</td>
                <td>{dateCol("1")}</td>
                <td className="text-right num">{amt("1")}</td>
                <td className="text-right num">{tax("1")}</td>
              </tr>
              {/* Section 2 — ค่าธรรมเนียม ค่านายหน้า */}
              <tr>
                <td>2. ค่าธรรมเนียม ค่านายหน้า ฯลฯ ตามมาตรา 40 (2)</td>
                <td>{dateCol("2")}</td>
                <td className="text-right num">{amt("2")}</td>
                <td className="text-right num">{tax("2")}</td>
              </tr>
              {/* Section 3 — ค่าลิขสิทธิ์ */}
              <tr>
                <td>3. ค่าแห่งลิขสิทธิ์ ฯลฯ ตามมาตรา 40 (3)</td>
                <td>{dateCol("3")}</td>
                <td className="text-right num">{amt("3")}</td>
                <td className="text-right num">{tax("3")}</td>
              </tr>
              {/* Section 4(a) — ดอกเบี้ย */}
              <tr>
                <td>4. (ก) ดอกเบี้ย ฯลฯ ตามมาตรา 40 (4) (ก)</td>
                <td>{dateCol("4a")}</td>
                <td className="text-right num">{amt("4a")}</td>
                <td className="text-right num">{tax("4a")}</td>
              </tr>
              {/* Section 4(b) — เงินปันผล */}
              <tr>
                <td>
                  &nbsp;&nbsp;&nbsp;(ข) เงินปันผล เงินส่วนแบ่งกำไร ฯลฯ ตามมาตรา 40 (4) (ข)
                  <div className="sub-hint">(กรณีผู้ได้รับเงินปันผลได้รับ/ไม่ได้รับเครดิตภาษี — ดูรายละเอียดในฟอร์มทางการ)</div>
                </td>
                <td>{dateCol("4b")}</td>
                <td className="text-right num">{amt("4b")}</td>
                <td className="text-right num">{tax("4b")}</td>
              </tr>
              {/* Section 5 — ตามคำสั่ง 3 เตรส */}
              <tr>
                <td>
                  5. การจ่ายเงินได้ที่ต้องหักภาษี ณ ที่จ่าย ตามคำสั่งกรมสรรพากรที่ออกตามมาตรา 3 เตรส
                  {incomeSection === "5" && (
                    <div className="sub-hint">
                      → {incomeLabel}
                      {payment.description ? ` • ${payment.description}` : ""}
                      {payment.eventName ? ` • ${payment.eventName}` : ""}
                    </div>
                  )}
                  <div className="sub-hint" style={{ opacity: 0.75 }}>
                    เช่น รางวัล ส่วนลด ค่าแสดง ค่าจ้างทำของ ค่าโฆษณา ค่าเช่า ค่าขนส่ง ค่าบริการ ฯลฯ
                  </div>
                </td>
                <td>{dateCol("5")}</td>
                <td className="text-right num">{amt("5")}</td>
                <td className="text-right num">{tax("5")}</td>
              </tr>
              {/* Section 6 — อื่น ๆ */}
              <tr>
                <td>
                  6. อื่น ๆ (ระบุ)
                  {incomeSection === "6" && (
                    <span className="ul" style={{ marginLeft: "0.5rem" }}>
                      {incomeLabel}
                      {payment.description ? ` — ${payment.description}` : ""}
                    </span>
                  )}
                </td>
                <td>{dateCol("6")}</td>
                <td className="text-right num">{amt("6")}</td>
                <td className="text-right num">{tax("6")}</td>
              </tr>
              {/* รวม */}
              <tr className="wth-total-row">
                <td colSpan={2} className="text-right"><strong>รวมเงินที่จ่ายและภาษีที่หักนำส่ง</strong></td>
                <td className="text-right num"><strong>{formatMoney(payment.totalBeforeTax)}</strong></td>
                <td className="text-right num"><strong>{formatMoney(payment.wthAmount)}</strong></td>
              </tr>
            </tbody>
          </table>

          {/* รวมเงินภาษีที่หักนำส่ง (ตัวอักษร) */}
          <div className="wth-words">
            <span>รวมเงินภาษีที่หักนำส่ง (ตัวอักษร)</span>
            <span className="ul flex-fill">{bahtText(payment.wthAmount)}</span>
          </div>

          {/* เงินที่จ่ายเข้ากองทุนต่าง ๆ */}
          <div className="wth-funds">
            <span>เงินที่จ่ายเข้า กบข./กสจ./กองทุนสงเคราะห์ครูโรงเรียนเอกชน</span>
            <span className="ul mono" style={{ minWidth: 60 }}>—</span>
            <span>บาท กองทุนประกันสังคม</span>
            <span className="ul mono" style={{ minWidth: 60 }}>—</span>
            <span>บาท กองทุนสำรองเลี้ยงชีพ</span>
            <span className="ul mono" style={{ minWidth: 60 }}>—</span>
            <span>บาท</span>
          </div>

          {/* ผู้จ่ายเงิน */}
          <div className="wth-payer">
            <div className="field-label">ผู้จ่ายเงิน</div>
            <div className="form-checks">
              <CheckBox checked={true}>(1) หัก ณ ที่จ่าย</CheckBox>
              <CheckBox checked={false}>(2) ออกให้ตลอดไป</CheckBox>
              <CheckBox checked={false}>(3) ออกให้ครั้งเดียว</CheckBox>
              <CheckBox checked={false}>(4) อื่น ๆ (ระบุ) ...................</CheckBox>
            </div>
          </div>

          {/* คำเตือน + ลงชื่อ */}
          <div className="wth-bottom">
            <div className="wth-warning">
              <div className="warn-title">คำเตือน</div>
              <div>ผู้มีหน้าที่ออกหนังสือรับรองการหักภาษี ณ ที่จ่าย</div>
              <div>ฝ่าฝืนไม่ปฏิบัติตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร</div>
              <div>ต้องรับโทษทางอาญาตามมาตรา 35 แห่งประมวลรัษฎากร</div>
            </div>
            <div className="wth-confirm">
              <div className="confirm-text">ขอรับรองว่าข้อความและตัวเลขดังกล่าวข้างต้นถูกต้องตรงกับความจริงทุกประการ</div>
              <div className="sig-row">
                <div className="sig-line">ลงชื่อ .................................................................</div>
                <div className="sig-label">ผู้จ่ายเงิน</div>
              </div>
              <div className="sig-date">
                วันที่ {formatThaiDate(payment.paymentDate)}
                <span style={{ fontSize: "0.7rem", color: "#64748b", marginLeft: "0.5rem" }}>(วัน เดือน ปีที่ออกหนังสือรับรองฯ)</span>
              </div>
              <div className="stamp-placeholder">
                <div>ประทับตรา<br />นิติบุคคล<br />(ถ้ามี)</div>
              </div>
            </div>
          </div>
        </div>

        {/* หมายเหตุ */}
        <div className="wth-note">
          <strong>หมายเหตุ</strong> เลขประจำตัวผู้เสียภาษีอากร (13 หลัก)* หมายถึง
          <div>1. กรณีบุคคลธรรมดาไทย ให้ใช้เลขประจำตัวประชาชนของกรมการปกครอง</div>
          <div>2. กรณีนิติบุคคล ให้ใช้เลขทะเบียนนิติบุคคลของกรมพัฒนาธุรกิจการค้า</div>
          <div>3. กรณีอื่น ๆ นอกเหนือจาก 1. และ 2. ให้ใช้เลขประจำตัวผู้เสียภาษีอากร (13 หลัก) ของกรมสรรพากร</div>
        </div>

        {/* Footer */}
        <div className="wth-footer" suppressHydrationWarning>
          ออกโดยระบบ Aim Expense{printedAt ? ` • ${printedAt}` : ""} • Payment ID: {payment.paymentId}
        </div>
      </div>

      <style jsx>{`
        .wth-doc {
          max-width: 210mm;
          margin: 1.5rem auto;
          background: white;
          padding: 1.5rem;
          box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
          font-family: "IBM Plex Sans Thai", "Sarabun", sans-serif;
          color: #0f172a;
          font-size: 0.8125rem;
          line-height: 1.5;
        }

        .wth-top {
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          gap: 1rem;
          align-items: start;
          margin-bottom: 1rem;
        }

        .wth-copies {
          font-size: 0.6875rem;
          color: #475569;
          line-height: 1.5;
        }

        .wth-title-wrap {
          text-align: center;
          white-space: nowrap;
        }

        .wth-title {
          font-size: 1.25rem;
          font-weight: 700;
        }

        .wth-subtitle {
          font-size: 0.75rem;
          color: #475569;
        }

        .wth-bn {
          text-align: right;
          font-size: 0.8125rem;
          display: grid;
          gap: 0.25rem;
        }

        .ul {
          text-decoration: underline;
          font-weight: 500;
          padding: 0 0.25rem;
        }

        .flex-fill {
          flex: 1;
        }

        .mono {
          font-family: ui-monospace, "Courier New", monospace;
        }

        .wth-box {
          border: 1.5px solid #0f172a;
          padding: 0.75rem;
        }

        .wth-party {
          border-bottom: 1px solid #cbd5e1;
          padding-bottom: 0.5rem;
          margin-bottom: 0.75rem;
        }

        .party-row {
          display: flex;
          gap: 0.5rem;
          align-items: baseline;
          margin-bottom: 0.25rem;
          flex-wrap: wrap;
        }

        .party-label {
          font-weight: 700;
          font-size: 0.875rem;
        }

        .field-label {
          font-weight: 500;
          min-width: 44px;
        }

        .field-value {
          flex: 1;
          border-bottom: 1px dotted #94a3b8;
          padding: 0 0.25rem;
        }

        .party-hint {
          font-size: 0.6875rem;
          color: #64748b;
          font-style: italic;
          margin: 0.125rem 0 0.375rem 44px;
        }

        .tax-boxes {
          display: flex;
          gap: 0.375rem;
          align-items: center;
          margin-left: auto;
        }

        .tax-boxes-label {
          font-size: 0.6875rem;
          color: #475569;
        }

        .wth-form-row {
          display: flex;
          gap: 0.5rem;
          align-items: center;
          margin: 0.75rem 0;
          flex-wrap: wrap;
        }

        .form-checks {
          display: flex;
          gap: 0.875rem;
          flex-wrap: wrap;
        }

        .cb {
          display: inline-flex;
          gap: 0.3125rem;
          align-items: center;
          font-size: 0.8125rem;
        }

        .cb-box {
          display: inline-block;
          width: 14px;
          height: 14px;
          border: 1.25px solid #0f172a;
          text-align: center;
          line-height: 12px;
          font-size: 11px;
          font-weight: 700;
          color: #0f172a;
        }

        .cb-box.checked {
          background: #fff;
        }

        .wth-table {
          width: 100%;
          border-collapse: collapse;
          margin: 0.75rem 0 0.5rem;
        }

        .wth-table th {
          background: #f1f5f9;
          padding: 0.375rem 0.5rem;
          border: 1px solid #0f172a;
          font-size: 0.75rem;
          font-weight: 600;
          text-align: left;
          line-height: 1.3;
        }

        .wth-table th.text-right,
        .wth-table td.text-right {
          text-align: right;
        }

        .wth-table td {
          padding: 0.375rem 0.5rem;
          border: 1px solid #0f172a;
          font-size: 0.75rem;
          vertical-align: top;
          line-height: 1.4;
        }

        .wth-table .num {
          font-variant-numeric: tabular-nums;
        }

        .sub-hint {
          font-size: 0.6875rem;
          color: #475569;
          margin-top: 0.125rem;
        }

        .wth-total-row {
          background: #f8fafc;
        }

        .wth-words {
          padding: 0.375rem 0.5rem;
          border: 1px solid #0f172a;
          border-top: 0;
          display: flex;
          gap: 0.5rem;
          font-size: 0.8125rem;
          align-items: baseline;
        }

        .wth-funds {
          padding: 0.375rem 0.5rem;
          border: 1px solid #0f172a;
          border-top: 0;
          font-size: 0.75rem;
          display: flex;
          gap: 0.25rem;
          align-items: baseline;
          flex-wrap: wrap;
        }

        .wth-payer {
          padding: 0.5rem 0.5rem;
          border: 1px solid #0f172a;
          border-top: 0;
          display: flex;
          gap: 0.75rem;
          align-items: center;
          flex-wrap: wrap;
        }

        .wth-bottom {
          display: grid;
          grid-template-columns: 1fr 1.25fr;
          gap: 0.5rem;
          border: 1px solid #0f172a;
          border-top: 0;
          padding: 0.5rem;
        }

        .wth-warning {
          font-size: 0.6875rem;
          color: #334155;
          line-height: 1.5;
        }

        .warn-title {
          font-weight: 700;
          margin-bottom: 0.25rem;
        }

        .wth-confirm {
          position: relative;
        }

        .confirm-text {
          font-size: 0.75rem;
          margin-bottom: 1.5rem;
        }

        .sig-row {
          display: flex;
          gap: 0.375rem;
          align-items: baseline;
          margin-bottom: 0.25rem;
        }

        .sig-line {
          flex: 1;
          font-size: 0.8125rem;
        }

        .sig-label {
          font-size: 0.8125rem;
        }

        .sig-date {
          font-size: 0.8125rem;
          margin-left: 44px;
        }

        .stamp-placeholder {
          position: absolute;
          bottom: 0;
          right: 0;
          width: 80px;
          height: 80px;
          border: 1px dashed #94a3b8;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: center;
          font-size: 0.5625rem;
          color: #94a3b8;
          line-height: 1.3;
        }

        .wth-note {
          font-size: 0.6875rem;
          color: #334155;
          margin-top: 0.75rem;
          padding: 0.5rem;
          background: #f8fafc;
          border-radius: 0.25rem;
          line-height: 1.6;
        }

        .wth-footer {
          margin-top: 0.75rem;
          font-size: 0.625rem;
          color: #94a3b8;
          text-align: center;
        }

        @media print {
          .wth-doc {
            box-shadow: none;
            margin: 0;
            padding: 0;
            max-width: 100%;
            font-size: 0.75rem;
          }
          body {
            background: white !important;
          }
          @page {
            size: A4;
            margin: 10mm 12mm;
          }
        }
      `}</style>
    </>
  );
}

// 13-box grid for tax ID
function TaxIdBoxes({ taxId }: { taxId: string }) {
  const digits = (taxId || "").replace(/\D/g, "").slice(0, 13).padEnd(13, " ");
  const arr = digits.split("");
  return (
    <span style={{ display: "inline-flex", gap: "1px" }}>
      {arr.map((d, i) => (
        <span
          key={i}
          style={{
            display: "inline-block",
            minWidth: "14px",
            height: "18px",
            border: "1px solid #0f172a",
            textAlign: "center",
            fontSize: "11px",
            lineHeight: "16px",
            fontFamily: "ui-monospace, monospace",
            padding: "0 1px",
          }}
        >
          {d.trim() || "\u00A0"}
        </span>
      ))}
    </span>
  );
}

function formatMoney(n: number): string {
  if (!n) return "";
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
    const day = d.getDate();
    const months = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
    const month = months[d.getMonth()];
    const year = d.getFullYear() + 543;
    return `${day} ${month} ${year}`;
  } catch {
    return iso;
  }
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
