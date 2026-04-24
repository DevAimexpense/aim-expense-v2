// ===========================================
// Step 4: Company setup (name, tax ID, address)
// Creates org + Drive folder structure + Master Sheet
// ===========================================

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { CompanyForm } from "./form";

export default async function CompanyPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  if (
    session.onboardingStep === "line_login" ||
    session.onboardingStep === "line_oa"
  ) {
    redirect("/onboarding/line-oa");
  }
  if (session.onboardingStep === "google") redirect("/onboarding/google");
  if (session.onboardingStep === "done") redirect("/dashboard");

  return <CompanyForm />;
}
