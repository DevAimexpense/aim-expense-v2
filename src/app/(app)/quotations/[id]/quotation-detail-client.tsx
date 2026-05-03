"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { StatusBadge } from "../quotations-client";

const PLUS_30_DAYS = () => {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
};

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
  const convertMut = trpc.quotation.convertToBilling.useMutation();

  const [error, setError] = useState<string | null>(null);
  const [showConvertModal, setShowConvertModal] = useState(false);

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
              onClick={() => setShowConvertModal(true)}
              disabled={isLoading || convertMut.isPending}
              className="app-btn app-btn-primary"
            >
              → สร้างใบวางบิล
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
        <a
          href={`/documents/quotation/${quotationId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="app-btn app-btn-secondary"
        >
          📄 ดูเอกสาร
        </a>
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

      {showConvertModal && (
        <ConvertToBillingModal
          quotationId={quotationId}
          docNumber={header.docNumber}
          onClose={() => setShowConvertModal(false)}
          onSuccess={(billingId) => {
            setShowConvertModal(false);
            utils.quotation.getById.invalidate({ quotationId });
            utils.billing.list.invalidate();
            router.push(`/billings/${billingId}`);
          }}
        />
      )}
    </div>
  );
}

function ConvertToBillingModal({
  quotationId,
  docNumber,
  onClose,
  onSuccess,
}: {
  quotationId: string;
  docNumber: string;
  onClose: () => void;
  onSuccess: (billingId: string) => void;
}) {
  const convertMut = trpc.quotation.convertToBilling.useMutation();

  const today = new Date().toISOString().slice(0, 10);
  const [docDate, setDocDate] = useState(today);
  const [dueDate, setDueDate] = useState(PLUS_30_DAYS());
  const [whtPercent, setWhtPercent] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!dueDate) {
      setError("กรุณาระบุวันครบกำหนด");
      return;
    }
    if (dueDate < docDate) {
      setError("วันครบกำหนดต้องไม่น้อยกว่าวันที่ออก");
      return;
    }
    try {
      const result = await convertMut.mutateAsync({
        quotationId,
        docDate,
        dueDate,
        whtPercent,
      });
      onSuccess(result.billingId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    }
  };

  return (
    <div
      className="app-modal-backdrop"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="app-modal modal-lg">
        <form onSubmit={handleSubmit}>
          <div className="app-modal-header">
            <h3 className="app-modal-title">→ สร้างใบวางบิล</h3>
            <button
              type="button"
              onClick={onClose}
              className="app-btn app-btn-ghost app-btn-icon"
            >
              ✕
            </button>
          </div>
          <div className="app-modal-body">
            {error && <div className="app-error-msg">{error}</div>}
            <p
              style={{
                fontSize: "0.8125rem",
                color: "#64748b",
                marginBottom: "0.75rem",
              }}
            >
              สร้างใบวางบิลจากใบเสนอราคา <strong>{docNumber}</strong> —
              ใบเสนอราคาจะถูกล็อกเป็น "converted" หลัง convert
            </p>
            <div className="app-form-grid cols-2">
              <div className="app-form-group">
                <label className="app-label app-label-required">
                  วันที่ออก
                </label>
                <input
                  type="date"
                  value={docDate}
                  onChange={(e) => setDocDate(e.target.value)}
                  className="app-input"
                />
              </div>
              <div className="app-form-group">
                <label className="app-label app-label-required">
                  วันครบกำหนด
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="app-input"
                />
              </div>
            </div>
            <div className="app-form-group">
              <label className="app-label">
                WHT% (ลูกค้าหัก ณ ที่จ่ายเรา)
              </label>
              <input
                type="number"
                value={whtPercent}
                onChange={(e) =>
                  setWhtPercent(parseFloat(e.target.value) || 0)
                }
                min={0}
                max={15}
                step={0.5}
                className="app-input num"
              />
              <p className="app-hint">
                Default 0 — แก้ใน /billings/[id]/edit ก็ได้
              </p>
            </div>
          </div>
          <div className="app-modal-footer">
            <button
              type="button"
              onClick={onClose}
              className="app-btn app-btn-secondary"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={convertMut.isPending}
              className="app-btn app-btn-primary"
            >
              {convertMut.isPending ? (
                <>
                  <span className="app-spinner" /> กำลังสร้าง...
                </>
              ) : (
                "สร้างใบวางบิล"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
