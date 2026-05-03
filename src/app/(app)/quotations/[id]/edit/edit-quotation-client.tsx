"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import {
  NewQuotationClient,
  type InitialQuotationData,
} from "../../new/new-quotation-client";

export function EditQuotationClient({
  quotationId,
}: {
  quotationId: string;
}) {
  const detail = trpc.quotation.getById.useQuery({ quotationId });

  if (detail.isLoading) {
    return <div className="app-page">กำลังโหลด...</div>;
  }
  if (!detail.data) {
    return (
      <div className="app-page">
        <div className="app-card">
          <div className="app-empty">
            <div className="app-empty-icon">❓</div>
            <p className="app-empty-title">ไม่พบใบเสนอราคา</p>
            <Link href="/quotations" className="app-btn app-btn-primary">
              ← กลับ
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Block edit if not draft
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
              href={`/quotations/${quotationId}`}
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
  const initial: InitialQuotationData = {
    quotationId: header.quotationId,
    customerId: header.customerId,
    docDate: header.docDate,
    validUntil: header.validUntil,
    projectName: header.projectName,
    eventId: header.eventId,
    vatIncluded: header.vatIncluded,
    discountAmount: header.discountAmount,
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

  return <NewQuotationClient mode="edit" initial={initial} />;
}
