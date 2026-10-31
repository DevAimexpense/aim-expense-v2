import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { Landing } from "@/components/site/landing";
import { pageMeta } from "@/lib/site-lang";

export const metadata = pageMeta("th", "/", {
  title: "Aim Expense — บัญชีและภาษีของ SME ไทย จบได้ในแชต LINE",
  description:
    "ถ่ายใบเสร็จส่งใน LINE ระบบบันทึกค่าใช้จ่ายให้ทันที ออกใบกำกับภาษีและหัก ณ ที่จ่ายบนฟอร์มกรมสรรพากร ข้อมูลอยู่ใน Google Sheet ของคุณเอง ทดลองฟรี 30 วัน",
});

/**
 * Root page (/):
 * - Logged OUT → public landing page (viewable without login — Google verification + AEO)
 * - Logged IN → smart redirect based on onboarding state.
 */
export default async function RootPage() {
  const session = await getSession();
  if (!session) return <Landing lang="th" />;

  switch (session.onboardingStep) {
    case "line_login":
    case "line_oa":
      redirect("/onboarding/line-oa");
    case "google":
      redirect("/onboarding/google");
    case "company":
      redirect("/onboarding/company");
    case "done":
    default:
      redirect("/dashboard");
  }
}
