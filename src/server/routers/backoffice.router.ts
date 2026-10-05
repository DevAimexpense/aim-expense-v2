// ===========================================
// Aim Expense — หลังบ้านทีมงาน: จัดการลูกค้าข้ามบริษัท (/admin/customers)
//
// ⚠️ router เดียวในระบบที่อ่าน/เขียนข้อมูล **ข้าม org** ได้ — ทุก procedure
// ต้องใช้ backofficeProcedure (admin ของบริษัทหลังบ้านเท่านั้น)
//
// แตะเฉพาะ metadata ใน Postgres (Organization / Subscription / AuditLog) —
// ไม่อ่าน Google Sheet ของลูกค้า (Zero Data Retention)
// ===========================================

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, backofficeProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";
import {
  PLAN_LABELS,
  PLAN_TIERS,
  effectivePlan,
  isInTrial,
  type PlanTier,
} from "@/lib/plans";
import {
  GRANTABLE_PLANS,
  freeMonthsEnd,
  lifetimeGrantData,
  quotaCacheFor,
} from "@/lib/comp";
import { formatDate } from "@/lib/utils/date";

const FILTERS = ["all", "paying", "trialing", "lifetime", "free"] as const;

const GrantablePlan = z.enum(
  GRANTABLE_PLANS as [Exclude<PlanTier, "free">, ...Exclude<PlanTier, "free">[]],
);

function normalise(plan: string | null | undefined): PlanTier {
  return (PLAN_TIERS as readonly string[]).includes(plan ?? "")
    ? (plan as PlanTier)
    : "free";
}

