// ===========================================
// /admin/affiliate — affiliate payout admin (env allowlist gated).
// notFound() for non-admins so the route's existence isn't revealed.
// ===========================================

import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { isAffiliateAdmin } from "@/lib/affiliate";
import { AdminClient } from "./admin-client";

export const metadata = {
  title: "Affiliate Admin | Aim Expense",
};

export default async function AdminAffiliatePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { email: true },
  });
  if (!isAffiliateAdmin(user?.email)) notFound();

  return (
    <div className="app-page">
      <div className="app-page-header">
        <div>
          <h1 className="app-page-title">🛠️ Affiliate Admin</h1>
          <p className="app-page-subtitle">
            ค่าคอมมิชชั่นที่ถึงกำหนด → โอน PromptPay ให้พันธมิตร → กด &ldquo;จ่ายแล้ว&rdquo;
          </p>
        </div>
      </div>
      <AdminClient />
    </div>
  );
}
