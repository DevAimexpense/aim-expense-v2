"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import {
  NewBillingClient,
  type InitialBillingData,
} from "../../new/new-billing-client";

export function EditBillingClient({ billingId }: { billingId: string }) {
  const detail = trpc.billing.getById.useQuery({ billingId });

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

  if (
    detail.data.header.status === "void" ||
    detail.data.header.docKind === "receipt" ||
    !detail.data.header.customerId
  ) {
    return (
      <div className="app-page">
        <div className="app-card">
          <div className="app-empty">
            <div className="app-empty-icon">🔒</div>
            <p className="app-empty-title">แก้ไขไม่ได้</p>
            <p className="app-empty-desc">
              {detail.data.header.status === "void"
                ? "ใบวางบิลนี้ถูกยกเลิกแล้ว"
                : "เอกสารนี้แก้ไขจากหน้านี้ไม่ได้"}
            </p>
            <Link
              href={`/billings/${billingId}`}
              className="app-btn app-btn-primary"
            >
              ดูรายละเอียด →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { header, lines } = detail.data;
  const initial: InitialBillingData = {
    billingId: header.billingId,
    customerId: header.customerId,
    docDate: header.docDate,
    dueDate: header.dueDate,
    projectName: header.projectName,
    eventId: header.eventId,
    vatIncluded: header.vatIncluded,
    isVat: header.isVat,
    discountAmount: header.discountAmount,
    whtPercent: header.whtPercent,
    notes: header.notes,
    terms: header.terms,
    lines: lines.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      discountPercent: l.discountPercent,
      notes: l.notes,
    })),
  };

  // แจ้งผลของการแก้ไขเอกสารที่ส่ง/รับเงินไปแล้ว
  const notice =
    header.status === "paid"
      ? `ใบวางบิลนี้รับเงินครบแล้ว${header.receiptNumber ? ` และออกใบเสร็จรับเงิน ${header.receiptNumber} แล้ว` : ""} — เมื่อบันทึก ยอดรับเงินจะปรับตามยอดรวมใหม่${header.receiptNumber ? " และใบเสร็จจะเปลี่ยนตาม (เลขที่คงเดิม)" : ""}`
      : header.status === "partial"
        ? "ใบวางบิลนี้รับเงินบางส่วนแล้ว — ยอดที่รับไว้คงเดิม ยอดรวมใหม่ต้องไม่น้อยกว่ายอดที่รับแล้ว"
        : header.status === "sent"
          ? "ใบวางบิลนี้ส่งให้ลูกค้าแล้ว — อย่าลืมส่งฉบับแก้ไขให้ลูกค้าอีกครั้ง"
          : undefined;

  return <NewBillingClient mode="edit" initial={initial} notice={notice} />;
}
