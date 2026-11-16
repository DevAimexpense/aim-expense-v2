"use client";

// SALE-02: รายการใบลดหนี้/ใบเพิ่มหนี้ — ออกใหม่ได้จากหน้าใบกำกับภาษี / ใบเสร็จรับเงิน-ใบกำกับภาษี
import { useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { formatDate } from "@/lib/utils/date";

const formatTHB = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function CreditNotesClient() {
  const utils = trpc.useUtils();
  const list = trpc.creditNote.list.useQuery();
  const voidMut = trpc.creditNote.void.useMutation();
  const [error, setError] = useState<string | null>(null);

  const handleVoid = async (noteId: string, label: string) => {
    const reason = window.prompt(`ยกเลิก${label}? เลขที่จะไม่ถูกนำกลับมาใช้\n\nเหตุผลการยกเลิก (จำเป็น):`, "");
    if (reason === null) return;
    if (reason.trim().length < 3) {
      setError("กรุณาระบุเหตุผลการยกเลิก (อย่างน้อย 3 ตัวอักษร)");
      return;
    }
    setError(null);
    try {
      await voidMut.mutateAsync({ noteId, reason: reason.trim() });
      await utils.creditNote.list.invalidate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    }
  };

  const rows = list.data || [];
  return (
    <div className="app-page">
      <div className="app-page-header">
        <div>
          <h1 className="app-page-title">↩️ ใบลดหนี้ / ใบเพิ่มหนี้</h1>
          <p className="app-page-subtitle">
            แก้มูลค่าหลังออกใบกำกับภาษีแล้ว (ลดราคา/รับคืน/คิดผิด) — ลดหรือเพิ่มภาษีขายในเดือนที่ออกใบ ไม่แก้ใบกำกับเดิม
          </p>
        </div>
      </div>

      {error && <div className="app-error-msg">{error}</div>}

      <div className="app-card" style={{ marginBottom: "1rem", background: "#f8fafc", fontSize: "0.875rem", color: "#334155" }}>
        <strong>ออกใบใหม่:</strong> เปิดใบกำกับภาษีที่ต้องการแก้ (เมนูใบกำกับภาษี) หรือใบเสร็จรับเงิน/ใบกำกับภาษี (เมนูใบเสร็จ) แล้วกด
        &ldquo;ออกใบลดหนี้&rdquo; / &ldquo;ออกใบเพิ่มหนี้&rdquo;
      </div>

      <div className="app-card" style={{ padding: 0, overflowX: "auto" }}>
        <table className="app-table" style={{ width: "100%" }}>
          <thead>
            <tr>
              <th>เลขที่</th>
              <th>วันที่</th>
              <th>อ้างใบกำกับ</th>
              <th>ลูกค้า</th>
              <th>เหตุ</th>
              <th className="num" style={{ textAlign: "right" }}>ผลต่าง</th>
              <th className="num" style={{ textAlign: "right" }}>VAT</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.isLoading && (
              <tr>
                <td colSpan={8} style={{ textAlign: "center", padding: "1.5rem", color: "#64748b" }}>
                  กำลังโหลด…
                </td>
              </tr>
            )}
            {!list.isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={8} style={{ textAlign: "center", padding: "1.5rem", color: "#64748b" }}>
                  ยังไม่มีใบลดหนี้/ใบเพิ่มหนี้
                </td>
              </tr>
            )}
            {rows.map((n) => {
              const sign = n.kind === "credit" ? -1 : 1;
              return (
                <tr key={n.noteId}>
                  <td style={{ fontFamily: "ui-monospace", fontWeight: 600 }}>
                    <span style={n.status === "void" ? { textDecoration: "line-through", color: "#94a3b8" } : undefined}>
                      {n.docNumber}
                    </span>
                    <div style={{ fontSize: "0.7rem", color: n.kind === "credit" ? "#b91c1c" : "#1d4ed8", fontFamily: "inherit" }}>
                      {n.title}
                      {n.status === "void" ? ` · ยกเลิก (${n.voidReason})` : ""}
                    </div>
                  </td>
                  <td>{formatDate(n.docDate)}</td>
                  <td style={{ fontFamily: "ui-monospace" }}>
                    {n.sourceType === "tax_invoice" ? (
                      <Link href={`/tax-invoices/${n.sourceId}`} style={{ color: "#2563eb" }}>
                        {n.sourceDocNumber}
                      </Link>
                    ) : (
                      n.sourceDocNumber
                    )}
                  </td>
                  <td>{n.customerNameSnapshot || "—"}</td>
                  <td style={{ fontSize: "0.8125rem" }} title={n.reasonLabel}>
                    {n.reason}
                  </td>
                  <td className="num" style={{ textAlign: "right" }}>{formatTHB(sign * n.diffAmount)}</td>
                  <td className="num" style={{ textAlign: "right" }}>{formatTHB(sign * n.vatAmount)}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    {n.status !== "void" && (
                      <button
                        type="button"
                        className="app-btn app-btn-ghost app-btn-sm"
                        style={{ color: "#dc2626", marginRight: "0.375rem" }}
                        disabled={voidMut.isPending}
                        onClick={() => handleVoid(n.noteId, `${n.title} ${n.docNumber}`)}
                      >
                        ยกเลิก
                      </button>
                    )}
                    <a
                      href={`/documents/credit-note/${n.noteId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="app-btn app-btn-secondary app-btn-sm"
                    >
                      📄 พิมพ์
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
