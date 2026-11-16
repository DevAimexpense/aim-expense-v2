"use client";

import { useState } from "react";
import Link from "next/link";
import { yearMonthBangkok, formatDate } from "@/lib/utils/date";
import { trpc } from "@/lib/trpc/client";
import DateInput from "@/components/shared/date-input";

const formatTHB = (n: number) =>
  n.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

// เดือนปัจจุบันตามเวลาไทย (เดิม toISOString = UTC → วันสิ้นเดือนเพี้ยนเป็นวันก่อนหน้า) DOC-05
function firstOfThisMonth() {
  return `${yearMonthBangkok()}-01`;
}
function lastOfThisMonth() {
  const ym = yearMonthBangkok();
  const [y, m] = ym.split("-").map(Number);
  const days = new Date(y, m, 0).getDate(); // วันที่ 0 ของเดือนถัดไป = วันสุดท้ายของเดือนนี้
  return `${ym}-${String(days).padStart(2, "0")}`;
}

type Tab = "input" | "output" | "summary";

export function Vat30Client({ orgName }: { orgName: string }) {
  const [from, setFrom] = useState(firstOfThisMonth());
  const [to, setTo] = useState(lastOfThisMonth());
  const [tab, setTab] = useState<Tab>("summary");

  const q = trpc.report.vat30.useQuery({ from, to });
  const utils = trpc.useUtils();
  const linkMut = trpc.taxInvoice.linkSource.useMutation();
  const [linkError, setLinkError] = useState<string | null>(null);

  // SALE-01c/01d: ผูกใบกำกับที่ออกแยกไว้กับใบเสร็จ/ใบวางบิล → ภาษีขายนับครั้งเดียว
  const handleLink = async (taxInvoiceId: string, tiNo: string, billingId: string, docNo: string) => {
    if (!window.confirm(`ผูกใบกำกับภาษี ${tiNo} กับ ${docNo}?\nยืนยันเมื่อเป็นการขายรายการเดียวกันเท่านั้น — ภาษีขายจะนับที่ใบกำกับครั้งเดียว`)) return;
    setLinkError(null);
    try {
      await linkMut.mutateAsync({ taxInvoiceId, billingId });
      await utils.report.vat30.invalidate();
    } catch (e) {
      setLinkError(e instanceof Error ? e.message : "ผูกไม่สำเร็จ");
    }
  };

  return (
    <div className="app-page">
      <div className="app-page-header">
        <div>
          <h1 className="app-page-title">📈 รายงาน ภ.พ.30 (รวม)</h1>
          <p className="app-page-subtitle">
            {orgName} · ภาษีซื้อ + ภาษีขาย + สรุป net
          </p>
        </div>
      </div>

      {/* Filter row */}
      <div
        className="app-filter-row"
        style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}
      >
        <DateInput
          value={from}
          onChange={(v) => setFrom(v)}
          className="app-input"
          style={{ maxWidth: "180px" }}
        />
        <DateInput
          value={to}
          onChange={(v) => setTo(v)}
          className="app-input"
          style={{ maxWidth: "180px" }}
        />
        <button
          onClick={() => {
            setFrom(firstOfThisMonth());
            setTo(lastOfThisMonth());
          }}
          className="app-btn app-btn-ghost app-btn-sm"
        >
          เดือนนี้
        </button>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: "0.25rem",
          borderBottom: "1px solid #e2e8f0",
          marginBottom: "1rem",
        }}
      >
        <TabButton current={tab} value="summary" onClick={setTab}>
          📊 สรุป
        </TabButton>
        <TabButton current={tab} value="output" onClick={setTab}>
          💰 ภาษีขาย ({q.data?.output.totalCount ?? "-"})
        </TabButton>
        <TabButton current={tab} value="input" onClick={setTab}>
          🛒 ภาษีซื้อ ({q.data?.input.totalCount ?? "-"})
        </TabButton>
      </div>

      {linkError && <div className="app-error-msg">{linkError}</div>}

      {/* SALE-01c/01d: แจ้งเตือนที่ต้องจัดการก่อนยื่น */}
      {q.data && (q.data.output.possibleDuplicates > 0 || q.data.uncoveredReceipts.rows.length > 0) && (
        <div
          className="app-card"
          style={{ marginBottom: "1rem", background: "#fffbeb", border: "1px solid #fcd34d", fontSize: "0.875rem", color: "#92400e" }}
        >
          <strong>⚠️ ตรวจก่อนยื่น ภ.พ.30</strong>
          {q.data.output.possibleDuplicates > 0 && (
            <div>
              · มีใบเสร็จ {q.data.output.possibleDuplicates} ใบที่น่าจะนับซ้ำกับใบกำกับภาษีที่ออกแยกไว้ (ลูกค้าและ VAT ตรงกัน) —
              ดูแท็บภาษีขาย แล้วกด &ldquo;ผูก&rdquo; ถ้าเป็นการขายรายการเดียวกัน
            </div>
          )}
          {q.data.uncoveredReceipts.rows.length > 0 && (
            <div>
              · มีใบเสร็จจากใบวางบิลที่มี VAT แต่ยังไม่มีใบกำกับภาษี {q.data.uncoveredReceipts.rows.length} ใบ
              (VAT {formatTHB(q.data.uncoveredReceipts.totalVAT)} บาท) — <strong>ยังไม่รวมในยอดภาษีขาย</strong> ต้องออกใบกำกับภาษีก่อน
            </div>
          )}
        </div>
      )}

      {q.isLoading ? (
        <div className="app-card">
          <div className="app-skeleton" style={{ height: "200px" }} />
        </div>
      ) : !q.data ? (
        <div className="app-card">ไม่มีข้อมูล</div>
      ) : tab === "summary" ? (
        <SummaryTab data={q.data} />
      ) : tab === "output" ? (
        <>
          <OutputTab
            rows={q.data.output.rows}
            totals={q.data.output}
            onLink={handleLink}
            linking={linkMut.isPending}
          />
          <UncoveredReceipts
            rows={q.data.uncoveredReceipts.rows}
            totalVAT={q.data.uncoveredReceipts.totalVAT}
            onLink={handleLink}
            linking={linkMut.isPending}
          />
        </>
      ) : (
        <InputTab rows={q.data.input.rows} totals={q.data.input} />
      )}
    </div>
  );
}

