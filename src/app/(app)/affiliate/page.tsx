// ===========================================
// /affiliate — Affiliate program (per-user, self-signup).
// Server gate → if not yet a partner show signup form, else the dashboard.
// ===========================================

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { SignupForm } from "./signup-form";
import { Dashboard } from "./dashboard";

export const metadata = {
  title: "โปรแกรมพันธมิตร | Aim Expense",
};

export default async function AffiliatePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.onboardingStep !== "done") redirect("/");

  const partner = await prisma.affiliatePartner.findUnique({
    where: { userId: session.userId },
  });

  return (
    <div className="app-page">
      <div className="app-page-header">
        <div>
          <h1 className="app-page-title">🤝 โปรแกรมพันธมิตร</h1>
          <p className="app-page-subtitle">
            แนะนำ Aim Expense ให้เพื่อน — รับค่าคอมมิชชั่นเมื่อผู้ที่คุณแนะนำสมัครแพ็กเกจแบบเสียเงิน
          </p>
        </div>
      </div>

      {partner ? <Dashboard /> : <SignupForm />}
    </div>
  );
}
