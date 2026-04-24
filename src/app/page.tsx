import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";

/**
 * Root page — smart redirect based on auth + onboarding state
 */
export default async function RootPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

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
