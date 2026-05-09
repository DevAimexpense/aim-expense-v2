"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";

const formatTHB = (n: number) =>
  n.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

function firstOfThisMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function lastOfThisMonth() {
  const d = new Date();
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return last.toISOString().slice(0, 10);
}

type Tab = "input" | "output" | "summary";

export function Vat30Client({ orgName }: { orgName: string }) {
  const [from, setFrom] = useState(firstOfThisMonth());
  const [to, setTo] = useState(lastOfThisMonth());
  const [tab, setTab] = useState<Tab>("summary");

  const q = trpc.report.vat30.useQuery({ from, to });

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
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="app-input"
          style={{ maxWidth: "180px" }}
        />
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
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

      {q.isLoading ? (
        <div className="app-card">
          <div className="app-skeleton" style={{ height: "200px" }} />
        </div>
      ) : !q.data ? (
        <div className="app-card">ไม่มีข้อมูล</div>
      ) : tab === "summary" ? (
        <SummaryTab data={q.data} />
      ) : tab === "output" ? (
        <OutputTab rows={q.data.output.rows} totals={q.data.output} />
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

function OutputTab({
  rows,
  totals,
}: {
  rows: {
    taxInvoiceId: string;
    docNumber: string;
    date: string;
    customerName: string;
    customerTaxId: string;
    baseAmount: number;
    vatAmount: number;
  }[];
  totals: { totalBase: number; totalVAT: number; totalCount: number };
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
              <td>{r.date}</td>
              <td className="mono">{r.docNumber}</td>
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
