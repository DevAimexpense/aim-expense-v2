// /credit-notes/new?kind=credit|debit&sourceType=tax_invoice|receipt&sourceId=… — ออกใบลด/เพิ่มหนี้ (SALE-02)
import { NewCreditNoteClient } from "./new-credit-note-client";
import { requireFeature, requireCompanyOrg } from "@/lib/auth/require-plan";

export const metadata = {
  title: "ออกใบลดหนี้ / ใบเพิ่มหนี้ | Aim Expense",
};

export default async function NewCreditNotePage({
  searchParams,
}: {
  searchParams?: { kind?: string; sourceType?: string; sourceId?: string };
}) {
  await requireFeature("revenueModule");
  await requireCompanyOrg();
  const kind = searchParams?.kind === "debit" ? "debit" : "credit";
  const sourceType = searchParams?.sourceType === "receipt" ? "receipt" : "tax_invoice";
  return <NewCreditNoteClient kind={kind} sourceType={sourceType} sourceId={searchParams?.sourceId || ""} />;
}
