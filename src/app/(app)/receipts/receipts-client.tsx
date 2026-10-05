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

  return (
    <div className="app-page">
      <div className="app-page-header">
        <div>
          <h1 className="app-page-title">🧾 ใบเสร็จรับเงิน</h1>
          <p className="app-page-subtitle">
            ออกใบเสร็จจากใบวางบิลที่รับเงินครบแล้ว — 1 ใบเสร็จต่อ 1 ใบวางบิล
          </p>
        </div>
        <Link href="/billings/new" className="app-btn app-btn-primary">
          + สร้างใบวางบิล
        </Link>
      </div>

      {error && <div className="app-error-msg">{error}</div>}

      {/* วิธีออกใบเสร็จ */}
      <div
        className="app-card"
        style={{ marginBottom: "1rem", background: "#f8fafc", fontSize: "0.875rem", color: "#334155" }}
      >
        <strong>ขั้นตอน:</strong> ① สร้างใบวางบิล แล้วกด &ldquo;ส่งให้ลูกค้า&rdquo; → ②
        บันทึกรับเงินจนครบ → ③ กด &ldquo;ออกใบเสร็จรับเงิน&rdquo; (ในหน้านี้
        หรือในหน้าใบวางบิล)
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
          <h2 className="app-card-title">รับเงินครบแล้ว — รอออกใบเสร็จ ({ready.length})</h2>
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
              <th>อ้างอิงใบวางบิล</th>
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
                <td style={{ fontFamily: "ui-monospace", fontWeight: 600 }}>{b.receiptNumber}</td>
                <td>{b.receiptDate ? formatDate(b.receiptDate) : "—"}</td>
                <td>{b.customerNameSnapshot || "—"}</td>
                <td>
                  <Link href={`/billings/${b.billingId}`} style={{ color: "#2563eb", fontFamily: "ui-monospace" }}>
                    {b.docNumber}
                  </Link>
                </td>
                <td className="num" style={{ textAlign: "right" }}>{formatTHB(b.grandTotal)}</td>
                <td style={{ textAlign: "right" }}>
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
