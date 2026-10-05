"use client";

import { useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { formatDate } from "@/lib/utils/date";

const formatTHB = (n: number) =>
  n.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export function ReceiptsClient() {
  const utils = trpc.useUtils();
  const list = trpc.billing.list.useQuery();
  const orgQuery = trpc.org.get.useQuery();
  const issueMut = trpc.billing.issueReceipt.useMutation();
  const voidMut = trpc.billing.voidReceipt.useMutation();
  const [error, setError] = useState<string | null>(null);
  const [issuingId, setIssuingId] = useState<string | null>(null);

  // จด VAT + "รวมเป็นใบเดียว" → ใบวางบิลที่มี VAT ใช้ใบเสร็จรับเงิน/ใบกำกับภาษีแทน
  const vatRegistered = orgQuery.data?.vatRegistered ?? true;
  const combined = orgQuery.data?.receiptMode === "combined";

  const all = list.data || [];
  const issued = all
    .filter((b) => !!b.receiptNumber)
    .sort((a, b) => b.receiptNumber.localeCompare(a.receiptNumber));
  const ready = all.filter(
    (b) =>
      b.status === "paid" &&
      !b.receiptNumber &&
      !(vatRegistered && combined && b.isVat),
  );
  const waiting = all.filter(
    (b) => b.status === "sent" || b.status === "partial",
  ).length;

  const handleIssue = async (billingId: string) => {
    setError(null);
    setIssuingId(billingId);
    try {
      await issueMut.mutateAsync({ billingId });
      utils.billing.list.invalidate();
      utils.billing.getById.invalidate({ billingId });
      window.open(`/documents/receipt/${billingId}`, "_blank", "noopener");
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    } finally {
      setIssuingId(null);
    }
  };

  const handleVoid = async (billingId: string, receiptNumber: string) => {
    if (!window.confirm(`ยกเลิกใบเสร็จรับเงิน ${receiptNumber}? (เลขที่นี้จะไม่ถูกนำกลับมาใช้)`)) return;
    setError(null);
    try {
      await voidMut.mutateAsync({ billingId });
      utils.billing.list.invalidate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    }
  };

  return (
    <div className="app-page">
      <div className="app-page-header">
        <div>
          <h1 className="app-page-title">🧾 ใบเสร็จรับเงิน</h1>
          <p className="app-page-subtitle">
            รับเงินแล้วสร้างใบเสร็จได้เลย หรือออกจากใบวางบิลที่รับเงินครบแล้ว
          </p>
        </div>
        <Link href="/receipts/new" className="app-btn app-btn-primary">
          + สร้างใบเสร็จรับเงิน
        </Link>
      </div>

      {error && <div className="app-error-msg">{error}</div>}

      {/* วิธีออกใบเสร็จ */}
      <div
        className="app-card"
        style={{ marginBottom: "1rem", background: "#f8fafc", fontSize: "0.875rem", color: "#334155" }}
      >
        <strong>ออกได้ 2 แบบ:</strong> ① กด &ldquo;+ สร้างใบเสร็จรับเงิน&rdquo;
        กรอกลูกค้า + รายการ แล้วออกได้ทันที · ② ถ้ามีใบวางบิลอยู่แล้ว
        เมื่อบันทึกรับเงินครบ ใบนั้นจะมาอยู่ในรายการ &ldquo;รอออกใบเสร็จ&rdquo;
        ด้านล่าง
        {waiting > 0 && (
          <>
            {" "}
            · ตอนนี้มีใบวางบิลรอรับเงิน {waiting} ใบ —{" "}
            <Link href="/billings" style={{ color: "#2563eb" }}>
              ไปบันทึกรับเงิน
            </Link>
          </>
        )}
      </div>

      {/* พร้อมออกใบเสร็จ */}
      <div className="app-card" style={{ marginBottom: "1rem", padding: 0, overflowX: "auto" }}>
        <div className="app-card-header" style={{ padding: "1rem 1rem 0" }}>
          <h2 className="app-card-title">ใบวางบิลที่รับเงินครบแล้ว — รอออกใบเสร็จ ({ready.length})</h2>
        </div>
        <table className="app-table" style={{ width: "100%" }}>
          <thead>
            <tr>
              <th>ใบวางบิล</th>
              <th>ลูกค้า</th>
              <th>วันที่รับเงิน</th>
              <th className="num" style={{ textAlign: "right" }}>ยอดรวม</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.isLoading && (
              <tr>
                <td colSpan={5} style={{ textAlign: "center", padding: "1.5rem", color: "#64748b" }}>
                  กำลังโหลด…
                </td>
              </tr>
            )}
            {!list.isLoading && ready.length === 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign: "center", padding: "1.5rem", color: "#64748b" }}>
                  ไม่มีใบวางบิลที่รอออกใบเสร็จ
                </td>
              </tr>
            )}
            {ready.map((b) => (
              <tr key={b.billingId}>
                <td>
                  <Link href={`/billings/${b.billingId}`} style={{ color: "#2563eb", fontFamily: "ui-monospace" }}>
                    {b.docNumber}
                  </Link>
                </td>
                <td>{b.customerNameSnapshot || "—"}</td>
                <td>{b.paidDate ? formatDate(b.paidDate) : "—"}</td>
                <td className="num" style={{ textAlign: "right" }}>{formatTHB(b.grandTotal)}</td>
                <td style={{ textAlign: "right" }}>
                  <button
                    type="button"
                    className="app-btn app-btn-primary app-btn-sm"
                    disabled={issueMut.isPending}
                    onClick={() => handleIssue(b.billingId)}
                  >
                    {issuingId === b.billingId ? "กำลังออก…" : "ออกใบเสร็จรับเงิน"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ออกแล้ว */}
      <div className="app-card" style={{ padding: 0, overflowX: "auto" }}>
        <div className="app-card-header" style={{ padding: "1rem 1rem 0" }}>
          <h2 className="app-card-title">ใบเสร็จที่ออกแล้ว ({issued.length})</h2>
        </div>
        <table className="app-table" style={{ width: "100%" }}>
          <thead>
            <tr>
              <th>เลขที่ใบเสร็จ</th>
              <th>วันที่</th>
              <th>ลูกค้า</th>
              <th>ที่มา</th>
              <th className="num" style={{ textAlign: "right" }}>ยอดรวม</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {!list.isLoading && issued.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", padding: "1.5rem", color: "#64748b" }}>
                  ยังไม่มีใบเสร็จรับเงิน
                </td>
              </tr>
            )}
            {issued.map((b) => (
              <tr key={b.billingId}>
                <td style={{ fontFamily: "ui-monospace", fontWeight: 600 }}>
                  <span style={b.status === "void" ? { textDecoration: "line-through", color: "#94a3b8" } : undefined}>
                    {b.receiptNumber}
                  </span>
                  {b.status === "void" && (
                    <span style={{ marginLeft: "0.5rem", fontSize: "0.6875rem", color: "#991b1b", fontFamily: "inherit" }}>
                      ยกเลิก
                    </span>
                  )}
                </td>
                <td>{b.receiptDate ? formatDate(b.receiptDate) : "—"}</td>
                <td>{b.customerNameSnapshot || "—"}</td>
                <td>
                  {b.docKind === "receipt" ? (
                    <span style={{ color: "#64748b" }}>ออกโดยตรง</span>
                  ) : (
                    <Link href={`/billings/${b.billingId}`} style={{ color: "#2563eb", fontFamily: "ui-monospace" }}>
                      {b.docNumber}
                    </Link>
                  )}
                </td>
                <td className="num" style={{ textAlign: "right" }}>{formatTHB(b.grandTotal)}</td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  {b.docKind === "receipt" && b.status !== "void" && (
                    <button
                      type="button"
                      className="app-btn app-btn-ghost app-btn-sm"
                      style={{ color: "#dc2626", marginRight: "0.375rem" }}
                      disabled={voidMut.isPending}
                      onClick={() => handleVoid(b.billingId, b.receiptNumber)}
                    >
                      ยกเลิก
                    </button>
                  )}
                  <a
                    href={`/documents/receipt/${b.billingId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="app-btn app-btn-secondary app-btn-sm"
                  >
                    📄 พิมพ์
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
