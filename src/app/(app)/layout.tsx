import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { TRPCProvider } from "@/lib/trpc/provider";
import { getSession } from "@/lib/auth/session";
import { getOrgContext } from "@/lib/auth/middleware";
import { isBackofficeAdmin } from "@/lib/auth/backoffice";

/**
 * App Layout — Auth check + Sidebar + Main Content
 * Server Component: อ่าน session จาก cookie จริง
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 1. Check auth
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  // 2. Must complete onboarding first
  if (session.onboardingStep !== "done") {
    redirect("/");
  }

  // 3. Get org context (respect the active org so multi-business switching works)
  //    CO-06: ไม่มี membership ที่ active → ไป /select-org (หน้าที่ render ได้จริง)
  //    เดิม → "/" → /dashboard → กลับมาที่นี่ = ERR_TOO_MANY_REDIRECTS
  const org = await getOrgContext(session.userId, session.activeOrgId);
  if (!org) {
    redirect("/select-org");
  }

  // 4. เมนู "หลังบ้านทีมงาน" — ตามสมาชิกภาพของผู้ใช้ ไม่ใช่บริษัทที่เลือกอยู่
  //    (admin ของบริษัทหลังบ้านสลับไปดูบริษัทลูกค้าแล้วเมนูต้องไม่หาย)
  const backofficeAdmin = await isBackofficeAdmin(session.userId);

  return (
    <TRPCProvider>
      <div className="flex h-screen overflow-hidden">
        <Sidebar
          permissions={org.permissions}
          orgName={org.orgName}
          entityType={org.entityType}
          userName={session.displayName}
          userAvatar={session.avatarUrl || undefined}
          isAdmin={org.role === "admin"}
          isBackofficeAdmin={backofficeAdmin}
          vatRegistered={org.vatRegistered}
        />
        <main className="flex-1 overflow-y-auto bg-slate-50">{children}</main>
      </div>
    </TRPCProvider>
  );
}
