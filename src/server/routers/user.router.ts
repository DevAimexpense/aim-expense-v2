// ===========================================
// Aim Expense — User Management Router
// - Invite via LINE link
// - List / Remove / Update role + eventScope members
// ===========================================

import { z } from "zod";
import { randomBytes } from "crypto";
import { TRPCError } from "@trpc/server";
import type { Prisma } from "@prisma/client";
import { router, orgProcedure, permissionProcedure, publicProcedure, protectedProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";
import { DEFAULT_PERMISSIONS } from "@/lib/permissions";
import { checkQuota, effectivePlan, PLAN_LABELS } from "@/lib/plans";
import type { OrgRole } from "@/types/permissions";
import { safeAuditLog } from "@/server/lib/audit";

const RoleEnum = z.enum(["admin", "manager", "accountant", "staff", "project_manager"]);

function generateToken(): string {
  return randomBytes(16).toString("hex"); // 32 chars
}

/**
 * CO-08: audit log ต้องไม่ทำให้ mutation ล้ม — ข้อมูลหลักบันทึกไปแล้ว
 * ถ้า Postgres สะดุดให้แค่รายงาน (ไม่งั้นผู้ใช้กดซ้ำ = แถวซ้ำ)
 */
type Db = Prisma.TransactionClient | typeof prisma;

/** เจ้าของ org — ห้ามแก้ role/status/ลบ (ใช้ร่วมกันใน updateMember / removeMember) */
async function getOrgOwnerId(db: Db, orgId: string): Promise<string | null> {
  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { ownerId: true },
  });
  return org?.ownerId ?? null;
}

/**
 * BIL-08: บังคับจำนวนผู้ใช้ตามแพ็กเกจ — นับสมาชิก active + คำเชิญที่ยังค้าง
 * `excludeInvitationId` = คำเชิญที่กำลัง accept (คนนั้นกำลังกลายเป็นสมาชิก ไม่นับซ้ำ)
 */
async function assertUserQuota(
  db: Db,
  orgId: string,
  excludeInvitationId?: string,
): Promise<void> {
  const [sub, activeMembers, pendingInvites] = await Promise.all([
    db.subscription.findUnique({
      where: { orgId },
      select: { plan: true, trialPlan: true, trialEndsAt: true },
    }),
    db.orgMember.count({ where: { orgId, status: "active" } }),
    db.invitation.count({
      where: {
        orgId,
        status: "pending",
        expiresAt: { gt: new Date() },
        ...(excludeInvitationId ? { id: { not: excludeInvitationId } } : {}),
      },
    }),
  ]);
  const plan = effectivePlan(sub);
  const { ok, limit } = checkQuota(plan, "users", activeMembers + pendingInvites);
  if (!ok) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `แพ็กเกจ ${PLAN_LABELS[plan]} รองรับผู้ใช้สูงสุด ${limit} คน — อัปเกรดเพื่อเพิ่มสมาชิก`,
    });
  }
}

