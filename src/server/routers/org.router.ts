// ===========================================
// Aim Expense — Organization Router
// สร้าง org + Google Sheets + Drive + set permissions
// ===========================================

import { z } from "zod";
import { router, protectedProcedure, orgProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";
import { GoogleSheetsService } from "../services/google-sheets.service";
import { GoogleDriveService } from "../services/google-drive.service";
import { decryptToken } from "@/lib/google/token-encryption";
import { refreshAccessToken } from "@/lib/google/oauth";
import { encryptToken } from "@/lib/google/token-encryption";
import { getDefaultPermissions } from "@/lib/permissions";
import { TRPCError } from "@trpc/server";

/**
 * Helper: Get valid access token for a user (refresh if expired)
 */
async function getValidAccessToken(userId: string): Promise<string> {
  const conn = await prisma.googleConnection.findUnique({
    where: { userId },
  });

  if (!conn || !conn.isActive) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "ไม่ได้เชื่อมต่อ Google Account",
    });
  }

  // Check if token is expired (with 5 min buffer)
  const isExpired =
    conn.tokenExpiry &&
    new Date(conn.tokenExpiry).getTime() < Date.now() + 5 * 60 * 1000;

  if (isExpired && conn.refreshToken) {
    try {
      const refreshToken = decryptToken(conn.refreshToken);
      const { accessToken, expiryDate } =
        await refreshAccessToken(refreshToken);

      // Update DB with new token
      await prisma.googleConnection.update({
        where: { userId },
        data: {
          accessToken: encryptToken(accessToken),
          tokenExpiry: expiryDate ? new Date(expiryDate) : null,
        },
      });

      return accessToken;
    } catch (err) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Token หมดอายุ กรุณาเชื่อมต่อ Google ใหม่",
      });
    }
  }

  return decryptToken(conn.accessToken);
}

