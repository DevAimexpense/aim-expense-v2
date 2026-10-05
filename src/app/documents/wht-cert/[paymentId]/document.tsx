"use client";

import { useEffect, useState } from "react";
import type { WhtIncomeSection } from "@/lib/wht-doc-utils";
import { saveDocumentPdf, runAutoSaveIfRequested } from "@/lib/utils/save-doc-pdf";
import { formatDate as formatThaiDate, formatDateTime } from "@/lib/utils/date";

interface WthCertProps {
  docNumber: { book: string; number: string };
  pndForm: "3" | "53"; // ภ.ง.ด.3 (บุคคล) / ภ.ง.ด.53 (นิติบุคคล)
  incomeSection: WhtIncomeSection; // section ในฟอร์มที่ amount จะใส่
  incomeLabel: string; // label ของประเภทเงินได้ (แสดงใน section 5/6)
  payer: {
    name: string;
    taxId: string;
    address: string;
    branchInfo: string;
    signatureUrl?: string | null;
  };
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
    setPrintedAt(formatDateTime(new Date()));
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

  // ลำดับที่ในแบบ ภ.ง.ด. = ลำดับ running ของเดือน (ส่วนท้ายของเลขที่เอกสาร)
  const seqInForm = String(parseInt(docNumber.number.split("/")[1] || "1", 10) || 1);

  // วัน เดือน ปี (พ.ศ.) ที่ออกหนังสือรับรอง
  const issuedDate = new Date(payment.paymentDate);
  const issued = isNaN(issuedDate.getTime())
    ? { day: "", month: "", year: "" }
    : {
        day: String(issuedDate.getDate()),
        month: THAI_MONTHS[issuedDate.getMonth()],
        year: String(issuedDate.getFullYear() + 543),
      };

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

      {/* ฟอร์มทางการของกรมสรรพากร (หนังสือรับรอง 50 ทวิ — approve_wh3_081156) เป็นพื้นหลัง
          แล้ววางข้อมูลทับตามตำแหน่งช่อง · พิกัดอ้างอิงจากภาพ 2480×3509 px (A4 @300dpi) */}
      <div className="wth-doc">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/forms/wht-50tawi.png" alt="" className="wth-bg" />

        {/* เล่มที่ / เลขที่ */}
        <F x={2175} y={256} w={180} h={50}>{docNumber.book}</F>
        <F x={2175} y={316} w={180} h={50} mono>{docNumber.number}</F>

        {/* ผู้มีหน้าที่หักภาษี ณ ที่จ่าย */}
        <TaxIdDigits taxId={payer.taxId} centers={PAYER_TAXID_X} y={403} />
        <F x={215} y={490} w={1085} h={52}>
          {payer.name}
          {payer.branchInfo ? ` (${payer.branchInfo})` : ""}
        </F>
        <F x={245} y={586} w={2040} h={52} size={12}>{payer.address}</F>

        {/* ผู้ถูกหักภาษี ณ ที่จ่าย */}
        <TaxIdDigits taxId={payee.taxId} centers={PAYEE_TAXID_X} y={691} />
        <F x={215} y={795} w={1090} h={52}>
          {payee.name}
          {payee.branchInfo ? ` (${payee.branchInfo})` : ""}
        </F>
        <F x={250} y={901} w={2035} h={52} size={12}>{payee.address}</F>

        {/* ลำดับที่ + แบบ ภ.ง.ด. */}
        <F x={322} y={1002} w={250} h={59} align="center" mono middle>{seqInForm}</F>
        {pndForm === "3" && <Tick x={1968} y={950} />}
        {pndForm === "53" && <Tick x={1647} y={1027} />}

        {/* ประเภทเงินได้ — ลงเฉพาะบรรทัดที่ตรงกับประเภท */}
        <MoneyRow
          y={ROW_Y[incomeSection]}
          date={formatThaiDate(payment.paymentDate)}
          amount={payment.totalBeforeTax}
          tax={payment.wthAmount}
        />
        {incomeSection === "6" && (
          <F x={420} y={2675} w={720} h={48} size={11.5}>
            {incomeLabel}
            {payment.description ? ` — ${payment.description}` : ""}
          </F>
        )}

        {/* รวม */}
        <MoneyRow y={2756} amount={payment.totalBeforeTax} tax={payment.wthAmount} bold />
        <F x={785} y={2845} w={1525} h={66} middle>{bahtText(payment.wthAmount)}</F>

        {/* ผู้จ่ายเงิน: (1) หัก ณ ที่จ่าย */}
        <Tick x={345} y={2960} />

