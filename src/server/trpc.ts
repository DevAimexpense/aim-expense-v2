// ===========================================
// Aim Expense — tRPC Core Setup
// Context, router, middleware — เชื่อมต่อ DB จริง
// ===========================================

import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { getSession } from "@/lib/auth/session";
import { getOrgContext } from "@/lib/auth/middleware";
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
  } | null;

  org: {
    orgId: string;
    orgName: string;
    role: string;
    permissions: Permissions;
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
    },
    org: org
      ? {
          orgId: org.orgId,
          orgName: org.orgName,
          role: org.role,
          permissions: org.permissions,
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
