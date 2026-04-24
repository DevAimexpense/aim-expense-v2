import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { TRPCProvider } from "@/lib/trpc/provider";
import { getSession } from "@/lib/auth/session";
import { getOrgContext } from "@/lib/auth/middleware";

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

  // 3. Get org context
  const org = await getOrgContext(session.userId);
  if (!org) {
    redirect("/");
  }

  return (
    <TRPCProvider>
      <div className="flex h-screen overflow-hidden">
        <Sidebar
          permissions={org.permissions}
          orgName={org.orgName}
          userName={session.displayName}
          userAvatar={session.avatarUrl || undefined}
          isAdmin={org.role === "admin"}
        />
        <main className="flex-1 overflow-y-auto bg-slate-50">{children}</main>
      </div>
    </TRPCProvider>
  );
}
