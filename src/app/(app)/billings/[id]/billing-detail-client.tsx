"use client";

import { useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { BillingStatusBadge } from "../billings-client";
import { RecordBillingPaymentModal } from "./billing-payment-modal";
import { ReceiptDateModal } from "./receipt-date-modal";
import { formatDate } from "@/lib/utils/date";

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
  const receiptMut = trpc.billing.issueReceipt.useMutation();
  const receiptDateMut = trpc.billing.updateReceiptDate.useMutation();
  const orgQuery = trpc.org.get.useQuery();

  const [error, setError] = useState<string | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [receiptDialog, setReceiptDialog] = useState<"" | "issue" | "edit">("");
  const [notice, setNotice] = useState<string | null>(null);

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

  // ออกใบเสร็จ: ให้ยืนยันวันที่ก่อน (ค่าเริ่มต้น = วันที่รับเงิน) — ใบเสร็จต้องลงวันที่รับเงินจริง
  const handleIssueReceipt = async (receiptDate: string) => {
    setError(null);
    // เปิดแท็บก่อน await — Safari/iPad บล็อก window.open ที่เกิดหลัง async
    const win = window.open("about:blank", "_blank");
    try {
      await receiptMut.mutateAsync({ billingId, receiptDate });
      setReceiptDialog("");
      refresh();
      if (win) win.location.href = `/documents/receipt/${billingId}`;
      else window.open(`/documents/receipt/${billingId}`, "_blank", "noopener");
    } catch (e) {
      win?.close();
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    }
  };

  const handleEditReceiptDate = async (receiptDate: string, renumber: boolean) => {
    setError(null);
    setNotice(null);
    try {
      const res = await receiptDateMut.mutateAsync({ billingId, receiptDate, renumber });
      setReceiptDialog("");
      if (res.renumbered) setNotice(`ออกเลขใบเสร็จใหม่เป็น ${res.receiptNumber} แล้ว — กดพิมพ์ใบเสร็จเพื่อดูฉบับใหม่`);
      else if (res.warning) setNotice(res.warning);
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

  // เอกสารรับเงินตามตั้งค่าองค์กร:
  //   ไม่จด VAT              → ใบเสร็จรับเงินอย่างเดียว (ไม่มีใบกำกับภาษี)
  //   จด VAT + ออกแยก        → ใบกำกับภาษี + ใบเสร็จรับเงิน
  //   จด VAT + รวมใบเดียว    → ใบเสร็จรับเงิน/ใบกำกับภาษี (ออกจากปุ่มใบกำกับภาษี)
  // ใบวางบิลที่เลือก "ไม่มี VAT" รายใบ → ใบเสร็จรับเงินเสมอ
  const vatRegistered = orgQuery.data?.vatRegistered ?? true;
  const combined = orgQuery.data?.receiptMode === "combined";
  const canTaxInvoice = vatRegistered && header.isVat;
  const canReceipt = !canTaxInvoice || !combined;

  return (
    <div className="app-page">
      <div className="app-page-header">
        <div>
          <h1 className="app-page-title">
            🧾 {header.docNumber}{" "}
            <BillingStatusBadge status={header.status} />
          </h1>
          <p className="app-page-subtitle">
            ออก {formatDate(header.docDate)} • ครบกำหนด {formatDate(header.dueDate)}
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
      {notice && (
        <div
          role="status"
          style={{
            padding: "0.625rem 0.875rem",
            background: "#fffbeb",
            border: "1px solid #fde68a",
            borderRadius: "0.5rem",
            color: "#92400e",
            fontSize: "0.875rem",
            marginBottom: "1rem",
          }}
        >
          ⚠️ {notice}
        </div>
      )}

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
        {/* แก้ไขได้หลังส่ง/รับเงินแล้วด้วย (ใบเสร็จที่ออกจากใบนี้จะเปลี่ยนตาม) */}
        {(header.status === "sent" ||
          header.status === "partial" ||
          header.status === "paid") &&
          !!header.customerId &&
          header.docKind !== "receipt" && (
            <Link
              href={`/billings/${billingId}/edit`}
              className="app-btn app-btn-secondary"
            >
              ✏️ แก้ไข
            </Link>
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
        {/* ใบกำกับภาษีต้องมี VAT — เอกสาร "ไม่มี VAT" ออก TI ไม่ได้ */}
        {canTaxInvoice &&
          (header.status === "sent" ||
            header.status === "partial" ||
            header.status === "paid") && (
          <Link
            href={`/tax-invoices/new?fromBilling=${billingId}`}
            className="app-btn app-btn-secondary"
          >
            {combined ? "→ ออกใบเสร็จรับเงิน/ใบกำกับภาษี" : "→ ออกใบกำกับภาษี"}
          </Link>
        )}
        {/* บันทึกรับเงิน — ใบที่ออกใบกำกับภาษีไม่ได้ (ไม่จด VAT / ใบไม่มี VAT) ต้องบันทึกที่นี่
            ไม่งั้นค้างที่ "ส่งแล้ว" ออกใบเสร็จไม่ได้ (ใบที่มี VAT บันทึกที่หน้าใบกำกับภาษี) */}
        {!canTaxInvoice &&
          (header.status === "sent" || header.status === "partial") &&
          header.balance > 0 && (
            <button
              onClick={() => setShowPayment(true)}
              disabled={isLoading}
              className="app-btn app-btn-primary"
            >
              💰 บันทึกรับเงิน
            </button>
          )}
        {/* ใบเสร็จรับเงิน — ออกได้เมื่อรับเงินครบ (ใช้ได้ทั้งจด/ไม่จด VAT) */}
        {header.status === "paid" &&
          (canReceipt || !!header.receiptNumber) &&
          (header.receiptNumber ? (
            <a
              href={`/documents/receipt/${billingId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="app-btn app-btn-primary"
            >
              🧾 พิมพ์ใบเสร็จรับเงิน ({header.receiptNumber})
            </a>
          ) : (
            <button
              onClick={() => setReceiptDialog("issue")}
              disabled={receiptMut.isPending}
              className="app-btn app-btn-primary"
            >
              {receiptMut.isPending ? "กำลังออกใบเสร็จ…" : "🧾 ออกใบเสร็จรับเงิน"}
            </button>
          ))}
        {/* แก้วันที่ใบเสร็จที่ออกจากใบวางบิล (ใบเสร็จออกตรงแก้ที่เมนูใบเสร็จ) */}
        {/* ฟังก์ชันพิเศษ — แสดงเฉพาะคนที่ทีมงานเปิดให้ในหลังบ้าน */}
        {!!header.receiptNumber && header.docKind !== "receipt" && orgQuery.data?.canEditReceiptDate && (
          <button onClick={() => setReceiptDialog("edit")} className="app-btn app-btn-secondary">
            📅 แก้วันที่ใบเสร็จ
          </button>
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
              <strong>วันที่ออก:</strong> {formatDate(header.docDate)}
            </div>
            <div>
              <strong>วันครบกำหนด:</strong> {formatDate(header.dueDate)}
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
            <span>{header.isVat ? "ยอดก่อน VAT:" : "ยอดรวม:"}</span>
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
          {header.isVat && (
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
          )}
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
          {header.paymentNote && (
            <div style={{ marginTop: "0.5rem", fontSize: "0.75rem", color: "#475569", lineHeight: 1.6 }}>
              <div style={{ fontWeight: 600, marginBottom: "0.125rem" }}>ประวัติรับเงิน</div>
              {header.paymentNote.split("\n").map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </div>
          )}
          {(header.paymentEvidenceUrl || header.whtCertUrl) && (
            <div style={{ marginTop: "0.5rem", display: "flex", flexWrap: "wrap", gap: "0.25rem 0.75rem", fontSize: "0.8125rem" }}>
              {header.paymentEvidenceUrl
                .split("\n")
                .filter(Boolean)
                .map((url, i, all) => (
                  <a key={url} href={url} target="_blank" rel="noopener noreferrer" style={{ color: "#0369a1" }}>
                    📎 หลักฐานการโอน{all.length > 1 ? ` ${i + 1}` : ""}
                  </a>
                ))}
              {header.whtCertUrl && (
                <a href={header.whtCertUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#0369a1" }}>
                  📎 ใบหัก ณ ที่จ่าย (50 ทวิ)
                </a>
              )}
            </div>
          )}
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

      {receiptDialog && (
        <ReceiptDateModal
          mode={receiptDialog}
          receiptNumber={header.receiptNumber}
          initialDate={receiptDialog === "edit" ? header.receiptDate || header.paidDate : header.paidDate}
          paidDate={header.paidDate}
          busy={receiptMut.isPending || receiptDateMut.isPending}
          onConfirm={(d, renumber) =>
            receiptDialog === "issue" ? handleIssueReceipt(d) : handleEditReceiptDate(d, renumber)
          }
          onClose={() => setReceiptDialog("")}
        />
      )}

      {/* ใบที่มี VAT บันทึกรับเงินที่ /tax-invoices (S25B) · ใบที่ออกใบกำกับไม่ได้ใช้ modal นี้ */}
      {showPayment && (
        <RecordBillingPaymentModal
          billingId={billingId}
          docNumber={header.docNumber}
          customerName={header.customerNameSnapshot}
          subtotal={header.subtotal}
          balance={header.balance}
          paidAmount={header.paidAmount}
          whtPercent={header.whtPercent}
          existingWhtCertUrl={header.whtCertUrl}
          onClose={() => setShowPayment(false)}
          onSuccess={() => {
            setShowPayment(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}