export const orgRouter = router({
  /**
   * List all orgs that current user belongs to (for /select-org picker)
   */
  mine: protectedProcedure.query(async ({ ctx }) => {
    const memberships = await prisma.orgMember.findMany({
      where: {
        userId: ctx.session.userId,
        status: "active",
      },
      include: {
        org: {
          select: { id: true, name: true, logoUrl: true, slug: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });
    return memberships.map((m) => ({
      orgId: m.orgId,
      orgName: m.org.name,
      logoUrl: m.org.logoUrl,
      slug: m.org.slug,
      role: m.role,
      joinedAt: m.joinedAt,
    }));
  }),

  /**
   * Set active org (called from /select-org picker)
   * Updates session cookie with new activeOrgId
   */
  setActive: protectedProcedure
    .input(z.object({ orgId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const membership = await prisma.orgMember.findUnique({
        where: {
          orgId_userId: { orgId: input.orgId, userId: ctx.session.userId },
        },
      });
      if (!membership || membership.status !== "active") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "คุณไม่ใช่สมาชิกขององค์กรนี้",
        });
      }

      const { setSessionCookie } = await import("@/lib/auth/session");
      const user = await prisma.user.findUnique({ where: { id: ctx.session.userId } });
      if (!user) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await setSessionCookie({
        userId: user.id,
        lineUserId: user.lineUserId,
        displayName: user.lineDisplayName,
        avatarUrl: user.avatarUrl,
        onboardingStep: user.onboardingStep,
        activeOrgId: input.orgId,
      });

      return { success: true, orgId: input.orgId };
    }),

  /**
   * Get current org info
   */
  current: orgProcedure.query(async ({ ctx }) => {
    const org = await prisma.organization.findUnique({
      where: { id: ctx.org.orgId },
      include: {
        subscription: true,
        _count: { select: { members: true } },
      },
    });
    return org;
  }),

  /**
   * Get organization details (name, taxId, address, branch)
   * Used by receipt modal to verify buyer info against org data
   */
  get: orgProcedure.query(async ({ ctx }) => {
    const org = await prisma.organization.findUnique({
      where: { id: ctx.org.orgId },
      select: {
        id: true,
        name: true,
        taxId: true,
        address: true,
        phone: true,
        branchType: true,
        branchNumber: true,
      },
    });
    if (!org) {
      throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบองค์กร" });
    }
    return org;
  }),

  /**
   * Get current user's role + permissions in this org
   * Used by frontend to gate UI (e.g. show edit button or readonly view)
   */
  me: orgProcedure.query(({ ctx }) => {
    return {
      userId: ctx.session.userId,
      displayName: ctx.session.displayName,
      orgId: ctx.org.orgId,
      role: ctx.org.role,
      permissions: ctx.org.permissions,
    };
  }),

  /**
   * Create new organization
   * → สร้าง Google Sheets master template + Drive folder
   * → สร้าง OrgMember (admin) + UserPermission (full access)
   * → สร้าง Subscription (free plan)
   */
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1, "กรุณากรอกชื่อองค์กร"),
        slug: z
          .string()
          .min(2)
          .max(50)
          .regex(/^[a-z0-9-]+$/, "ใช้ตัวอักษรพิมพ์เล็ก ตัวเลข และ - เท่านั้น")
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.userId;

      // Check if user already owns an org
      const existingOrg = await prisma.organization.findFirst({
        where: { ownerId: userId },
      });
      if (existingOrg) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "คุณมีองค์กรอยู่แล้ว",
        });
      }

      // Generate slug
      const slug =
        input.slug ||
        input.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "") ||
        `org-${Date.now()}`;

      // Get access token
      const accessToken = await getValidAccessToken(userId);

      // 1. Create Google Sheets master template
      const { spreadsheetId } =
        await GoogleSheetsService.createMasterSheet(accessToken, input.name);

      // 2. Create Google Drive folder
      const driveService = new GoogleDriveService(accessToken);
      const driveFolders = await driveService.createOrgFolder(input.name);
      const driveFolderId = driveFolders.rootId;

      // 3. Seed default banks
      const sheetsService = new GoogleSheetsService(
        accessToken,
        spreadsheetId
      );
      await sheetsService.seedDefaultBanks();

      // 4. Create org + member + permissions + subscription in one transaction
      const org = await prisma.$transaction(async (tx) => {
        // Create organization
        const newOrg = await tx.organization.create({
          data: {
            name: input.name,
            slug,
            ownerId: userId,
            taxId: "",
            address: "",
            googleSpreadsheetId: spreadsheetId,
            googleDriveFolderId: driveFolderId,
            driveReceiptsFolderId: driveFolders.receiptsId,
            driveDocumentsFolderId: driveFolders.documentsId,
            driveReportsFolderId: driveFolders.reportsId,
          },
        });

        // Create owner as admin member
        await tx.orgMember.create({
          data: {
            orgId: newOrg.id,
            userId,
            role: "admin",
            status: "active",
            joinedAt: new Date(),
          },
        });

        // Set full permissions for admin
        const adminPerms = getDefaultPermissions("admin");
        await tx.userPermission.create({
          data: {
            orgId: newOrg.id,
            userId,
            ...adminPerms,
          },
        });

        // Create free subscription
        await tx.subscription.create({
          data: {
            orgId: newOrg.id,
            plan: "free",
            status: "active",
            maxMembers: 2,
            maxEvents: 3,
            scanCredits: 8,
          },
        });

        // Audit log
        await tx.auditLog.create({
          data: {
            orgId: newOrg.id,
            userId,
            action: "create",
            entityType: "organization",
            entityRef: newOrg.id,
            summary: `สร้างองค์กร "${input.name}"`,
          },
        });

        return newOrg;
      });

      return {
        success: true,
        orgId: org.id,
        slug: org.slug,
        spreadsheetId,
        driveFolderId,
      };
    }),

  /**
   * Update org settings
   */
  update: orgProcedure
    .input(
      z.object({
        name: z.string().min(1).optional(),
        taxId: z.string().regex(/^\d{13}$/, "เลขผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก").optional(),
        branchType: z.enum(["HQ", "Branch"]).optional(),
        branchNumber: z.string().regex(/^\d{5}$/, "เลขสาขาต้องเป็นตัวเลข 5 หลัก").optional(),
        address: z.string().optional(),
        phone: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Only admin can update
      if (ctx.org.role !== "admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "เฉพาะ Admin เท่านั้น",
        });
      }

      // If branchType=HQ, force branchNumber to "00000"
      const data = { ...input };
      if (data.branchType === "HQ") {
        data.branchNumber = "00000";
      }

      await prisma.organization.update({
        where: { id: ctx.org.orgId },
        data,
      });

      return { success: true };
    }),

  /**
   * List org members
   */
  members: orgProcedure.query(async ({ ctx }) => {
    const members = await prisma.orgMember.findMany({
      where: { orgId: ctx.org.orgId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return members;
  }),
});
