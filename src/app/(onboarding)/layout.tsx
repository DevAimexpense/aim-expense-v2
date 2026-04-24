// ===========================================
// Onboarding Wizard Layout
// Require session → show progress bar → render step page
// ===========================================

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { OnboardingProgress } from "@/components/onboarding/progress";

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  if (session.onboardingStep === "done") {
    redirect("/dashboard");
  }

  return (
    <main className="onb-root">
      <div className="onb-container">
        <header className="onb-header">
          <div className="onb-brand">
            <div className="onb-logo">A</div>
            <div>
              <div className="onb-brand-title">Aim Expense</div>
              <div className="onb-brand-sub">ตั้งค่าบัญชีก่อนใช้งาน</div>
            </div>
          </div>

          <form action="/api/auth/logout" method="POST">
            <button type="submit" className="onb-logout">
              ออกจากระบบ
            </button>
          </form>
        </header>

        <OnboardingProgress currentStep={session.onboardingStep} />

        <section style={{ marginTop: "2rem", flex: 1 }}>{children}</section>
      </div>
    </main>
  );
}
