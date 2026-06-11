import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import LandingPage from "@/components/landing-page";

/**
 * Root page (/):
 * - Logged OUT → public landing page (explains the app, no login required).
 *   Required by Google verification: the home page must be viewable without
 *   login and must describe the app's purpose.
 * - Logged IN → smart redirect based on onboarding state.
 */
export default async function RootPage() {
  const session = await getSession();

  if (!session) {
    return <LandingPage />;
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
