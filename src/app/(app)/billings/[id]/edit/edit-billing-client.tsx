"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import {
  NewBillingClient,
  type InitialBillingData,
} from "../../new/new-billing-client";

export function EditBillingClient({ billingId }: { billingId: string }) {
  const detail = trpc.billing.getById.useQuery({ billingId });
  // SALE-20: มีใบกำกับออกเลขแล้ว → ล็อกก่อนกรอก (server ปฏิเสธอยู่แล้ว)
  const tiInfo = trpc.taxInvoice.forBilling.useQuery({ billingId });
  const linkedTi = tiInfo.data?.linked;

  if (detail.isLoading || tiInfo.isLoading) {
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
    !detail.data.header.customerId ||
    !!detail.data.header.receiptNumber ||
    !!linkedTi
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
                : detail.data.header.receiptNumber
                  ? // SALE-19: ใบเสร็จที่ส่งลูกค้าแล้วต้องไม่เปลี่ยน (server ปฏิเสธด้วย)
                    `ออกใบเสร็จรับเงิน ${detail.data.header.receiptNumber} แล้ว — ถ้าต้องแก้ ให้กด "ยกเลิกใบเสร็จ" ที่เมนูใบเสร็จรับเงิน (ระบุเหตุผล) แล้วกลับมาแก้และออกใบเสร็จใหม่`
                  : linkedTi
                    ? `มีใบกำกับภาษี ${linkedTi.docNumber} แล้ว — ถ้าต้องแก้ ให้ยกเลิกใบกำกับภาษีก่อน (ระบุเหตุผล) หรือออกใบลดหนี้/เพิ่มหนี้`
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
      ? "ใบวางบิลนี้รับเงินครบแล้ว — เมื่อบันทึก ยอดรับเงินจะปรับตามยอดใหม่ (ยอดเดิมถูกจดไว้ในบันทึกการรับเงิน) · ถ้ามีใบกำกับภาษีที่ออกเลขแล้ว ต้องยกเลิกใบกำกับก่อน"
      : header.status === "partial"
        ? "ใบวางบิลนี้รับเงินบางส่วนแล้ว — ยอดที่รับไว้คงเดิม ยอดรวมใหม่ต้องไม่น้อยกว่ายอดที่รับแล้ว"
        : header.status === "sent"
          ? "ใบวางบิลนี้ส่งให้ลูกค้าแล้ว — อย่าลืมส่งฉบับแก้ไขให้ลูกค้าอีกครั้ง"
          : undefined;

  return <NewBillingClient mode="edit" initial={initial} notice={notice} />;
}
