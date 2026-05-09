"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import {
  NewTaxInvoiceClient,
  type InitialTaxInvoiceData,
} from "../../new/new-tax-invoice-client";

export function EditTaxInvoiceClient({
  taxInvoiceId,
}: {
  taxInvoiceId: string;
}) {
  const detail = trpc.taxInvoice.getById.useQuery({ taxInvoiceId });

  if (detail.isLoading) {
    return <div className="app-page">กำลังโหลด...</div>;
  }
  if (!detail.data) {
    return (
      <div className="app-page">
        <div className="app-card">
          <div className="app-empty">
            <div className="app-empty-icon">❓</div>
            <p className="app-empty-title">ไม่พบใบกำกับภาษี</p>
            <Link href="/tax-invoices" className="app-btn app-btn-primary">
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
              (ใบที่ออกเลขแล้วจะ lock ตามประมวลรัษฎากร)
            </p>
            <Link
              href={`/tax-invoices/${taxInvoiceId}`}
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
  const initial: InitialTaxInvoiceData = {
    taxInvoiceId: header.taxInvoiceId,
    customerId: header.customerId,
    docDate: header.docDate,
    projectName: header.projectName,
    eventId: header.eventId,
    vatIncluded: header.vatIncluded,
    discountAmount: header.discountAmount,
    notes: header.notes,
    lines: lines.map((l) => ({
      description: l.description,
      expenseNature: l.expenseNature,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      discountPercent: l.discountPercent,
      notes: l.notes,
    })),
  };

  return <NewTaxInvoiceClient mode="edit" initial={initial} />;
}
