"use client";

// ===========================================
// SALE-17b: ออกใบเสร็จรับเงินใหม่แทนใบเสร็จออกตรงที่ยกเลิก
// ดึงข้อมูลใบเดิมมาเป็นค่าเริ่มต้น (แก้ได้) · server เติมหมายเหตุ "ออกแทน … เลขที่ … (เหตุผล …)"
// ===========================================

import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { NewBillingClient, type InitialBillingData } from "../../billings/new/new-billing-client";

export function ReplaceReceiptClient({ replacesBillingId }: { replacesBillingId: string }) {
  const detail = trpc.billing.getById.useQuery({ billingId: replacesBillingId });

  if (detail.isLoading) return <div className="app-page">กำลังโหลด...</div>;
  const header = detail.data?.header;
  if (!detail.data || !header || header.docKind !== "receipt" || header.status !== "void") {
    return (
      <div className="app-page">
        <div className="app-card">
          <div className="app-empty">
            <div className="app-empty-icon">❓</div>
            <p className="app-empty-title">ไม่พบใบเสร็จที่ยกเลิกแล้วสำหรับออกแทน</p>
            <Link href="/receipts" className="app-btn app-btn-primary">
              ← กลับไปที่ใบเสร็จรับเงิน
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const initial: InitialBillingData = {
    billingId: "",
    customerId: header.customerId,
    // ออกแทน = ลงวันที่เดิม (จุดความรับผิดเดิม) — แก้ได้ถ้าจำเป็น
    docDate: header.docDate,
    dueDate: header.docDate,
    projectName: header.projectName,
    eventId: header.eventId,
    vatIncluded: header.vatIncluded,
    isVat: header.isVat,
    discountAmount: header.discountAmount,
    whtPercent: header.whtPercent,
    notes: "",
    terms: "",
    paymentMethod: header.paymentMethod,
    lines: detail.data.lines.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      discountPercent: l.discountPercent,
      notes: l.notes,
    })),
  };

  return (
    <NewBillingClient
      mode="create"
      kind="receipt"
      initial={initial}
      replacesBillingId={replacesBillingId}
      notice={`ออกแทนใบเสร็จเลขที่ ${header.receiptNumber || header.docNumber} ที่ยกเลิกแล้ว${
        header.voidReason ? ` (เหตุผล: ${header.voidReason})` : ""
      } — ระบบจะเติมหมายเหตุอ้างฉบับเดิมให้อัตโนมัติ · ลงวันที่เดิมไว้ให้ ถ้างวด ภ.พ.30 ของเดือนนั้นยื่นไปแล้ว ต้องยื่นเพิ่มเติม`}
    />
  );
}