function TabButton({
  current,
  value,
  onClick,
  children,
}: {
  current: string;
  value: Tab;
  onClick: (t: Tab) => void;
  children: React.ReactNode;
}) {
  const active = current === value;
  return (
    <button
      onClick={() => onClick(value)}
      style={{
        padding: "0.5rem 0.875rem",
        fontSize: "0.875rem",
        fontWeight: active ? 700 : 500,
        color: active ? "#0f172a" : "#64748b",
        background: "transparent",
        border: "none",
        borderBottom: `2px solid ${active ? "#2563eb" : "transparent"}`,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function SummaryTab({
  data,
}: {
  data: {
    input: { totalCount: number; totalBase: number; totalVAT: number };
    output: { totalCount: number; totalBase: number; totalVAT: number };
    net: {
      netVAT: number;
      direction: "pay" | "carry_forward" | "balanced";
      inputTotalVAT: number;
      outputTotalVAT: number;
    };
  };
}) {
  const { input, output, net } = data;

  const directionLabel =
    net.direction === "pay"
      ? "ต้องเสียเพิ่ม (Pay to Revenue Dept)"
      : net.direction === "carry_forward"
        ? "ภาษีคงเหลือยกไป (Carry-forward credit)"
        : "ยอดสมดุล";
  const directionColor =
    net.direction === "pay"
      ? "#dc2626"
      : net.direction === "carry_forward"
        ? "#16a34a"
        : "#475569";

  return (
    <div className="app-section cols-2">
      <div className="app-card">
        <div className="app-card-header">
          <h2 className="app-card-title">💰 ภาษีขาย (Output VAT)</h2>
        </div>
        <div style={{ fontSize: "0.875rem", lineHeight: 1.8 }}>
          <div>
            <strong>จำนวนใบกำกับภาษีที่ออก:</strong> {output.totalCount} ใบ
            <span style={{ color: "#64748b", fontSize: "0.8125rem" }}> (รวมใบเสร็จที่มี VAT)</span>
          </div>
          <div>
            <strong>ฐานภาษี (รวม):</strong>{" "}
            <span className="num">{formatTHB(output.totalBase)}</span> บาท
          </div>
          <div
            style={{
              fontSize: "1.125rem",
              fontWeight: 700,
              color: "#b91c1c",
              marginTop: "0.5rem",
            }}
          >
            ภาษีขาย: {formatTHB(output.totalVAT)} บาท
          </div>
        </div>
      </div>

      <div className="app-card">
        <div className="app-card-header">
          <h2 className="app-card-title">🛒 ภาษีซื้อ (Input VAT)</h2>
        </div>
        <div style={{ fontSize: "0.875rem", lineHeight: 1.8 }}>
          <div>
            <strong>จำนวนใบกำกับภาษีรับ:</strong> {input.totalCount} ใบ
          </div>
          <div>
            <strong>ฐานภาษี (รวม):</strong>{" "}
            <span className="num">{formatTHB(input.totalBase)}</span> บาท
          </div>
          <div
            style={{
              fontSize: "1.125rem",
              fontWeight: 700,
              color: "#2563eb",
              marginTop: "0.5rem",
            }}
          >
            ภาษีซื้อ: {formatTHB(input.totalVAT)} บาท
          </div>
        </div>
      </div>

      <div
        className="app-card"
        style={{
          gridColumn: "1 / -1",
          borderLeft: `6px solid ${directionColor}`,
        }}
      >
        <div className="app-card-header">
          <h2 className="app-card-title">⚖️ Net VAT (ภาษีขาย − ภาษีซื้อ)</h2>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "1rem",
          }}
        >
          <div style={{ fontSize: "0.875rem", lineHeight: 1.6 }}>
            <div>
              ภาษีขาย: <strong>{formatTHB(net.outputTotalVAT)}</strong> บาท
            </div>
            <div>
              ภาษีซื้อ: <strong>{formatTHB(net.inputTotalVAT)}</strong> บาท
            </div>
            <div style={{ marginTop: "0.25rem", color: directionColor }}>
              <strong>{directionLabel}</strong>
            </div>
          </div>
          <div
            style={{
              fontSize: "2rem",
              fontWeight: 800,
              color: directionColor,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {net.netVAT >= 0 ? "+" : "−"}
            {formatTHB(Math.abs(net.netVAT))}
          </div>
        </div>
      </div>
    </div>
  );
}

type LinkCandidate = { taxInvoiceId: string; docNumber: string; date: string };
type OnLink = (taxInvoiceId: string, tiNo: string, billingId: string, docNo: string) => void;

function LinkButtons({
  candidates,
  billingId,
  docNo,
  onLink,
  linking,
}: {
  candidates: LinkCandidate[];
  billingId: string;
  docNo: string;
  onLink: OnLink;
  linking: boolean;
}) {
  if (candidates.length === 0) return null;
  return (
    <div style={{ fontSize: "0.75rem", color: "#b45309", marginTop: "0.25rem" }}>
      อาจซ้ำกับใบกำกับที่ออกแยกไว้:{" "}
      {candidates.map((c) => (
        <button
          key={c.taxInvoiceId}
          type="button"
          className="app-btn app-btn-ghost app-btn-sm"
          style={{ padding: "0 0.375rem", fontSize: "0.75rem" }}
          disabled={linking}
          onClick={() => onLink(c.taxInvoiceId, c.docNumber, billingId, docNo)}
          title={`ใบกำกับลงวันที่ ${c.date ? formatDate(c.date) : "-"}`}
        >
          🔗 ผูก {c.docNumber}
        </button>
      ))}
    </div>
  );
}

/** SALE-01d: ใบเสร็จจากใบวางบิลที่มี VAT แต่ยังไม่มีใบกำกับ — รายการยกเว้น (ไม่รวมในยอด) */
function UncoveredReceipts({
  rows,
  totalVAT,
  onLink,
  linking,
}: {
  rows: {
    billingId: string;
    billingNumber: string;
    receiptNumber: string;
    date: string;
    customerName: string;
    baseAmount: number;
    vatAmount: number;
    linkCandidates: LinkCandidate[];
  }[];
  totalVAT: number;
  onLink: OnLink;
  linking: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="app-card" style={{ marginTop: "1rem", padding: 0, overflowX: "auto" }}>
      <div className="app-card-header" style={{ padding: "1rem 1rem 0" }}>
        <h2 className="app-card-title">⚠️ ใบเสร็จที่มี VAT แต่ยังไม่มีใบกำกับภาษี (ยังไม่รวมในยอดด้านบน)</h2>
      </div>
      <p style={{ padding: "0 1rem", fontSize: "0.8125rem", color: "#64748b" }}>
        ค่าบริการถึงจุดต้องเสีย VAT เมื่อรับเงิน — ออกใบกำกับภาษีลงวันที่รับเงินจากหน้าใบวางบิล หรือผูกกับใบกำกับที่ออกไว้แล้ว
      </p>
      <table className="app-table" style={{ width: "100%" }}>
        <thead>
          <tr>
            <th>วันที่รับเงิน</th>
            <th>ใบเสร็จ / ใบวางบิล</th>
            <th>ลูกค้า</th>
            <th className="text-right">ฐานภาษี</th>
            <th className="text-right">VAT</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.billingId}>
              <td>{formatDate(r.date)}</td>
              <td className="mono">
                {r.receiptNumber}
                <div style={{ fontSize: "0.75rem" }}>
                  <Link href={`/billings/${r.billingId}`} style={{ color: "#2563eb" }}>
                    {r.billingNumber} → ออกใบกำกับภาษี
                  </Link>
                </div>
                <LinkButtons
                  candidates={r.linkCandidates}
                  billingId={r.billingId}
                  docNo={r.billingNumber}
                  onLink={onLink}
                  linking={linking}
                />
              </td>
              <td>{r.customerName}</td>
              <td className="text-right num">{formatTHB(r.baseAmount)}</td>
              <td className="text-right num">{formatTHB(r.vatAmount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ fontWeight: 700, background: "#fffbeb" }}>
            <td colSpan={4}>VAT ที่ยังไม่มีใบกำกับ {rows.length} ใบ</td>
            <td className="text-right num">{formatTHB(totalVAT)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function OutputTab({
  rows,
  totals,
  onLink,
  linking,
}: {
  rows: {
    taxInvoiceId: string;
    kind?: "tax_invoice" | "receipt";
    receiptMode?: "combined" | "separate";
    docNumber: string;
    date: string;
    customerName: string;
    customerTaxId: string;
    baseAmount: number;
    vatAmount: number;
    linkCandidates?: LinkCandidate[];
  }[];
  totals: { totalBase: number; totalVAT: number; totalCount: number };
  onLink: OnLink;
  linking: boolean;
}) {
  if (rows.length === 0) {
    return (
      <div className="app-card">
        <div className="app-empty">
          <div className="app-empty-icon">💰</div>
          <p className="app-empty-title">ยังไม่มีใบกำกับภาษีขายในช่วงนี้</p>
          <p className="app-empty-desc">ออกใบกำกับภาษีจากเมนู &ldquo;ใบกำกับภาษี&rdquo;</p>
        </div>
      </div>
    );
  }
  return (
    <div className="app-table-wrap">
      <table className="app-table">
        <thead>
          <tr>
            <th>วันที่</th>
            <th>เลขใบกำกับภาษี</th>
            <th>ลูกค้า</th>
            <th>เลขผู้เสียภาษี</th>
            <th className="text-right">ฐานภาษี</th>
            <th className="text-right">ภาษีขาย 7%</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.taxInvoiceId}>
              <td>{formatDate(r.date)}</td>
              <td className="mono">
                {r.docNumber}
                {r.kind === "receipt" && (
                  <div style={{ fontSize: "0.75rem", color: r.receiptMode === "combined" ? "#64748b" : "#b45309" }}>
                    {r.receiptMode === "combined"
                      ? "ใบเสร็จรับเงิน/ใบกำกับภาษี"
                      : "ใบเสร็จ — ยังไม่มีใบกำกับภาษีคู่"}
                  </div>
                )}
                {r.kind === "receipt" && (
                  <LinkButtons
                    candidates={r.linkCandidates || []}
                    billingId={r.taxInvoiceId}
                    docNo={r.docNumber}
                    onLink={onLink}
                    linking={linking}
                  />
                )}
              </td>
              <td>{r.customerName}</td>
              <td className="mono" style={{ fontSize: "0.8125rem" }}>
                {r.customerTaxId}
              </td>
              <td className="text-right num">{formatTHB(r.baseAmount)}</td>
              <td className="text-right num">{formatTHB(r.vatAmount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ fontWeight: 700, background: "#f8fafc" }}>
            <td colSpan={4}>รวม {totals.totalCount} ใบ</td>
            <td className="text-right num">{formatTHB(totals.totalBase)}</td>
            <td className="text-right num">{formatTHB(totals.totalVAT)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function InputTab({
  rows,
  totals,
}: {
  rows: {
    paymentId: string;
    date: string;
    invoiceNumber: string;
    receiptNumber: string;
    payeeName: string;
    taxId: string;
    baseAmount: number;
    vatAmount: number;
  }[];
  totals: { totalBase: number; totalVAT: number; totalCount: number };
}) {
  if (rows.length === 0) {
    return (
      <div className="app-card">
        <div className="app-empty">
          <div className="app-empty-icon">🛒</div>
          <p className="app-empty-title">ยังไม่มีใบกำกับภาษีซื้อในช่วงนี้</p>
          <p className="app-empty-desc">
            บันทึกค่าใช้จ่ายที่มี DocumentType=tax_invoice และ status=paid
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="app-table-wrap">
      <table className="app-table">
        <thead>
          <tr>
            <th>วันที่</th>
            <th>เลขใบกำกับภาษี</th>
            <th>ผู้รับเงิน</th>
            <th>เลขผู้เสียภาษี</th>
            <th className="text-right">ฐานภาษี</th>
            <th className="text-right">ภาษีซื้อ 7%</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.paymentId}>
              <td>{r.date}</td>
              <td className="mono">
                {r.receiptNumber || r.invoiceNumber || "—"}
              </td>
              <td>{r.payeeName}</td>
              <td className="mono" style={{ fontSize: "0.8125rem" }}>
                {r.taxId}
              </td>
              <td className="text-right num">{formatTHB(r.baseAmount)}</td>
              <td className="text-right num">{formatTHB(r.vatAmount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ fontWeight: 700, background: "#f8fafc" }}>
            <td colSpan={4}>รวม {totals.totalCount} ใบ</td>
            <td className="text-right num">{formatTHB(totals.totalBase)}</td>
            <td className="text-right num">{formatTHB(totals.totalVAT)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
