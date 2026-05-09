"use client";

import { useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { BillingStatusBadge } from "../billings-client";

const formatTHB = (n: number) =>
  n.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export function BillingDetailClient({ billingId }: { billingId: string }) {
  const utils = trpc.useUtils();
  const detail = trpc.billing.getById.useQuery({ billingId });
  const sendMut = trpc.billing.send.useMutation();
  const voidMut = trpc.billing.void.useMutation();

  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    utils.billing.getById.invalidate({ billingId });
    utils.billing.list.invalidate();
  };

  const handleAction = async (
    mut: typeof sendMut | typeof voidMut,
    confirmText?: string
  ) => {
    if (confirmText && !confirm(confirmText)) return;
    setError(null);
    try {
      await mut.mutateAsync({ billingId });
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    }
  };

  if (detail.isLoading) {
    return <div className="app-page">กำลังโหลด...</div>;
  }
  if (!detail.data) {
    return (
      <div className="app-page">
        <div className="app-card">
          <div className="app-empty">
            <div className="app-empty-icon">❓</div>
            <p className="app-empty-title">ไม่พบใบวางบิล</p>
            <Link href="/billings" className="app-btn app-btn-primary">
              ← กลับ
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { header, lines } = detail.data;
  const isLoading = sendMut.isPending || voidMut.isPending;

  return (
    <div className="app-page">
      <div className="app-page-header">
        <div>
          <h1 className="app-page-title">
            🧾 {header.docNumber}{" "}
            <BillingStatusBadge status={header.status} />
          </h1>
          <p className="app-page-subtitle">
            ออก {header.docDate} • ครบกำหนด {header.dueDate}
            {header.sourceQuotationId && (
              <>
                {" • "}
                สร้างจาก{" "}
                <Link
                  href={`/quotations/${header.sourceQuotationId}`}
                  style={{ color: "#2563eb" }}
                >
                  ใบเสนอราคา
                </Link>
              </>
            )}
          </p>
        </div>
        <Link href="/billings" className="app-btn app-btn-secondary">
          ← กลับ
        </Link>
      </div>

      {error && <div className="app-error-msg">{error}</div>}

      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          marginBottom: "1rem",
          flexWrap: "wrap",
        }}
      >
        {header.status === "draft" && (
          <>
            <button
              onClick={() =>
                handleAction(sendMut, `ส่งใบวางบิล ${header.docNumber}?`)
              }
              disabled={isLoading}
              className="app-btn app-btn-primary"
            >
              ✉️ ส่งให้ลูกค้า
            </button>
            <Link
              href={`/billings/${billingId}/edit`}
              className="app-btn app-btn-secondary"
            >
              ✏️ แก้ไข
            </Link>
            <button
              onClick={() =>
                handleAction(voidMut, `ยกเลิกใบวางบิล ${header.docNumber}?`)
              }
              disabled={isLoading}
              className="app-btn app-btn-ghost"
              style={{ color: "#dc2626" }}
            >
              🗑️ ยกเลิก
            </button>
          </>
        )}
        {(header.status === "sent" || header.status === "partial") && (
          <>
            <button
              onClick={() =>
                handleAction(voidMut, `ยกเลิกใบวางบิล ${header.docNumber}?`)
              }
              disabled={isLoading}
              className="app-btn app-btn-ghost"
              style={{ color: "#dc2626" }}
            >
              🗑️ ยกเลิก
            </button>
          </>
        )}
        {(header.status === "sent" ||
          header.status === "partial" ||
          header.status === "paid") && (
          <Link
            href={`/tax-invoices/new?fromBilling=${billingId}`}
            className="app-btn app-btn-secondary"
          >
            → ออกใบกำกับภาษี
          </Link>
        )}
        <a
          href={`/documents/billing/${billingId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="app-btn app-btn-secondary"
        >
          📄 พิมพ์เอกสาร
        </a>
      </div>

      <div className="app-section cols-2">
        <div className="app-card">
          <div className="app-card-header">
            <h2 className="app-card-title">ลูกค้า</h2>
          </div>
          <div style={{ fontSize: "0.875rem", lineHeight: 1.6 }}>
            <div style={{ fontWeight: 600 }}>
              {header.customerNameSnapshot}
            </div>
            {header.customerTaxIdSnapshot && (
              <div>
                เลขผู้เสียภาษี:{" "}
                <span style={{ fontFamily: "ui-monospace" }}>
                  {header.customerTaxIdSnapshot}
                </span>
              </div>
            )}
            {header.customerAddressSnapshot && (
              <div>ที่อยู่: {header.customerAddressSnapshot}</div>
            )}
          </div>
        </div>

        <div className="app-card">
          <div className="app-card-header">
            <h2 className="app-card-title">ข้อมูลเอกสาร</h2>
          </div>
          <div style={{ fontSize: "0.875rem", lineHeight: 1.8 }}>
            <div>
              <strong>โครงการ:</strong> {header.projectName || "-"}
            </div>
            <div>
              <strong>วันที่ออก:</strong> {header.docDate}
            </div>
            <div>
              <strong>วันครบกำหนด:</strong> {header.dueDate}
            </div>
            <div>
              <strong>ผู้จัดทำ:</strong> {header.preparedBy || "-"}
            </div>
          </div>
        </div>
      </div>

      <div className="app-card" style={{ marginTop: "1rem" }}>
        <div className="app-card-header">
          <h2 className="app-card-title">รายการ</h2>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="app-table" style={{ minWidth: "640px" }}>
            <thead>
              <tr>
                <th style={{ width: "40px" }}>#</th>
                <th>รายละเอียด</th>
                <th className="text-right" style={{ width: "80px" }}>
                  จำนวน
                </th>
                <th className="text-right" style={{ width: "120px" }}>
                  ราคา/หน่วย
                </th>
                <th className="text-right" style={{ width: "80px" }}>
                  ส่วนลด %
                </th>
                <th className="text-right" style={{ width: "120px" }}>
                  ยอดรวม
                </th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.lineId}>
                  <td className="text-center">{l.lineNumber}</td>
                  <td>{l.description}</td>
                  <td className="text-right num">{l.quantity}</td>
                  <td className="text-right num">{formatTHB(l.unitPrice)}</td>
                  <td className="text-right num">
                    {l.discountPercent > 0 ? `${l.discountPercent}%` : "-"}
                  </td>
                  <td className="text-right num">{formatTHB(l.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div
          style={{
            marginTop: "1rem",
            padding: "1rem",
            background: "#f8fafc",
            borderRadius: "0.5rem",
            maxWidth: "360px",
            marginLeft: "auto",
            fontSize: "0.875rem",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: "0.5rem",
            }}
          >
            <span>ยอดก่อน VAT:</span>
            <span className="num">{formatTHB(header.subtotal)}</span>
          </div>
          {header.discountAmount > 0 && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "0.5rem",
                color: "#64748b",
              }}
            >
              <span>ส่วนลดท้ายบิล:</span>
              <span className="num">−{formatTHB(header.discountAmount)}</span>
            </div>
          )}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: "0.5rem",
            }}
          >
            <span>VAT 7% {header.vatIncluded && "(included)"}:</span>
            <span className="num">{formatTHB(header.vatAmount)}</span>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              borderTop: "1px solid #cbd5e1",
              paddingTop: "0.5rem",
              fontWeight: 600,
            }}
          >
            <span>ยอดรวมสุทธิ:</span>
            <span className="num">{formatTHB(header.grandTotal)}</span>
          </div>
          {header.whtPercent > 0 && (
            <>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginTop: "0.5rem",
                  color: "#dc2626",
                }}
              >
                <span>หัก WHT {header.whtPercent}%:</span>
                <span className="num">−{formatTHB(header.whtAmount)}</span>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginTop: "0.5rem",
                  fontWeight: 700,
                  color: "#166534",
                }}
              >
                <span>ลูกค้าต้องจ่าย:</span>
                <span className="num">
                  {formatTHB(header.amountReceivable)}
                </span>
              </div>
            </>
          )}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: "0.5rem",
              borderTop: "1px solid #cbd5e1",
              paddingTop: "0.5rem",
              fontWeight: 600,
              color:
                header.balance === 0
                  ? "#166534"
                  : header.balance > 0
                  ? "#c2410c"
                  : "#475569",
            }}
          >
            <span>รับแล้ว / คงค้าง:</span>
            <span className="num">
              {formatTHB(header.paidAmount)} / {formatTHB(header.balance)}
            </span>
          </div>
        </div>
      </div>

      {(header.notes || header.terms) && (
        <div className="app-section cols-2" style={{ marginTop: "1rem" }}>
          {header.notes && (
            <div className="app-card">
              <div className="app-card-header">
                <h2 className="app-card-title">หมายเหตุ</h2>
              </div>
              <div style={{ whiteSpace: "pre-wrap", fontSize: "0.875rem" }}>
                {header.notes}
              </div>
            </div>
          )}
          {header.terms && (
            <div className="app-card">
              <div className="app-card-header">
                <h2 className="app-card-title">เงื่อนไข</h2>
              </div>
              <div style={{ whiteSpace: "pre-wrap", fontSize: "0.875rem" }}>
                {header.terms}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Payment modal moved to /tax-invoices flow (S25B Phase 2). The
          legacy RecordPaymentModal below is unused and kept temporarily for
          reference; remove with the next billing-router cleanup. */}
    </div>
  );
}
