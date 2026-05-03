// ===========================================
// /quotations — Server entry (plan-gated pro+)
// Fetch initial list server-side → pass to client (skip extra round-trip on first paint)
// ===========================================

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { appRouter } from "@/server/routers/_app";
import { createTRPCContext } from "@/server/trpc";
import { QuotationsClient } from "./quotations-client";

export const metadata = {
  title: "ใบเสนอราคา | Aim Expense",
};

const ALLOWED_PLANS = ["pro", "business", "max", "enterprise"];

export default async function QuotationsPage() {
  const ctx = await createTRPCContext();
  if (!ctx.session) redirect("/login");
  if (ctx.session.onboardingStep !== "done") redirect("/");
  if (!ctx.org) redirect("/");

  const subscription = await prisma.subscription.findUnique({
    where: { orgId: ctx.org.orgId },
  });
  if (!ALLOWED_PLANS.includes(subscription?.plan || "free")) {
    redirect("/dashboard?upgrade=required");
  }

  // Server-side initial fetch — skip client-side tRPC roundtrip on first paint
  const caller = appRouter.createCaller(ctx);
  const initialQuotations = await caller.quotation.list();

  return <QuotationsClient initialQuotations={initialQuotations} />;
}
