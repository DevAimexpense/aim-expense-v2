// ===========================================
// CTRL-01: ปิดงวดบัญชี — ปิด/เปิดงวด + มอบสิทธิ์ (เจ้าขององค์กรมีสิทธิ์เสมอ)
// ===========================================

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { router, orgProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";
import { safeAuditLog } from "@/server/lib/audit";
import { readPeriodClose, canManagePeriod, prevMonth, thaiPeriodLabel, type PeriodCloseSettings } from "@/lib/period-close";
import { yearMonthBangkok } from "@/lib/utils/date";

const YM = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "เดือนไม่ถูกต้อง");

async function loadOrg(orgId: string) {
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { ownerId: true, settings: true } });
  if (!org) throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบองค์กร" });
  return { ...org, period: readPeriodClose(org.settings) };
}

/**
 * CTRL-17: เขียนเฉพาะคีย์ periodClose แบบ atomic (jsonb_set) — ไม่อ่าน-แล้ว-เขียนทั้งก้อน
 * (ถ้ามีคนแก้ตั้งค่าองค์กรอื่นพร้อมกัน เช่น receiptMode ค่าของเขาต้องไม่ถูกทับ)
 */
async function savePeriod(orgId: string, _settings: unknown, period: PeriodCloseSettings) {
  const json = JSON.stringify(period);
  await prisma.$executeRaw(
    Prisma.sql`UPDATE organizations SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{periodClose}', ${json}::jsonb, true) WHERE id = ${orgId}`,
  );
}

export const periodCloseRouter = router({
  get: orgProcedure.query(async ({ ctx }) => {
    const org = await loadOrg(ctx.org.orgId);
    const canManage = canManagePeriod(ctx.session.userId, org.ownerId, org.period);
    const members = canManage
      ? await prisma.orgMember.findMany({
          where: { orgId: ctx.org.orgId, status: "active" },
          select: { userId: true, role: true, user: { select: { fullName: true, lineDisplayName: true } } },
        })
      : [];
    return {
      closedThrough: org.period.closedThrough,
      closedLabel: org.period.closedThrough ? thaiPeriodLabel(org.period.closedThrough) : "",
      canManage,
      ownerId: org.ownerId,
      managers: org.period.managers,
      members: members.map((m) => ({
        userId: m.userId,
        role: m.role,
        name: m.user.fullName || m.user.lineDisplayName,
        isOwner: m.userId === org.ownerId,
        isManager: m.userId === org.ownerId || org.period.managers.includes(m.userId),
      })),
    };
  }),

  /** ปิดงวดถึงเดือนนี้ (รวมทุกเดือนก่อนหน้า) — ห้ามปิดเดือนปัจจุบัน/อนาคต */
  close: orgProcedure.input(z.object({ month: YM })).mutation(async ({ ctx, input }) => {
    const org = await loadOrg(ctx.org.orgId);
    if (!canManagePeriod(ctx.session.userId, org.ownerId, org.period)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "ไม่มีสิทธิ์ปิดงวด — ขอสิทธิ์จากเจ้าขององค์กร" });
    }
    if (input.month >= yearMonthBangkok()) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "ปิดได้เฉพาะเดือนที่ผ่านมาแล้ว" });
    }
    if (org.period.closedThrough && input.month <= org.period.closedThrough) {
      return { success: true, closedThrough: org.period.closedThrough };
    }
    await savePeriod(ctx.org.orgId, org.settings, { ...org.period, closedThrough: input.month });
    await safeAuditLog({
      data: {
        orgId: ctx.org.orgId,
        userId: ctx.session.userId,
        action: "update",
        entityType: "period_close",
        entityRef: input.month,
        summary: `ปิดงวดบัญชีถึง ${thaiPeriodLabel(input.month)}${org.period.closedThrough ? ` (เดิมถึง ${thaiPeriodLabel(org.period.closedThrough)})` : ""}`,
      },
    });
    return { success: true, closedThrough: input.month };
  }),

  /** เปิดงวดย้อนถึงเดือนนี้ (เดือนนี้และหลังจากนี้แก้ได้) — ต้องระบุเหตุผล */
  reopen: orgProcedure
    .input(z.object({ month: YM, reason: z.string().trim().min(3, "กรุณาระบุเหตุผลที่เปิดงวด").max(500) }))
    .mutation(async ({ ctx, input }) => {
      const org = await loadOrg(ctx.org.orgId);
      if (!canManagePeriod(ctx.session.userId, org.ownerId, org.period)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "ไม่มีสิทธิ์เปิดงวด — ขอสิทธิ์จากเจ้าขององค์กร" });
      }
      if (!org.period.closedThrough || input.month > org.period.closedThrough) {
        return { success: true, closedThrough: org.period.closedThrough };
      }
      const next = prevMonth(input.month);
      const closedThrough = next < "2000-01" ? "" : next;
      await savePeriod(ctx.org.orgId, org.settings, { ...org.period, closedThrough });
      await safeAuditLog({
        data: {
          orgId: ctx.org.orgId,
          userId: ctx.session.userId,
          action: "update",
          entityType: "period_close",
          entityRef: input.month,
          summary: `เปิดงวดบัญชีตั้งแต่ ${thaiPeriodLabel(input.month)} (ปิดเหลือถึง ${closedThrough ? thaiPeriodLabel(closedThrough) : "—"}): ${input.reason}`,
        },
      });
      return { success: true, closedThrough };
    }),

  /** มอบ/ถอนสิทธิ์ปิด-เปิดงวด — เจ้าของมีสิทธิ์เสมอ (ถอดไม่ได้) */
  setManagers: orgProcedure.input(z.object({ userIds: z.array(z.string()).max(50) })).mutation(async ({ ctx, input }) => {
    const org = await loadOrg(ctx.org.orgId);
    if (!canManagePeriod(ctx.session.userId, org.ownerId, org.period)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "ไม่มีสิทธิ์มอบสิทธิ์ปิดงวด" });
    }
    const members = await prisma.orgMember.findMany({
      where: { orgId: ctx.org.orgId, status: "active", userId: { in: input.userIds } },
      select: { userId: true },
    });
    const managers = members.map((m) => m.userId).filter((id) => id !== org.ownerId);
    await savePeriod(ctx.org.orgId, org.settings, { ...org.period, managers });
    await safeAuditLog({
      data: {
        orgId: ctx.org.orgId,
        userId: ctx.session.userId,
        action: "update",
        entityType: "period_close",
        entityRef: "managers",
        summary: `กำหนดผู้มีสิทธิ์ปิด/เปิดงวด: เจ้าของ + ${managers.length} คน`,
      },
    });
    return { success: true, managers };
  }),
});
