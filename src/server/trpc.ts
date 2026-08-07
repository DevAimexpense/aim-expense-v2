// ===========================================
// Aim Expense — tRPC Core Setup
// Context, router, middleware — เชื่อมต่อ DB จริง
// ===========================================

import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { getSession } from "@/lib/auth/session";
import { getOrgContext } from "@/lib/auth/middleware";
import { prisma } from "@/lib/prisma";
import { isAffiliateAdmin } from "@/lib/affiliate";
import type { Permissions, PermissionKey } from "@/types/permissions";

/**
 * tRPC Context — ทุก request จะมี context นี้
 */
export interface TRPCContext {
  session: {
    userId: string;
    lineUserId: string;
    displayName: string;
    avatarUrl: string | null;
    onboardingStep: string;
    activeOrgId: string | null;
  } | null;

  org: {
    orgId: string;
    orgName: string;
    entityType: string;
    role: string;
    permissions: Permissions;
    eventScope: string[];
    googleSpreadsheetId: string | null;
    googleDriveFolderId: string | null;
  } | null;
}

/**
 * Create context for each request — อ่านจาก cookie + DB จริง
 */
export async function createTRPCContext(): Promise<TRPCContext> {
  const session = await getSession();

  if (!session) {
    return { session: null, org: null };
  }

  // Load org context from DB (respect activeOrgId for multi-org support)
  const org = await getOrgContext(session.userId, session.activeOrgId);

  return {
    session: {
      userId: session.userId,
      lineUserId: session.lineUserId,
      displayName: session.displayName,
      avatarUrl: session.avatarUrl,
      onboardingStep: session.onboardingStep,
      activeOrgId: session.activeOrgId ?? null,
    },
    org: org
      ? {
          orgId: org.orgId,
          orgName: org.orgName,
          entityType: org.entityType,
          role: org.role,
          permissions: org.permissions,
          eventScope: org.eventScope,
          googleSpreadsheetId: org.googleSpreadsheetId,
          googleDriveFolderId: org.googleDriveFolderId,
        }
      : null,
  };
}

/**
 * Initialize tRPC with superjson transformer
 */
const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape }) {
    return shape;
  },
});

/**
 * Export reusable parts
 */
export const router = t.router;
export const publicProcedure = t.procedure;

// ===== Middleware =====

/**
 * Auth middleware — ต้อง login แล้ว
 */
const isAuthenticated = t.middleware(({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "กรุณาเข้าสู่ระบบ",
    });
  }
  return next({
    ctx: { ...ctx, session: ctx.session },
  });
});

/**
 * Org middleware — ต้องมี org context
 */
const hasOrgContext = t.middleware(({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "กรุณาเข้าสู่ระบบ",
    });
  }
  if (!ctx.org) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "กรุณาเลือกองค์กร",
    });
  }
  return next({
    ctx: { ...ctx, session: ctx.session, org: ctx.org },
  });
});

/**
 * Permission middleware factory
 */
function requirePermission(...requiredPermissions: PermissionKey[]) {
  return t.middleware(({ ctx, next }) => {
    if (!ctx.session) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "กรุณาเข้าสู่ระบบ" });
    }
    if (!ctx.org) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "กรุณาเลือกองค์กร" });
    }

    // Admin bypasses
    if (ctx.org.role === "admin") {
      return next({ ctx: { ...ctx, session: ctx.session, org: ctx.org } });
    }

    const missing = requiredPermissions.filter(
      (perm) => !ctx.org!.permissions[perm]
    );
    if (missing.length > 0) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `ไม่มีสิทธิ์: ${missing.join(", ")}`,
      });
    }

    return next({ ctx: { ...ctx, session: ctx.session, org: ctx.org } });
  });
}

/**
 * Protected procedures
 */
export const protectedProcedure = t.procedure.use(isAuthenticated);
export const orgProcedure = t.procedure.use(hasOrgContext);

export function permissionProcedure(...permissions: PermissionKey[]) {
  return t.procedure.use(requirePermission(...permissions));
}

/**
 * Affiliate-admin middleware — there is no global-admin role in the schema, so
 * access to the affiliate payout dashboard is gated by the AFFILIATE_ADMIN_EMAILS
 * allowlist compared against the (unique) User.email.
 */
const isAffiliateAdminMw = t.middleware(async ({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "กรุณาเข้าสู่ระบบ" });
  }
  const user = await prisma.user.findUnique({
    where: { id: ctx.session.userId },
    select: { email: true },
  });
  if (!isAffiliateAdmin(user?.email)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "ไม่มีสิทธิ์เข้าถึง" });
  }
  return next({ ctx: { ...ctx, session: ctx.session } });
});

/** Procedure restricted to affiliate admins (AFFILIATE_ADMIN_EMAILS). */
export const adminProcedure = t.procedure.use(isAffiliateAdminMw);
