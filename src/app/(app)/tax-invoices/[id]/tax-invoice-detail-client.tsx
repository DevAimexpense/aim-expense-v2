"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { TaxInvoiceStatusBadge } from "../tax-invoices-client";

const formatTHB = (n: number) =>
  n.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export function TaxInvoiceDetailClient({
  taxInvoiceId,
}: {
  taxInvoiceId: string;
}) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const detail = trpc.taxInvoice.getById.useQuery({ taxInvoiceId });
  const issueMut = trpc.taxInvoice.issue.useMutation();
  const voidMut = trpc.taxInvoice.void.useMutation();
  const deleteMut = trpc.taxInvoice.delete.useMutation();

  const [error, setError] = useState<string | null>(null);
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [voidReason, setVoidReason] = useState("");

  const refresh = () => {
    utils.taxInvoice.getById.invalidate({ taxInvoiceId });
    utils.taxInvoice.list.invalidate();
  };

  const handleIssue = async () => {
    if (
      !confirm(
        "ออกเลขใบกำกับภาษี? เมื่อออกแล้วจะไม่สามารถแก้ไขเอกสารได้ — เลขจะเรียงต่อเนื่องตาม RD requirement",
      )
    )
      return;
    setError(null);
    try {
      const r = await issueMut.mutateAsync({ taxInvoiceId });
      refresh();
      alert(`ออกใบกำกับภาษี ${r.docNumber} สำเร็จ`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    }
  };

  const handleVoid = async () => {
    if (!voidReason.trim() || voidReason.trim().length < 3) {
      setError("กรุณาระบุเหตุผลในการยกเลิก (อย่างน้อย 3 ตัวอักษร)");
      return;
    }
    setError(null);
    try {
      await voidMut.mutateAsync({ taxInvoiceId, reason: voidReason.trim() });
      setShowVoidModal(false);
      setVoidReason("");
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    }
  };

  const handleDelete = async () => {
    if (!confirm("ลบ draft ใบกำกับภาษีนี้?")) return;
    setError(null);
    try {
      await deleteMut.mutateAsync({ taxInvoiceId });
      utils.taxInvoice.list.invalidate();
      router.push("/tax-invoices");
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
            <p className="app-empty-title">ไม่พบใบกำกับภาษี</p>
            <Link href="/tax-invoices" className="app-btn app-btn-primary">
              ← กลับ
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { header, lines } = detail.data;
  const isLoading =
    issueMut.isPending || voidMut.isPending || deleteMut.isPending;
  const isLocked = header.status !== "draft";
  const canIssue =
    header.status === "draft" &&
    !!header.customerTaxIdSnapshot &&
    !!header.customerBranchSnapshot;

  return (
    <div className="app-page">
      <div className="app-page-header">
        <div>
          <h1 className="app-page-title">
            🧮{" "}
            {header.docNumber || (
              <span style={{ color: "#94a3b8", fontWeight: 500 }}>
                (draft — ยังไม่ออกเลข)
              </span>
            )}{" "}
            <TaxInvoiceStatusBadge status={header.status} />
          </h1>
          <p className="app-page-subtitle">
            วันที่เอกสาร {header.docDate}
            {header.sourceBillingId && (
              <>
                {" • "}
                จาก{" "}
                <Link
                  href={`/billings/${header.sourceBillingId}`}
                  style={{ color: "#2563eb" }}
                >
                  ใบวางบิล
                </Link>
              </>
            )}
            {header.sourceQuotationId && !header.sourceBillingId && (
              <>
                {" • "}
                จาก{" "}
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
        <Link href="/tax-invoices" className="app-btn app-btn-secondary">
          ← กลับ
        </Link>
      </div>

      {error && <div className="app-error-msg">{error}</div>}

      {/* Action bar */}
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
              onClick={handleIssue}
              disabled={isLoading || !canIssue}
              className="app-btn app-btn-primary"
              title={
                !canIssue
                  ? "ลูกค้าขาดเลขผู้เสียภาษี/ข้อมูลสาขา"
                  : "ออกเลข + lock เอกสาร"
              }
            >
              ✅ ออกเลข (issue)
            </button>
            <Link
              href={`/tax-invoices/${taxInvoiceId}/edit`}
              className="app-btn app-btn-secondary"
            >
              ✏️ แก้ไข
            </Link>
            <button
              onClick={handleDelete}
              disabled={isLoading}
              className="app-btn app-btn-ghost"
              style={{ color: "#dc2626" }}
            >
              🗑️ ลบ draft
            </button>
          </>
        )}
        {header.status === "issued" && (
          <>
            <a
              href={`/documents/tax-invoice/${taxInvoiceId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="app-btn app-btn-primary"
            >
              📄 พิมพ์เอกสาร (PDF)
            </a>
            <button
              onClick={() => setShowVoidModal(true)}
              disabled={isLoading}
              className="app-btn app-btn-ghost"
              style={{ color: "#dc2626" }}
            >
              ❌ ยกเลิก (void)
            </button>
          </>
        )}
        {header.status === "void" && (
          <a
            href={`/documents/tax-invoice/${taxInvoiceId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="app-btn app-btn-secondary"
          >
            📄 พิมพ์เอกสาร (มี watermark VOID)
          </a>
        )}
      </div>

      {/* Locked banner */}
      {isLocked && (
        <div
          style={{
            background: header.status === "void" ? "#fef2f2" : "#f0fdf4",
            border: `1px solid ${header.status === "void" ? "#fecaca" : "#bbf7d0"}`,
            color: header.status === "void" ? "#7f1d1d" : "#14532d",
            padding: "0.75rem 1rem",
            borderRadius: "0.5rem",
            marginBottom: "1rem",
            fontSize: "0.875rem",
          }}
        >
          {header.status === "issued" ? (
            <>
              🔒 <strong>เอกสารถูก lock</strong> — ออกเมื่อ{" "}
              {header.issuedAt &&
                new Date(header.issuedAt).toLocaleString("th-TH")}{" "}
              · เลขใบกำกับภาษี{" "}
              <span className="mono" style={{ fontWeight: 700 }}>
                {header.docNumber}
              </span>{" "}
              สามารถยกเลิกได้แต่ไม่สามารถแก้ไข
            </>
          ) : (
            <>
              ❌ <strong>ใบกำกับภาษีถูกยกเลิก</strong> — เมื่อ{" "}
              {header.voidedAt &&
                new Date(header.voidedAt).toLocaleString("th-TH")}{" "}
              · เหตุผล: {header.voidReason || "—"}
            </>
          )}
        </div>
      )}

      {/* Customer + Document info */}
      <div className="app-section cols-2">
        <div className="app-card">
          <div className="app-card-header">
            <h2 className="app-card-title">ลูกค้า</h2>
          </div>
          <div style={{ fontSize: "0.875rem", lineHeight: 1.6 }}>
            <div style={{ fontWeight: 600 }}>
              {header.customerNameSnapshot}
            </div>
            <div>
              เลขผู้เสียภาษี:{" "}
              <span style={{ fontFamily: "ui-monospace" }}>
                {header.customerTaxIdSnapshot || "—"}
              </span>
            </div>
            <div>
              สาขา:{" "}
              <span style={{ fontFamily: "ui-monospace" }}>
                {header.customerBranchSnapshot === "00000"
                  ? "00000 (สำนักงานใหญ่)"
                  : header.customerBranchSnapshot || "—"}
              </span>
            </div>
            {header.customerAddressSnapshot && (
              <div style={{ marginTop: "0.25rem" }}>
                ที่อยู่: {header.customerAddressSnapshot}
              </div>
            )}
          </div>
        </div>

        <div className="app-card">
          <div className="app-card-header">
            <h2 className="app-card-title">ข้อมูลเอกสาร</h2>
          </div>
          <div style={{ fontSize: "0.875rem", lineHeight: 1.8 }}>
            <div>
              <strong>เลขใบกำกับภาษี:</strong>{" "}
              {header.docNumber || (
                <span style={{ color: "#94a3b8" }}>(ออกเมื่อ issue)</span>
              )}
            </div>
            <div>
              <strong>โครงการ:</strong> {header.projectName || "-"}
            </div>
            <div>
              <strong>วันที่ส่งมอบ/ให้บริการ:</strong> {header.docDate}
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
          <table className="app-table" style={{ minWidth: "720px" }}>
            <thead>
              <tr>
                <th style={{ width: "40px" }}>#</th>
                <th>รายละเอียด</th>
                <th style={{ width: "80px" }}>ประเภท</th>
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
                  <td className="text-center" style={{ fontSize: "0.75rem" }}>
                    {l.expenseNature === "goods" ? "สินค้า" : "บริการ"}
                  </td>
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
            <span>ฐานภาษี (ก่อน VAT):</span>
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
            <span>
              ภาษีมูลค่าเพิ่ม 7%
              {header.vatIncluded ? " (included)" : ""}:
            </span>
            <span className="num">{formatTHB(header.vatAmount)}</span>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              borderTop: "1px solid #cbd5e1",
              paddingTop: "0.5rem",
              fontWeight: 700,
            }}
          >
            <span>ยอดรวมสุทธิ:</span>
            <span className="num">{formatTHB(header.grandTotal)}</span>
          </div>
        </div>
      </div>

      {header.notes && (
        <div className="app-card" style={{ marginTop: "1rem" }}>
          <div className="app-card-header">
            <h2 className="app-card-title">หมายเหตุ</h2>
          </div>
          <div style={{ whiteSpace: "pre-wrap", fontSize: "0.875rem" }}>
            {header.notes}
          </div>
        </div>
      )}

      {/* Void modal */}
      {showVoidModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
          }}
          onClick={() => !isLoading && setShowVoidModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "white",
              borderRadius: "0.75rem",
              padding: "1.5rem",
              maxWidth: "440px",
              width: "90%",
            }}
          >
            <h3
              style={{
                fontSize: "1rem",
                fontWeight: 700,
                marginBottom: "0.75rem",
              }}
            >
              ยกเลิกใบกำกับภาษี {header.docNumber}
            </h3>
            <p
              style={{
                fontSize: "0.8125rem",
                color: "#64748b",
                marginBottom: "0.75rem",
              }}
            >
              เลขใบที่ยกเลิกจะคงในลำดับ — ห้ามนำกลับมาใช้ใหม่
              (ตามประมวลรัษฎากร). กรุณาระบุเหตุผลให้ชัดเจน
            </p>
            <textarea
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="เช่น พิมพ์ผิด, ลูกค้าคืนสินค้า, ออก credit note ทดแทน"
              className="app-textarea"
              style={{ marginBottom: "1rem" }}
            />
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "0.5rem",
              }}
            >
              <button
                type="button"
                onClick={() => setShowVoidModal(false)}
                disabled={isLoading}
                className="app-btn app-btn-secondary"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleVoid}
                disabled={isLoading || voidReason.trim().length < 3}
                className="app-btn app-btn-primary"
                style={{ background: "#dc2626" }}
              >
                {isLoading ? "กำลังประมวลผล..." : "ยืนยันยกเลิก"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
