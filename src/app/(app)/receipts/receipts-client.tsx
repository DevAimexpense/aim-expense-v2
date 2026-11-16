"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { ensureSalesDocSaved, isDriveAccessProblem } from "@/lib/utils/auto-gen-doc";
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
  const issueTiMut = trpc.billing.issueReceiptTaxInvoice.useMutation();
  const voidBillingReceiptMut = trpc.billing.voidBillingReceipt.useMutation();
  // SALE-14: ใบเสร็จโหมดแยกที่ยังไม่มีใบกำกับคู่ที่ออกเลขแล้ว → แสดงปุ่มออกใบกำกับภาษีคู่
  const tiList = trpc.taxInvoice.list.useQuery(undefined, { staleTime: 30_000 });
  const issuedTiBySource = new Map(
    (tiList.data || [])
      .filter((t) => t.status === "issued" && t.sourceBillingId)
      .map((t) => [t.sourceBillingId, t.docNumber] as const),
  );
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [issuingId, setIssuingId] = useState<string | null>(null);
  const [issuingTiId, setIssuingTiId] = useState<string | null>(null);

  // จด VAT + "รวมเป็นใบเดียว" → ใบวางบิลที่มี VAT ใช้ใบเสร็จรับเงิน/ใบกำกับภาษีแทน
  const vatRegistered = orgQuery.data?.vatRegistered ?? true;
  const combined = orgQuery.data?.receiptMode === "combined";

  const all = list.data || [];
  const issued = all
    .filter((b) => !!b.receiptNumber)
    .sort((a, b) => b.receiptNumber.localeCompare(a.receiptNumber));
  // DOC-02: ใบเสร็จที่ PDF ยังไม่เข้า Drive (หรือเก่ากว่าข้อมูล) → บันทึกเบื้องหลังทีละ 3 ใบ
  // (ใบเสร็จที่ออกตรงไม่มีหน้ารายละเอียด และแท็บเอกสารอาจถูก Safari บล็อก)
  // DOC-04: ใบที่ล้มในรอบนี้ → ข้ามไปหยิบใบถัดไป (ไม่ขวางคิว) · ล้มเพราะเข้า Drive ไม่ได้ → หยุดทั้งคิว
  const failedRef = useRef<Set<string>>(new Set());
  const [queueTick, setQueueTick] = useState(0);
  const [queueStopped, setQueueStopped] = useState(false);
  const pendingPdf = issued.filter(
    (b) =>
      b.status !== "draft" &&
      b.status !== "void" && // ใบที่ยกเลิก/แถวกันเลขซ้ำ (SALE-11) ไม่ต้องสร้าง PDF ใหม่
      (!b.receiptPdfUrl || b.receiptPdfFor !== b.updatedAt) &&
      !failedRef.current.has(`${b.billingId}:${b.updatedAt}`),
  );
  const batch = queueStopped ? [] : pendingPdf.slice(0, 3);
  const pendingKey = `${batch.map((b) => `${b.billingId}:${b.updatedAt}`).join("|")}#${queueTick}`;
  useEffect(() => {
    for (const b of batch) {
      ensureSalesDocSaved({
        kind: "receipt",
        id: b.billingId,
        version: b.updatedAt,
        savedFor: b.receiptPdfFor,
        savedUrl: b.receiptPdfUrl,
        onDone: () => utils.billing.list.invalidate(),
        onFail: (error) => {
          failedRef.current.add(`${b.billingId}:${b.updatedAt}`);
          if (isDriveAccessProblem(error)) setQueueStopped(true);
          else setQueueTick((t) => t + 1);
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingKey]);

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

  const handleIssueTi = async (billingId: string) => {
    setError(null);
    setNotice(null);
    setIssuingTiId(billingId);
    try {
      const res = await issueTiMut.mutateAsync({ billingId });
      utils.taxInvoice.list.invalidate();
      if (res.taxInvoiceId) {
        ensureSalesDocSaved({ kind: "tax-invoice", id: String(res.taxInvoiceId), version: `saved-${Date.now()}`, savedFor: "", savedUrl: "" });
      }
      setNotice(
        `ออกใบกำกับภาษี ${res.taxInvoiceNumber} คู่กับใบเสร็จแล้ว${"warning" in res && res.warning ? ` — ⚠️ ${res.warning}` : ""}`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    } finally {
      setIssuingTiId(null);
    }
  };

  // SALE-19: ใบเสร็จที่ออกจากใบวางบิล — ยกเลิกเพื่อแก้ใบวางบิลแล้วออกใบเสร็จใหม่ (การรับเงินยังอยู่)
  const handleVoidBillingReceipt = async (billingId: string, receiptNumber: string, billingNo: string) => {
    const reason = window.prompt(
      `ยกเลิกใบเสร็จรับเงิน ${receiptNumber} (ของใบวางบิล ${billingNo})\n` +
        `เลขที่นี้จะถูกเก็บเป็น "ยกเลิก" ไม่นำกลับมาใช้ · การรับเงินยังอยู่ — แก้ใบวางบิลแล้วออกใบเสร็จใหม่ได้\n\nเหตุผลการยกเลิก (จำเป็น):`,
      "",
    );
    if (reason === null) return;
    if (reason.trim().length < 3) {
      setError("กรุณาระบุเหตุผลการยกเลิก (อย่างน้อย 3 ตัวอักษร)");
      return;
    }
    setError(null);
    setNotice(null);
    try {
      await voidBillingReceiptMut.mutateAsync({ billingId, reason: reason.trim() });
      utils.billing.list.invalidate();
      utils.billing.getById.invalidate({ billingId });
      setNotice(`ยกเลิกใบเสร็จ ${receiptNumber} แล้ว — ใบวางบิล ${billingNo} กลับไปอยู่ในรายการรอออกใบเสร็จ (แก้ไขได้)`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    }
  };

  const handleVoid = async (billingId: string, receiptNumber: string, hasVat: boolean) => {
    // SALE-01b: ใบที่มี VAT (ใบเสร็จ/ใบกำกับ หรือมีใบกำกับคู่) ต้องระบุเหตุผล — ใบกำกับคู่ถูกยกเลิกพร้อมกัน
    const reason = window.prompt(
      hasVat
        ? `ยกเลิกใบเสร็จรับเงิน ${receiptNumber}\nถ้ามีใบกำกับภาษีคู่ จะถูกยกเลิกพร้อมกัน · เลขที่จะไม่ถูกนำกลับมาใช้\n\nเหตุผลการยกเลิก (จำเป็น):`
        : `ยกเลิกใบเสร็จรับเงิน ${receiptNumber}? (เลขที่นี้จะไม่ถูกนำกลับมาใช้)\n\nเหตุผลการยกเลิก:`,
      "",
    );
    if (reason === null) return;
    if (hasVat && reason.trim().length < 3) {
      setError("กรุณาระบุเหตุผลการยกเลิก (อย่างน้อย 3 ตัวอักษร)");
      return;
    }
    setError(null);
    try {
      await voidMut.mutateAsync({ billingId, reason: reason.trim() || undefined });
      utils.billing.list.invalidate();
      utils.taxInvoice.list.invalidate();
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
      {notice && (
        <div className="app-card" style={{ marginBottom: "1rem", background: "#f0fdf4", color: "#166534", fontSize: "0.875rem" }}>
          {notice}
        </div>
      )}

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
                  {/* SALE-14: โหมดแยกที่ยังไม่มีใบกำกับคู่ (ออกไม่ได้ตอนสร้าง / ยกเลิกไปเพื่อแก้) */}
                  {b.docKind === "receipt" &&
                    b.status !== "void" &&
                    b.taxDocMode === "separate" &&
                    b.vatAmount > 0 &&
                    tiList.isSuccess &&
                    !issuedTiBySource.has(b.billingId) && (
                      <button
                        type="button"
                        className="app-btn app-btn-primary app-btn-sm"
                        style={{ marginRight: "0.375rem" }}
                        disabled={issueTiMut.isPending}
                        onClick={() => handleIssueTi(b.billingId)}
                        title="ใบเสร็จนี้มี VAT แต่ยังไม่มีใบกำกับภาษีคู่ — ออกลงวันที่เดียวกับใบเสร็จ"
                      >
                        {issuingTiId === b.billingId ? "กำลังออก…" : "ออกใบกำกับภาษีคู่"}
                      </button>
                    )}
                  {/* SALE-13: ใบเสร็จรับเงิน/ใบกำกับภาษี แก้ไม่ได้ — ต้องยกเลิกแล้วออกใหม่ */}
                  {b.status !== "void" && b.taxDocMode === "combined" && (
                    <span
                      style={{ marginRight: "0.375rem", fontSize: "0.75rem", color: "#64748b" }}
                      title="ใบเสร็จรับเงิน/ใบกำกับภาษี แก้ไขไม่ได้ — ยกเลิก (ระบุเหตุผล) แล้วออกใบใหม่ หรือออกใบลด/เพิ่มหนี้"
                    >
                      🔒 ใบกำกับภาษี
                    </span>
                  )}
                  {/* SALE-02: แก้มูลค่าใบเสร็จ/ใบกำกับ (โหมดรวม) หลังออก → ใบลด/เพิ่มหนี้ */}
                  {b.docKind === "receipt" && b.status !== "void" && b.taxDocMode === "combined" && (
                    <Link
                      href={`/credit-notes/new?kind=credit&sourceType=receipt&sourceId=${encodeURIComponent(b.billingId)}`}
                      className="app-btn app-btn-secondary app-btn-sm"
                      style={{ marginRight: "0.375rem" }}
                    >
                      ↩️ ลด/เพิ่มหนี้
                    </Link>
                  )}
                  {b.docKind === "receipt" && b.status !== "void" && b.taxDocMode !== "combined" && (
                    <Link
                      href={`/receipts/${b.billingId}/edit`}
                      className="app-btn app-btn-secondary app-btn-sm"
                      style={{ marginRight: "0.375rem" }}
                    >
                      ✏️ แก้ไข
                    </Link>
                  )}
                  {/* SALE-19: ใบเสร็จจากใบวางบิลแก้ไม่ได้ (ใบที่ลูกค้าถือต้องไม่เปลี่ยน) → ยกเลิก แล้วแก้ใบวางบิล + ออกใหม่ */}
                  {b.docKind !== "receipt" && b.status !== "void" && (
                    <button
                      type="button"
                      className="app-btn app-btn-ghost app-btn-sm"
                      style={{ color: "#dc2626", marginRight: "0.375rem" }}
                      disabled={voidBillingReceiptMut.isPending}
                      onClick={() => handleVoidBillingReceipt(b.billingId, b.receiptNumber, b.docNumber)}
                      title="ยกเลิกใบเสร็จนี้เพื่อแก้ใบวางบิล แล้วออกใบเสร็จใหม่ (เลขเดิมเก็บเป็นยกเลิก)"
                    >
                      ยกเลิกใบเสร็จ
                    </button>
                  )}
                  {/* SALE-17b: ใบเสร็จออกตรงที่ยกเลิก (ไม่ใช่แถวกันเลข) → ออกใบใหม่แทน อ้างเลขเดิม */}
                  {b.docKind === "receipt" && b.status === "void" && b.grandTotal > 0 && (
                    <Link
                      href={`/receipts/new?replaces=${encodeURIComponent(b.billingId)}`}
                      className="app-btn app-btn-secondary app-btn-sm"
                      style={{ marginRight: "0.375rem" }}
                      title={b.voidReason ? `ยกเลิกเพราะ: ${b.voidReason}` : undefined}
                    >
                      ออกใบใหม่แทน
                    </Link>
                  )}
                  {b.docKind === "receipt" && b.status !== "void" && (
                    <button
                      type="button"
                      className="app-btn app-btn-ghost app-btn-sm"
                      style={{ color: "#dc2626", marginRight: "0.375rem" }}
                      disabled={voidMut.isPending}
                      onClick={() => handleVoid(b.billingId, b.receiptNumber, vatRegistered && b.isVat && b.vatAmount > 0)}
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