export const backofficeRouter = router({
  /** ลูกค้าทั้งหมด (ทุก org) + สถานะแพ็กเกจ */
  accounts: backofficeProcedure
    .input(
      z
        .object({ filter: z.enum(FILTERS).default("all") })
        .default({ filter: "all" }),
    )
    .query(async ({ input }) => {
      const orgs = await prisma.organization.findMany({
        select: {
          id: true,
          name: true,
          entityType: true,
          createdAt: true,
          owner: {
            select: { fullName: true, lineDisplayName: true, email: true },
          },
          subscription: true,
          _count: { select: { members: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      const rows = orgs.map((o) => {
        const sub = o.subscription;
        const inTrial = isInTrial(sub);
        const lifetime = sub?.isBetaTester === true;
        const plan = effectivePlan(sub);
        const hasStripe = !!sub?.stripeSubscriptionId;
        return {
          orgId: o.id,
          orgName: o.name,
          entityType: o.entityType,
          ownerName: o.owner.fullName || o.owner.lineDisplayName || null,
          ownerEmail: o.owner.email ?? null,
          memberCount: o._count.members,
          createdAt: o.createdAt.toISOString(),
          /** แพ็กเกจที่ใช้ได้จริงตอนนี้ (trial ทับ plan) */
          plan,
          planLabel: PLAN_LABELS[plan],
          /** แพ็กเกจฐาน (หลัง trial หมดจะกลับมาที่นี่) */
          basePlan: normalise(sub?.plan),
          lifetime,
          inTrial: inTrial && !lifetime,
          trialEndsAt: inTrial ? (sub?.trialEndsAt?.toISOString() ?? null) : null,
          hasStripe,
          /** จ่ายเงินจริงผ่าน Stripe (ไม่นับ comped) */
          paying: hasStripe && !lifetime && normalise(sub?.plan) !== "free",
          cancelAtPeriodEnd: sub?.cancelAtPeriodEnd === true,
          currentPeriodEnd: sub?.currentPeriodEnd?.toISOString() ?? null,
        };
      });

      const is = {
        all: () => true,
        paying: (r: (typeof rows)[number]) => r.paying,
        trialing: (r: (typeof rows)[number]) => r.inTrial,
        lifetime: (r: (typeof rows)[number]) => r.lifetime,
        free: (r: (typeof rows)[number]) =>
          r.plan === "free" && !r.lifetime && !r.inTrial,
      };

      return {
        rows: rows.filter(is[input.filter]),
        counts: {
          all: rows.length,
          paying: rows.filter(is.paying).length,
          trialing: rows.filter(is.trialing).length,
          lifetime: rows.filter(is.lifetime).length,
          free: rows.filter(is.free).length,
        },
      };
    }),

  /**
   * ให้สิทธิ์ใช้ฟรี
   *   kind = "months"   → ฟรี 1/2/3 เดือน (ต่อท้ายของเดิมถ้ายังไม่หมด)
   *   kind = "lifetime" → ฟรีตลอดชีพ
   */
  grant: backofficeProcedure
    .input(
      z.object({
        orgId: z.string().uuid(),
        kind: z.enum(["months", "lifetime"]),
        months: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(1),
        plan: GrantablePlan.default("pro"),
        note: z.string().trim().max(200).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const org = await prisma.organization.findUnique({
        where: { id: input.orgId },
        select: { id: true, name: true, subscription: true },
      });
      if (!org) {
        throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบบริษัทนี้" });
      }
      const sub = org.subscription;
      const planLabel = PLAN_LABELS[input.plan];
      const noteSuffix = input.note ? ` · ${input.note}` : "";
      let summary: string;

      if (input.kind === "lifetime") {
        const data = lifetimeGrantData(input.plan);
        await prisma.subscription.upsert({
          where: { orgId: org.id },
          update: data,
          create: { orgId: org.id, ...data },
        });
        summary = `ทีมงานให้ใช้ฟรีตลอดชีพ (${planLabel})${noteSuffix}`;
      } else {
        const now = new Date();
        const end = freeMonthsEnd(
          input.months,
          isInTrial(sub) ? sub?.trialEndsAt : null,
          now,
        );
        // เคยเป็นฟรีตลอดชีพ → ปิดสถานะนั้น แล้วกลับไปแพ็กเกจฐาน
        // (มี Stripe → คง plan เดิม รอ webhook sync · ไม่มี → free)
        const wasLifetime = sub?.isBetaTester === true;
        const data = {
          trialPlan: input.plan,
          trialStartedAt: now,
          trialEndsAt: end,
          isBetaTester: false,
          ...(wasLifetime && !sub?.stripeSubscriptionId ? { plan: "free" } : {}),
          ...quotaCacheFor(input.plan),
        };
        await prisma.subscription.upsert({
          where: { orgId: org.id },
          update: data,
          create: { orgId: org.id, plan: "free", status: "active", ...data },
        });
        summary = `ทีมงานให้ใช้ฟรี ${input.months} เดือน (${planLabel}) ถึง ${formatDate(end)}${noteSuffix}`;
      }

      await prisma.auditLog.create({
        data: {
          orgId: org.id,
          userId: ctx.session.userId,
          action: "update",
          entityType: "subscription",
          entityRef: sub?.id ?? null,
          summary,
        },
      });

      return { success: true, summary };
    }),

  /** ยกเลิกสิทธิ์ที่ทีมงานให้ (ฟรีชั่วคราว / ฟรีตลอดชีพ) → กลับแพ็กเกจฐาน */
  revoke: backofficeProcedure
    .input(z.object({ orgId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const org = await prisma.organization.findUnique({
        where: { id: input.orgId },
        select: { id: true, name: true, subscription: true },
      });
      const sub = org?.subscription;
      if (!org || !sub) {
        throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบบริษัทนี้" });
      }
      const lifetime = sub.isBetaTester === true;
      if (!lifetime && !isInTrial(sub)) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "บริษัทนี้ไม่มีสิทธิ์ฟรีที่ยกเลิกได้",
        });
      }

      // ฟรีตลอดชีพที่ไม่มี Stripe → กลับ free · มี Stripe → คง plan รอ webhook sync
      const basePlan: PlanTier =
        lifetime && !sub.stripeSubscriptionId ? "free" : normalise(sub.plan);

      await prisma.subscription.update({
        where: { id: sub.id },
        data: {
          plan: basePlan,
          isBetaTester: false,
          trialPlan: null,
          trialStartedAt: null,
          trialEndsAt: null,
          ...quotaCacheFor(basePlan),
        },
      });

      await prisma.auditLog.create({
        data: {
          orgId: org.id,
          userId: ctx.session.userId,
          action: "update",
          entityType: "subscription",
          entityRef: sub.id,
          summary: `ทีมงานยกเลิกสิทธิ์${lifetime ? "ฟรีตลอดชีพ" : "ใช้ฟรีชั่วคราว"} → ${PLAN_LABELS[basePlan]}`,
        },
      });

      return { success: true };
    }),
});
