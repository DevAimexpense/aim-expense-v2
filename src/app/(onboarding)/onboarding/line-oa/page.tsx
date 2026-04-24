// ===========================================
// Step 2: Connect LINE OA (add friend)
// ===========================================

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { LineOaClient } from "./client";

export default async function LineOaPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // Skip ahead if already past this step
  if (
    session.onboardingStep !== "line_login" &&
    session.onboardingStep !== "line_oa"
  ) {
    // ถ้า user มี org แล้ว (ถูกเชิญ/เจ้าของ) → ไป /select-org ไม่ต้องทำ google/company
    const count = await prisma.orgMember.count({
      where: { userId: session.userId, status: "active" },
    });
    redirect(count > 0 ? "/select-org" : "/onboarding/google");
  }

  const oaId = process.env.LINE_OA_BASIC_ID || "";

  return <LineOaClient oaBasicId={oaId} />;
}
