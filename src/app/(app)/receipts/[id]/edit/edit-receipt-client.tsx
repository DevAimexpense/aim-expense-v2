"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import {
  NewBillingClient,
  type InitialBillingData,
} from "../../../billings/new/new-billing-client";

function Blocked({ icon, title, desc }: { icon: string; title: string; desc?: string }) {
  return (
    <div className="app-page">
      <div className="app-card">
        <div className="app-empty">
          <div className="app-empty-icon">{icon}</div>
          <p className="app-empty-title">{title}</p>
          {desc && <p className="app-empty-desc">{desc}</p>}
          <Link href="/receipts" className="app-btn app-btn-primary">
            ← กลับไปที่ใบเสร็จรับเงิน
          </Link>
        </div>
      </div>
    </div>
  );
}

export function EditReceiptClient({ billingId }: { billingId: string }) {
  const detail = trpc.billing.getById.useQuery({ billingId });

  if (detail.isLoading) {
    return <div className="app-page">กำลังโหลด...</div>;
  }
  if (!detail.data) {
    return <Blocked icon="❓" title="ไม่พบใบเสร็จรับเงิน" />;
  }

  const { header, lines } = detail.data;
  if (header.docKind !== "receipt") {
    return (
      <div className="app-page">
        <div className="app-card">
          <div className="app-empty">
            <div className="app-empty-icon">🧾</div>
            <p className="app-empty-title">ใบเสร็จนี้ออกจากใบวางบิล {header.docNumber}</p>
            <p className="app-empty-desc">
              แก้ไขที่ใบวางบิล แล้วใบเสร็จจะเปลี่ยนตาม (เลขที่ใบเสร็จคงเดิม)
            </p>
            <Link
              href={`/billings/${billingId}/edit`}
              className="app-btn app-btn-primary"
            >
              ✏️ แก้ไขใบวางบิล
            </Link>
          </div>
        </div>
      </div>
    );
  }
  if (header.status === "void") {
    return <Blocked icon="🔒" title="ใบเสร็จรับเงินนี้ถูกยกเลิกแล้ว" />;
  }

  const initial: InitialBillingData = {
    billingId: header.billingId,
    customerId: header.customerId,
    docDate: header.docDate,
    dueDate: header.docDate,
    projectName: header.projectName,
    eventId: header.eventId,
    vatIncluded: header.vatIncluded,
    isVat: header.isVat,
    discountAmount: header.discountAmount,
    whtPercent: header.whtPercent,
    notes: header.notes,
    terms: "",
    paymentMethod: header.paymentMethod,
    lines: lines.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      discountPercent: l.discountPercent,
      notes: l.notes,
    })),
  };

  return <NewBillingClient mode="edit" kind="receipt" initial={initial} />;
}
