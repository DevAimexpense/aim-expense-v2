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

  if (detail.data.header.status !== "draft") {
    return (
      <div className="app-page">
        <div className="app-card">
          <div className="app-empty">
            <div className="app-empty-icon">🔒</div>
            <p className="app-empty-title">แก้ไขไม่ได้</p>
            <p className="app-empty-desc">
              สถานะปัจจุบัน: {detail.data.header.status} — แก้ไขได้เฉพาะ draft
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

  return <NewBillingClient mode="edit" initial={initial} />;
}