export const userRouter = router({
  /**
   * List org members + pending invitations
   */
  list: permissionProcedure("manageUsers").query(async ({ ctx }) => {
    const members = await prisma.orgMember.findMany({
      where: { orgId: ctx.org.orgId },
      include: {
        user: {
          select: {
            id: true,
            lineDisplayName: true,
            linePictureUrl: true,
            lineEmail: true,
            email: true,
            fullName: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const invitations = await prisma.invitation.findMany({
      where: {
        orgId: ctx.org.orgId,
        status: "pending",
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    return {
      members: members.map((m) => ({
        memberId: m.id,
        userId: m.userId,
        role: m.role as OrgRole,
        status: m.status,
        eventScope: m.eventScope,
        joinedAt: m.joinedAt,
        displayName: m.user.lineDisplayName || m.user.fullName || "—",
        avatarUrl: m.user.linePictureUrl,
        email: m.user.email || m.user.lineEmail || "",
      })),
      invitations: invitations.map((i) => ({
        invitationId: i.id,
        token: i.token,
        displayName: i.displayName,
        role: i.role as OrgRole,
        eventScope: i.eventScope,
        expiresAt: i.expiresAt,
        createdAt: i.createdAt,
      })),
    };
  }),

  /**
   * Create invitation → return shareable link
   */
  invite: permissionProcedure("manageUsers")
    .input(
      z.object({
        displayName: z.string().min(1, "กรุณากรอกชื่อผู้ได้รับเชิญ").max(100),
        role: RoleEnum,
        eventScope: z.array(z.string()).default([]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // CO-01: เฉพาะ admin เท่านั้นที่เชิญคนเข้ามาเป็น admin ได้
      if (input.role === "admin" && ctx.org.role !== "admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "เฉพาะ admin เท่านั้นที่เชิญผู้ใช้เป็น admin ได้",
        });
      }

      // Expiry 24 hours from now
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      // BIL-08: นับโควตาและสร้างคำเชิญใน transaction เดียว (กันดับเบิลคลิกเกินแพ็กเกจ)
      const invitation = await prisma.$transaction(async (tx) => {
        await assertUserQuota(tx, ctx.org.orgId);
        return tx.invitation.create({
          data: {
            orgId: ctx.org.orgId,
            token: generateToken(),
            displayName: input.displayName,
            role: input.role,
            eventScope: input.eventScope,
            expiresAt,
            invitedById: ctx.session.userId,
          },
        });
      });

      await safeAuditLog({
        orgId: ctx.org.orgId,
        userId: ctx.session.userId,
        action: "invite",
        entityType: "user",
        entityRef: invitation.id,
        summary: `ส่งคำเชิญ "${input.displayName}" เป็น ${input.role}`,
      });

      return {
        invitationId: invitation.id,
        token: invitation.token,
        expiresAt: invitation.expiresAt,
      };
    }),

  /**
   * Cancel a pending invitation
   */
  cancelInvitation: permissionProcedure("manageUsers")
    .input(z.object({ invitationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const inv = await prisma.invitation.findFirst({
        where: { id: input.invitationId, orgId: ctx.org.orgId },
      });
      if (!inv) throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบคำเชิญ" });
      await prisma.invitation.update({
        where: { id: inv.id },
        data: { status: "cancelled" },
      });
      return { success: true };
    }),

  /**
   * Update member role + eventScope
   */
  updateMember: permissionProcedure("manageUsers")
    .input(
      z.object({
        memberId: z.string(),
        role: RoleEnum.optional(),
        eventScope: z.array(z.string()).optional(),
        status: z.enum(["active", "suspended"]).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const member = await prisma.orgMember.findFirst({
        where: { id: input.memberId, orgId: ctx.org.orgId },
      });
      if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบสมาชิก" });

      const touchesRoleOrStatus = input.role !== undefined || input.status !== undefined;

      // CO-01: ห้ามเปลี่ยน role/status ของตัวเองทุกกรณี (เดิมกันแค่ "ลดสิทธิ์" → เลื่อนตัวเองเป็น admin ได้)
      if (member.userId === ctx.session.userId && touchesRoleOrStatus) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "ไม่สามารถเปลี่ยน role หรือสถานะของตัวเองได้",
        });
      }

      // CO-01: ห้ามแตะ role/status ของเจ้าของ org (เหมือน removeMember)
      const ownerId = await getOrgOwnerId(prisma, ctx.org.orgId);
      if (ownerId === member.userId && touchesRoleOrStatus) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "ไม่สามารถเปลี่ยน role หรือสถานะของเจ้าขององค์กรได้",
        });
      }

      // CO-01: เฉพาะ admin เท่านั้นที่กำหนด role admin หรือแก้ role/status ของ admin คนอื่นได้
      if (ctx.org.role !== "admin") {
        if (input.role === "admin") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "เฉพาะ admin เท่านั้นที่กำหนด role admin ได้",
          });
        }
        if (member.role === "admin" && touchesRoleOrStatus) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "เฉพาะ admin เท่านั้นที่แก้ไข role หรือสถานะของ admin ได้",
          });
        }
      }

      const updated = await prisma.orgMember.update({
        where: { id: member.id },
        data: {
          ...(input.role ? { role: input.role } : {}),
          ...(input.eventScope !== undefined ? { eventScope: input.eventScope } : {}),
          ...(input.status ? { status: input.status } : {}),
        },
      });

      // ถ้าเปลี่ยน role → อัปเดต permissions ด้วย (default ของ role ใหม่)
      if (input.role) {
        const newPerms = DEFAULT_PERMISSIONS[input.role];
        await prisma.userPermission.upsert({
          where: {
            orgId_userId: { orgId: ctx.org.orgId, userId: member.userId },
          },
          create: {
            orgId: ctx.org.orgId,
            userId: member.userId,
            ...newPerms,
          },
          update: { ...newPerms, isCustom: false },
        });
      }

      return { success: true, member: updated };
    }),

  /**
   * Remove member from org
   */
  removeMember: permissionProcedure("manageUsers")
    .input(z.object({ memberId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const member = await prisma.orgMember.findFirst({
        where: { id: input.memberId, orgId: ctx.org.orgId },
      });
      if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบสมาชิก" });

      if (member.userId === ctx.session.userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "ไม่สามารถลบตัวเองออกจากองค์กรได้",
        });
      }

      // ป้องกันลบ owner
      const ownerId = await getOrgOwnerId(prisma, ctx.org.orgId);
      if (ownerId === member.userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "ไม่สามารถลบเจ้าขององค์กรได้",
        });
      }

      // CO-01: non-admin ลบ admin ไม่ได้ (ไม่งั้น manager ที่มี manageUsers ถอด admin ทุกคนได้)
      if (member.role === "admin" && ctx.org.role !== "admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "เฉพาะ admin เท่านั้นที่ลบ admin ได้",
        });
      }

      await prisma.orgMember.delete({ where: { id: member.id } });
      await prisma.userPermission.deleteMany({
        where: { orgId: ctx.org.orgId, userId: member.userId },
      });

      await safeAuditLog({
        orgId: ctx.org.orgId,
        userId: ctx.session.userId,
        action: "remove_member",
        entityType: "user",
        entityRef: member.userId,
        summary: `ลบสมาชิกออกจากองค์กร`,
      });

      return { success: true };
    }),

  /**
   * Public: Get invitation info by token (no auth required — for /invite/{token} page)
   */
  getInvitation: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const inv = await prisma.invitation.findUnique({
        where: { token: input.token },
        include: { org: { select: { name: true, logoUrl: true } } },
      });
      if (!inv) return null;
      return {
        displayName: inv.displayName,
        role: inv.role,
        status: inv.status,
        expiresAt: inv.expiresAt,
        orgName: inv.org.name,
        orgLogoUrl: inv.org.logoUrl,
        isExpired: inv.expiresAt < new Date(),
      };
    }),

  /**
   * Accept invitation (called after LINE login on /invite/{token})
   */
  acceptInvitation: protectedProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const inv = await prisma.invitation.findUnique({
        where: { token: input.token },
      });
      if (!inv) throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบคำเชิญ" });
      if (inv.status !== "pending")
        throw new TRPCError({ code: "BAD_REQUEST", message: "คำเชิญถูกใช้งานแล้วหรือยกเลิก" });
      if (inv.expiresAt < new Date())
        throw new TRPCError({ code: "BAD_REQUEST", message: "คำเชิญหมดอายุ" });

      const perms = DEFAULT_PERMISSIONS[inv.role as OrgRole];
      const userId = ctx.session.userId;

      // CO-05: ทำทั้งหมดใน transaction เดียว — claim คำเชิญแบบ atomic (pending → accepted)
      // กัน accept ซ้ำ/พร้อมกัน แล้วค่อยสร้างสมาชิก + sync User.activeOrgId (LINE webhook ใช้ค่านี้)
      const user = await prisma.$transaction(async (tx) => {
        const claimed = await tx.invitation.updateMany({
          where: { id: inv.id, status: "pending" },
          data: {
            status: "accepted",
            acceptedAt: new Date(),
            acceptedByUserId: userId,
          },
        });
        if (claimed.count === 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "คำเชิญถูกใช้งานแล้วหรือยกเลิก" });
        }

        // Check if user already member (handle partial-fail recovery from the pre-transaction era)
        const existing = await tx.orgMember.findUnique({
          where: { orgId_userId: { orgId: inv.orgId, userId } },
        });

        if (!existing) {
          // BIL-08: คำเชิญนี้ถูก claim แล้ว (ไม่ pending) จึงไม่ถูกนับซ้ำ — exclude เผื่อ DB ยังเห็นค่าเก่า
          await assertUserQuota(tx, inv.orgId, inv.id);
          await tx.orgMember.create({
            data: {
              orgId: inv.orgId,
              userId,
              role: inv.role,
              status: "active",
              eventScope: inv.eventScope,
              joinedAt: new Date(),
              invitedById: inv.invitedById,
            },
          });
        }

        await tx.userPermission.upsert({
          where: { orgId_userId: { orgId: inv.orgId, userId } },
          create: { orgId: inv.orgId, userId, ...perms },
          update: { ...perms, isCustom: false },
        });

        // Invited user = ไม่ใช่เจ้าของ org → ข้าม onboarding google/company
        // onboardingStep = "done" เพื่อ login ครั้งถัดไปจะไม่ถูก redirect กลับ onboarding
        // activeOrgId = org ที่เพิ่งเข้าร่วม ให้ LINE (ไม่มีคุกกี้) ลงรายการถูกบริษัทเดียวกับเว็บ
        return tx.user.update({
          where: { id: userId },
          data: { onboardingStep: "done", activeOrgId: inv.orgId },
        });
      });

      // Auto-switch active org to the newly joined one (seamless UX)
      const { setSessionCookie } = await import("@/lib/auth/session");
      await setSessionCookie({
        userId: user.id,
        lineUserId: user.lineUserId,
        displayName: user.lineDisplayName,
        avatarUrl: user.avatarUrl,
        onboardingStep: "done",
        activeOrgId: inv.orgId,
      });

      await safeAuditLog({
        orgId: inv.orgId,
        userId,
        action: "accept_invitation",
        entityType: "user",
        entityRef: inv.id,
        summary: `${ctx.session.displayName} เข้าร่วมองค์กรเป็น ${inv.role}`,
      });

      return { success: true, orgId: inv.orgId };
    }),

  // ===========================================
  // Permission Management (used by /permissions page)
  //
  // /users handles role + eventScope + invite/remove (high-level).
  // /permissions handles per-key overrides (granular). They share the
  // same underlying tables (OrgMember + UserPermission) but expose
  // different facets — these procedures are the granular API.
  // ===========================================

  /**
   * List members with their effective permissions (for the permissions grid).
   *
   * For each member we return:
   *   - role (default permission baseline)
   *   - permissions: the user's actual UserPermission row (or role default if missing)
   *   - isCustom: did anyone tweak this away from the role default?
   *
   * Sort: admins first → managers → accountants → staff, then by name.
   */
  listPermissions: permissionProcedure("managePermissions").query(
    async ({ ctx }) => {
      const members = await prisma.orgMember.findMany({
        where: { orgId: ctx.org.orgId, status: "active" },
        include: {
          user: {
            select: {
              id: true,
              lineDisplayName: true,
              linePictureUrl: true,
              fullName: true,
              email: true,
              lineEmail: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      });

      const userIds = members.map((m) => m.userId);
      const permRows = await prisma.userPermission.findMany({
        where: { orgId: ctx.org.orgId, userId: { in: userIds } },
      });
      const permByUser = new Map(permRows.map((p) => [p.userId, p]));

      // Get owner so the UI can disable the toggle for them
      const org = await prisma.organization.findUnique({
        where: { id: ctx.org.orgId },
        select: { ownerId: true },
      });
      const ownerId = org?.ownerId;

      const ROLE_ORDER: Record<string, number> = {
        admin: 0,
        manager: 1,
        accountant: 2,
        staff: 3,
      };

      const rows = members.map((m) => {
        const role = m.role as OrgRole;
        const stored = permByUser.get(m.userId);
        const fallback = DEFAULT_PERMISSIONS[role];

        // Build a flat object of just the 14 permission booleans
        // (so the UI doesn't have to know the column structure)
        const perms = {
          manageEvents: stored?.manageEvents ?? fallback.manageEvents,
          assignEvents: stored?.assignEvents ?? fallback.assignEvents,
          managePayees: stored?.managePayees ?? fallback.managePayees,
          manageBanks: stored?.manageBanks ?? fallback.manageBanks,
          updatePayments: stored?.updatePayments ?? fallback.updatePayments,
          deletePayments: stored?.deletePayments ?? fallback.deletePayments,
          approvePayments: stored?.approvePayments ?? fallback.approvePayments,
          editPaymentAfterApproval:
            stored?.editPaymentAfterApproval ?? fallback.editPaymentAfterApproval,
          viewReports: stored?.viewReports ?? fallback.viewReports,
          printReports: stored?.printReports ?? fallback.printReports,
          dashboardEvent: stored?.dashboardEvent ?? fallback.dashboardEvent,
          dashboardSummary: stored?.dashboardSummary ?? fallback.dashboardSummary,
          manageUsers: stored?.manageUsers ?? fallback.manageUsers,
          managePermissions:
            stored?.managePermissions ?? fallback.managePermissions,
          // S24: Revenue keys in Prisma — same stored-or-fallback pattern as legacy
          manageCustomers:
            stored?.manageCustomers ?? fallback.manageCustomers,
          manageQuotations:
            stored?.manageQuotations ?? fallback.manageQuotations,
          manageBillings:
            stored?.manageBillings ?? fallback.manageBillings,
          manageTaxInvoices:
            stored?.manageTaxInvoices ?? fallback.manageTaxInvoices,
        };

        return {
          memberId: m.id,
          userId: m.userId,
          role,
          displayName: m.user.lineDisplayName || m.user.fullName || "—",
          email: m.user.email || m.user.lineEmail || "",
          avatarUrl: m.user.linePictureUrl,
          isOwner: m.userId === ownerId,
          isSelf: m.userId === ctx.session.userId,
          isCustom: stored?.isCustom ?? false,
          permissions: perms,
        };
      });

      rows.sort((a, b) => {
        const ra = ROLE_ORDER[a.role] ?? 99;
        const rb = ROLE_ORDER[b.role] ?? 99;
        if (ra !== rb) return ra - rb;
        return a.displayName.localeCompare(b.displayName, "th");
      });

      return { members: rows };
    },
  ),

  /**
   * Toggle a single permission key for a member.
   * Sets isCustom=true so the role-default reset can flip it back.
   *
   * Guards:
   *   - Cannot edit your own permissions (ทำให้ตัวเองหลุดจาก managePermissions ได้)
   *   - Cannot edit org owner's permissions
   *   - Member must belong to this org
   */
  updatePermission: permissionProcedure("managePermissions")
    .input(
      z.object({
        memberId: z.string(),
        key: z.enum([
          "manageEvents",
          "assignEvents",
          "managePayees",
          "manageBanks",
          "updatePayments",
          "deletePayments",
          "approvePayments",
          "editPaymentAfterApproval",
          "viewReports",
          "printReports",
          "dashboardEvent",
          "dashboardSummary",
          "manageUsers",
          "managePermissions",
          // S24: Revenue keys — full per-user override support (Prisma columns added)
          "manageCustomers",
          "manageQuotations",
          "manageBillings",
          "manageTaxInvoices",
        ]),
        value: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const member = await prisma.orgMember.findFirst({
        where: { id: input.memberId, orgId: ctx.org.orgId },
      });
      if (!member)
        throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบสมาชิก" });

      if (member.userId === ctx.session.userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "ไม่สามารถแก้ไขสิทธิ์ของตัวเองได้",
        });
      }

      const org = await prisma.organization.findUnique({
        where: { id: ctx.org.orgId },
        select: { ownerId: true },
      });
      if (org?.ownerId === member.userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "ไม่สามารถแก้ไขสิทธิ์ของเจ้าขององค์กรได้",
        });
      }

      // Upsert: keep existing values, just flip this one key + mark custom
      const role = member.role as OrgRole;
      const fallback = DEFAULT_PERMISSIONS[role];

      await prisma.userPermission.upsert({
        where: {
          orgId_userId: { orgId: ctx.org.orgId, userId: member.userId },
        },
        create: {
          orgId: ctx.org.orgId,
          userId: member.userId,
          ...fallback,
          [input.key]: input.value,
          isCustom: true,
        },
        update: {
          [input.key]: input.value,
          isCustom: true,
        },
      });

      await safeAuditLog({
        orgId: ctx.org.orgId,
        userId: ctx.session.userId,
        action: "update_permission",
        entityType: "user",
        entityRef: member.userId,
        summary: `แก้ไขสิทธิ์ "${input.key}" → ${input.value ? "ON" : "OFF"}`,
      });

      return { success: true };
    }),

  /**
   * Reset a member's permissions to the role default (clear isCustom).
   */
  resetPermissions: permissionProcedure("managePermissions")
    .input(z.object({ memberId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const member = await prisma.orgMember.findFirst({
        where: { id: input.memberId, orgId: ctx.org.orgId },
      });
      if (!member)
        throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบสมาชิก" });

      if (member.userId === ctx.session.userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "ไม่สามารถรีเซ็ตสิทธิ์ของตัวเองได้",
        });
      }

      const role = member.role as OrgRole;
      const fallback = DEFAULT_PERMISSIONS[role];

      await prisma.userPermission.upsert({
        where: {
          orgId_userId: { orgId: ctx.org.orgId, userId: member.userId },
        },
        create: {
          orgId: ctx.org.orgId,
          userId: member.userId,
          ...fallback,
        },
        update: { ...fallback, isCustom: false },
      });

      await safeAuditLog({
        orgId: ctx.org.orgId,
        userId: ctx.session.userId,
        action: "reset_permissions",
        entityType: "user",
        entityRef: member.userId,
        summary: `รีเซ็ตสิทธิ์เป็น default ของ role ${role}`,
      });

      return { success: true };
    }),
});
