// ===========================================
// /backoffice/customers/[orgId] — รายละเอียดบริษัทลูกค้า 1 แห่ง (Postgres เท่านั้น)
// ประตูเข้าอยู่ที่ ../../layout.tsx
// ===========================================

import { notFound } from "next/navigation";
import { OrgDetailClient } from "./org-detail-client";

export const metadata = {
  title: "รายละเอียดลูกค้า | Aim Expense",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function BackofficeOrgDetailPage({
  params,
}: {
  params: { orgId: string };
}) {
  if (!UUID.test(params.orgId)) notFound();
  return <OrgDetailClient orgId={params.orgId} />;
}
