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
      activeOrgId: true,
    },
  });
  if (!user) return null;

  // Prefer the org the user last activated on web (persisted to DB so the LINE
  // webhook can follow the web's active company). Only if they're still an
  // active member of it — otherwise fall back to their latest joined org.
  let member = user.activeOrgId
    ? await prisma.orgMember.findFirst({
        where: { userId: user.id, orgId: user.activeOrgId, status: "active" },
        include: { org: { select: { id: true, name: true } } },
      })
    : null;

  if (!member) {
    member = await prisma.orgMember.findFirst({
      where: { userId: user.id, status: "active" },
      orderBy: { createdAt: "desc" },
      include: { org: { select: { id: true, name: true } } },
    });
  }
  if (!member) return null;

  return {
    user,
    orgId: member.org.id,
    orgName: member.org.name,
  };
}

/**
 * Resolve a LINE group → its bound Organization + the admin who bound it.
 * Group submissions are attributed to that admin (`boundBy`) since group
 * members may not have their own Aim Expense account.
 * Returns null if the group isn't bound to any org.
 */
export async function resolveGroupContext(
  groupId: string
): Promise<LineUserContext | null> {
  const group = await prisma.lineGroup.findUnique({
    where: { groupId },
    include: {
      org: { select: { id: true, name: true } },
      boundBy: {
        select: {
          id: true,
          email: true,
          lineUserId: true,
          lineDisplayName: true,
          onboardingStep: true,
        },
      },
    },
  });
  if (!group) return null;

  return {
    user: group.boundBy,
    orgId: group.org.id,
    orgName: group.org.name,
  };
}
