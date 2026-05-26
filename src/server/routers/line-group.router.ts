// ===========================================
// Aim Expense — LINE Group Router
// ผูก/ยกเลิก/ดูรายการ LINE group ที่เชื่อมกับองค์กร
// (รับใบเสร็จ/รายจ่ายจากกลุ่ม → บันทึกเข้า org ที่ผูก)
// ===========================================

import { z } from "zod";
import { router, protectedProcedure, orgProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";
import { TRPCError } from "@trpc/server";
import {
  effectivePlan,
  checkQuota,
  type SubscriptionState,
} from "@/lib/plans";
import { getSheetsService } from "../lib/sheets-context";

/** Verify the user is an admin of the given org (only admins may bind groups). */
async function assertOrgAdmin(userId: string, orgId: string): Promise<void> {
  const membership = await prisma.orgMember.findUnique({
    where: { orgId_userId: { orgId, userId } },
  });
  if (!membership || membership.status !== "active" || membership.role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "เฉพาะ Admin ขององค์กรเท่านั้นที่ผูกกลุ่มได้",
    });
  }
}

export const lineGroupRouter = router({
  /** Groups bound to the active org. */
  list: orgProcedure.query(async ({ ctx }) => {
    const groups = await prisma.lineGroup.findMany({
      where: { orgId: ctx.org.orgId },
      orderBy: { createdAt: "desc" },
      include: { boundBy: { select: { lineDisplayName: true } } },
    });
    return groups.map((g) => ({
      id: g.id,
      groupId: g.groupId,
      groupName: g.groupName,
      eventName: g.eventName,
      boundByName: g.boundBy.lineDisplayName,
      createdAt: g.createdAt,
    }));
  }),

  /**
   * Active projects (events) of a given org — for the bind page's project
   * picker. Admin-only (the user must be admin of that org to bind a group).
   */
  projects: protectedProcedure
    .input(z.object({ orgId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      await assertOrgAdmin(ctx.session.userId, input.orgId);
      const sheets = await getSheetsService(input.orgId);
      const events = await sheets.getEvents();
      return events
        .filter((e) => {
          // Treat blank status as active (matches dashboard / event list).
          // Only exclude projects explicitly closed (completed / cancelled).
          const s = (e.Status || "active").trim().toLowerCase();
          return s !== "completed" && s !== "cancelled";
        })
        .map((e) => ({
          eventId: (e.EventID || "").trim(),
          eventName: e.EventName || "ไม่ระบุ",
        }))
        .filter((e) => e.eventId);
    }),

  /**
   * Bind a LINE group to an org. Called from /line-groups/bind?g=<groupId>
   * after the admin picks which org to link. Admin-only + lineGroups quota.
   */
  bind: protectedProcedure
    .input(
      z.object({
        groupId: z.string().trim().min(1),
        orgId: z.string().min(1),
        groupName: z.string().trim().max(200).optional(),
        eventId: z.string().trim().max(100).optional(),
        eventName: z.string().trim().max(200).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.userId;
      await assertOrgAdmin(userId, input.orgId);

      // Already bound?
      const existing = await prisma.lineGroup.findUnique({
        where: { groupId: input.groupId },
      });
      if (existing) {
        if (existing.orgId === input.orgId) {
          // Same org → allow updating the project binding.
          await prisma.lineGroup.update({
            where: { id: existing.id },
            data: {
              eventId: input.eventId || null,
              eventName: input.eventName || null,
            },
          });
          return { success: true, alreadyBound: true };
        }
        throw new TRPCError({
          code: "CONFLICT",
          message: "กลุ่มนี้ถูกผูกกับองค์กรอื่นแล้ว — ยกเลิกการผูกเดิมก่อน",
        });
      }

      // Quota: lineGroups per plan (count current bindings for this org)
      const sub = await prisma.subscription.findUnique({
        where: { orgId: input.orgId },
        select: { plan: true, trialPlan: true, trialEndsAt: true },
      });
      const plan = effectivePlan(sub as SubscriptionState | null);
      const current = await prisma.lineGroup.count({
        where: { orgId: input.orgId },
      });
      const quota = checkQuota(plan, "lineGroups", current);
      if (!quota.ok) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            quota.limit === 0
              ? "แผนของคุณยังไม่รองรับการเชื่อม LINE กลุ่ม — อัปเกรดเป็น Pro ขึ้นไป"
              : `แผนนี้เชื่อมได้สูงสุด ${quota.limit} กลุ่ม (ใช้ไปแล้ว ${current}) — อัปเกรดเพื่อเพิ่ม`,
        });
      }

      await prisma.lineGroup.create({
        data: {
          groupId: input.groupId,
          orgId: input.orgId,
          boundByUserId: userId,
          groupName: input.groupName || null,
          eventId: input.eventId || null,
          eventName: input.eventName || null,
        },
      });

      await prisma.auditLog.create({
        data: {
          orgId: input.orgId,
          userId,
          action: "create",
          entityType: "line_group",
          entityRef: input.groupId,
          summary: `ผูก LINE กลุ่ม${input.groupName ? ` "${input.groupName}"` : ""}`,
        },
      });

      return { success: true, alreadyBound: false };
    }),

  /** Unbind a group (admin of the bound org only). */
  unbind: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const group = await prisma.lineGroup.findUnique({
        where: { id: input.id },
      });
      if (!group) {
        throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบกลุ่ม" });
      }
      await assertOrgAdmin(ctx.session.userId, group.orgId);

      await prisma.lineGroup.delete({ where: { id: group.id } });

      await prisma.auditLog.create({
        data: {
          orgId: group.orgId,
          userId: ctx.session.userId,
          action: "delete",
          entityType: "line_group",
          entityRef: group.groupId,
          summary: `ยกเลิกการผูก LINE กลุ่ม${group.groupName ? ` "${group.groupName}"` : ""}`,
        },
      });

      return { success: true };
    }),
});
