"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { StatusBadge } from "../quotations-client";

const formatTHB = (n: number) =>
  n.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export function QuotationDetailClient({
  quotationId,
}: {
  quotationId: string;
}) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const detail = trpc.quotation.getById.useQuery({ quotationId });
  const sendMut = trpc.quotation.send.useMutation();
  const acceptMut = trpc.quotation.accept.useMutation();
  const rejectMut = trpc.quotation.reject.useMutation();
  const voidMut = trpc.quotation.void.useMutation();

  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    utils.quotation.getById.invalidate({ quotationId });
    utils.quotation.list.invalidate();
  };

  const handleAction = async (
    mut:
      | typeof sendMut
      | typeof acceptMut
      | typeof rejectMut
      | typeof voidMut,
    confirmText?: string
  ) => {
    if (confirmText && !confirm(confirmText)) return;
    setError(null);
    try {
      await mut.mutateAsync({ quotationId });
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
            <p className="app-empty-title">ไม่พบใบเสนอราคา</p>
            <Link href="/quotations" className="app-btn app-btn-primary">
              ← กลับ
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { header, lines } = detail.data;
  const isLoading =
    sendMut.isPending ||
    acceptMut.isPending ||
    rejectMut.isPending ||
    voidMut.isPending;

  return (
    <div className="app-page">
      <div className="app-page-header">
        <div>
          <h1 className="app-page-title">
            📜 {header.docNumber}{" "}
            <StatusBadge status={header.status} />
          </h1>
          <p className="app-page-subtitle">
            ออกเมื่อ {header.docDate} • ใช้ได้ถึง {header.validUntil}
          </p>
        </div>
        <Link href="/quotations" className="app-btn app-btn-secondary">
          ← กลับ
        </Link>
      </div>

      {error && <div className="app-error-msg">{error}</div>}

      {/* Action buttons */}
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
                handleAction(sendMut, `ส่งใบเสนอราคา ${header.docNumber} ใช่หรือไม่?`)
              }
              disabled={isLoading}
              className="app-btn app-btn-primary"
            >
              ✉️ ส่งให้ลูกค้า
            </button>
            <Link
              href={`/quotations/${quotationId}/edit`}
              className="app-btn app-btn-secondary"
            >
              ✏️ แก้ไข
            </Link>
            <button
              onClick={() =>
                handleAction(voidMut, `ยกเลิกใบเสนอราคา ${header.docNumber}?`)
              }
              disabled={isLoading}
              className="app-btn app-btn-ghost"
              style={{ color: "#dc2626" }}
            >
              🗑️ ยกเลิก
            </button>
          </>
        )}
        {header.status === "sent" && (
          <>
            <button
              onClick={() =>
                handleAction(
                  acceptMut,
                  `ลูกค้ายืนยันรับใบเสนอราคา ${header.docNumber}?`
                )
              }
              disabled={isLoading}
              className="app-btn app-btn-primary"
            >
              ✅ ลูกค้ายืนยัน
            </button>
            <button
              onClick={() =>
                handleAction(
                  rejectMut,
                  `บันทึกว่าลูกค้าปฏิเสธใบเสนอราคา ${header.docNumber}?`
                )
              }
              disabled={isLoading}
              className="app-btn app-btn-secondary"
            >
              ❌ ลูกค้าปฏิเสธ
            </button>
            <button
              onClick={() =>
                handleAction(voidMut, `ยกเลิกใบเสนอราคา ${header.docNumber}?`)
              }
              disabled={isLoading}
              className="app-btn app-btn-ghost"
              style={{ color: "#dc2626" }}
            >
              🗑️ ยกเลิก
            </button>
          </>
        )}
        {header.status === "accepted" && (
          <>
            <button
              disabled
              className="app-btn app-btn-secondary"
              title="ฟีเจอร์ S24"
            >
              → สร้างใบวางบิล (S24)
            </button>
            <button
              onClick={() =>
                handleAction(voidMut, `ยกเลิกใบเสนอราคา ${header.docNumber}?`)
              }
              disabled={isLoading}
              className="app-btn app-btn-ghost"
              style={{ color: "#dc2626" }}
            >
              🗑️ ยกเลิก
            </button>
          </>
        )}
        <button
          disabled
          className="app-btn app-btn-ghost"
          title="PDF จะรองรับใน S24"
        >
          📄 PDF (เร็ว ๆ นี้)
        </button>
      </div>

      <div className="app-section cols-2">
        {/* Customer + Doc info */}
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
              <strong>ใช้ได้ถึง:</strong> {header.validUntil}
            </div>
            <div>
              <strong>ผู้จัดทำ:</strong> {header.preparedBy || "-"}
            </div>
          </div>
        </div>
      </div>

      {/* Lines */}
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
            maxWidth: "320px",
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
              fontWeight: 700,
              fontSize: "1rem",
            }}
          >
            <span>ยอดรวมสุทธิ:</span>
            <span className="num">{formatTHB(header.grandTotal)}</span>
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
    </div>
  );
}
