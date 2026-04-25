// ===========================================
// Resolve LINE userId → User + active Org
// Used by webhook handlers (no session cookie available)
// ===========================================

import { prisma } from "@/lib/prisma";

export interface LineUserContext {
  user: {
    id: string;
    email: string | null;
    lineUserId: string;
    lineDisplayName: string;
    onboardingStep: string;
  };
  orgId: string;
  orgName: string;
}

/**
 * Find Aim Expense user from LINE userId + their latest active org membership.
 * Returns null if user doesn't exist or has no org.
 */
export async function resolveLineContext(
  lineUserId: string
): Promise<LineUserContext | null> {
  const user = await prisma.user.findUnique({
    where: { lineUserId },
    select: {
      id: true,
      email: true,
      lineUserId: true,
      lineDisplayName: true,
      onboardingStep: true,
    },
  });
  if (!user) return null;

  // Pick latest joined OrgMember as "active org"
  // (matches initial onboarding behavior — JWT activeOrgId only set on web login)
  const member = await prisma.orgMember.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: { org: { select: { id: true, name: true } } },
  });
  if (!member) return null;

  return {
    user,
    orgId: member.org.id,
    orgName: member.org.name,
  };
}