        {/* ลงชื่อ + วันที่ออกหนังสือรับรอง */}
        {payer.signatureUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={payer.signatureUrl}
            alt=""
            style={{
              position: "absolute",
              left: 1560 * K,
              top: (3152 - 120) * K,
              height: 120 * K,
              maxWidth: 420 * K,
              objectFit: "contain",
            }}
          />
        )}
        <F x={1388} y={3194} w={144} h={46} align="center" size={12}>{issued.day}</F>
        <F x={1543} y={3194} w={219} h={46} align="center" size={12}>{issued.month}</F>
        <F x={1773} y={3194} w={213} h={46} align="center" size={12}>{issued.year}</F>
      </div>

      <div className="wth-footer no-print" suppressHydrationWarning>
        ออกโดยระบบ Aim Expense{printedAt ? ` • ${printedAt}` : ""} • Payment ID: {payment.paymentId}
      </div>

      <style jsx global>{`
        .wth-doc {
          position: relative;
          width: 794px; /* A4 @96dpi */
          height: 1122px;
          margin: 1.5rem auto 0.5rem;
          background: white;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
          color: #0f172a;
          overflow: hidden;
        }
        .wth-doc .wth-bg {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
        }
        .wth-footer {
          font-size: 0.625rem;
          color: #94a3b8;
          text-align: center;
          margin-bottom: 1.5rem;
        }
        @media print {
          .no-print {
            display: none !important;
          }
          .wth-doc {
            box-shadow: none;
            margin: 0;
          }
          body {
            background: white !important;
          }
          @page {
            size: A4;
            margin: 0;
          }
        }
      `}</style>
    </>
  );
}

// ===== ตำแหน่งบนฟอร์ม (px ของภาพ 2480×3509) =====

/** อัตราส่วน px จอ : px ภาพฟอร์ม */
const K = 794 / 2480;

/** กึ่งกลางช่องเลขประจำตัวผู้เสียภาษี 13 หลัก (1-4-5-2-1) */
const PAYER_TAXID_X = [1585, 1660, 1710, 1760, 1810, 1889, 1939, 1989, 2039, 2089, 2165, 2215, 2294];
const PAYEE_TAXID_X = [1589, 1664, 1714, 1764, 1814, 1890, 1941, 1992, 2043, 2094, 2166, 2218, 2298];

/** เส้นบรรทัดของแต่ละประเภทเงินได้ (4b ลงที่ (1.4) อัตราอื่น ๆ) */
const ROW_Y: Record<WhtIncomeSection, number> = {
  "1": 1285,
  "2": 1347,
  "3": 1406,
  "4a": 1468,
  "4b": 1889,
  "5": 2614,
  "6": 2677,
};

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

/** กล่องข้อความวางทับฟอร์ม — (x, y) = มุมซ้ายล่าง (y คือเส้นบรรทัด), w/h เป็น px ของภาพฟอร์ม */
function F({
  x,
  y,
  w,
  h,
  align = "left",
  size = 13,
  mono,
  bold,
  middle,
  children,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  align?: "left" | "center" | "right";
  size?: number;
  mono?: boolean;
  bold?: boolean;
  /** จัดกึ่งกลางแนวตั้ง (ใช้กับข้อความในช่องสี่เหลี่ยม) — ปกติชิดเส้นบรรทัดล่าง */
  middle?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: x * K,
        top: (y - h) * K,
        width: w * K,
        height: h * K,
        display: "flex",
        alignItems: middle ? "center" : "flex-end",
        justifyContent:
          align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start",
        fontSize: size,
        lineHeight: 1.15,
        fontWeight: bold ? 700 : 500,
        fontFamily: mono ? "ui-monospace, SFMono-Regular, Menlo, monospace" : undefined,
        whiteSpace: "nowrap",
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  );
}

/** เครื่องหมายถูกในช่องสี่เหลี่ยม 50×50 — (x, y) = มุมซ้ายบนของช่อง */
function Tick({ x, y }: { x: number; y: number }) {
  return (
    <F x={x} y={y + 50} w={50} h={50} align="center" size={15} bold middle>
      ✓
    </F>
  );
}

function TaxIdDigits({ taxId, centers, y }: { taxId: string; centers: number[]; y: number }) {
  const digits = (taxId || "").replace(/\D/g, "").slice(0, 13).split("");
  return (
    <>
      {digits.map((d, i) => (
        <F key={i} x={centers[i] - 25} y={y + 2} w={50} h={58} align="center" size={14} mono middle>
          {d}
        </F>
      ))}
    </>
  );
}

/** แถวตัวเลข: วันที่ | จำนวนเงิน (บาท | สตางค์) | ภาษี (บาท | สตางค์) */
function MoneyRow({
  y,
  date,
  amount,
  tax,
  bold,
}: {
  y: number;
  date?: string;
  amount: number;
  tax: number;
  bold?: boolean;
}) {
  const a = splitMoney(amount);
  const t = splitMoney(tax);
  const yy = y - 3;
  return (
    <>
      {date && <F x={1364} y={yy} w={325} h={48} align="center" size={11.5}>{date}</F>}
      <F x={1695} y={yy} w={278} h={48} align="right" size={12} bold={bold}>{a.baht}</F>
      <F x={1981} y={yy} w={61} h={48} align="center" size={12} bold={bold}>{a.satang}</F>
      <F x={2048} y={yy} w={221} h={48} align="right" size={12} bold={bold}>{t.baht}</F>
      <F x={2277} y={yy} w={59} h={48} align="center" size={12} bold={bold}>{t.satang}</F>
    </>
  );
}

function splitMoney(n: number): { baht: string; satang: string } {
  const cents = Math.round((n || 0) * 100);
  return {
    baht: Math.floor(cents / 100).toLocaleString("en-US"),
    satang: String(cents % 100).padStart(2, "0"),
  };
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
