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
  // For group contexts: the project (event) the group is bound to (optional).
  groupEventId?: string | null;
  groupEventName?: string | null;
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
 * All active orgs a user belongs to (for the LINE company picker when the user
 * has more than one). Ordered oldest-first for stable display.
 */
export async function getUserActiveOrgs(
  userId: string
): Promise<{ orgId: string; orgName: string }[]> {
  const members = await prisma.orgMember.findMany({
    where: { userId, status: "active" },
    orderBy: { createdAt: "asc" },
    include: { org: { select: { id: true, name: true } } },
  });
  return members.map((m) => ({ orgId: m.org.id, orgName: m.org.name }));
}

/** Why a group could not be resolved to a usable context. */
export interface GroupResolveError {
  error: "unbound" | "binder_inactive";
}

/**
 * Resolve a LINE group → its bound Organization + the admin who bound it.
 * Group submissions are attributed to that admin (`boundBy`) since group
 * members may not have their own Aim Expense account.
 * Returns `{ error: "unbound" }` if the group isn't bound to any org, and
 * `{ error: "binder_inactive" }` when the admin who bound it is no longer an
 * active member — the binding must not keep writing in their name (LINE-07).
 */
export async function resolveGroupContext(
  groupId: string
): Promise<LineUserContext | GroupResolveError> {
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
  if (!group) return { error: "unbound" };

  const binderMembership = await prisma.orgMember.findFirst({
    where: { userId: group.boundBy.id, orgId: group.org.id, status: "active" },
    select: { id: true },
  });
  if (!binderMembership) return { error: "binder_inactive" };

  return {
    user: group.boundBy,
    orgId: group.org.id,
    orgName: group.org.name,
    groupEventId: group.eventId,
    groupEventName: group.eventName,
  };
}
