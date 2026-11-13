// ===========================================
// Aim Expense — หลังบ้านทีมงาน: จัดการลูกค้าข้ามบริษัท (/backoffice)
//
// ⚠️ router เดียวในระบบที่อ่าน/เขียนข้อมูล **ข้าม org** ได้ — ทุก procedure
// ต้องใช้ backofficeProcedure (admin ของบริษัทหลังบ้าน ไม่ว่าจะเลือกบริษัทไหนอยู่)
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
  PLAN_LIMITS,
  PLAN_TIERS,
  effectivePlan,
  isInTrial,
  type PlanTier,
} from "@/lib/plans";
import { ENTITLED_STATUSES } from "@/lib/stripe";
import {
  readIsBackoffice,
  readSpecialFeatureUsers,
  SPECIAL_FEATURES,
  SPECIAL_FEATURE_KEYS,
} from "@/lib/org-settings";
import type { Prisma } from "@prisma/client";
import { yearMonthBangkok } from "@/lib/utils/date";
import { parseStageMark } from "@/lib/reminder-stages";
import type { Subscription } from "@prisma/client";
import {
  GRANTABLE_PLANS,
  INVOICE_INTERVALS,
  INVOICE_PLANS,
  bangkokEndOfDay,
  freeMonthsEnd,
  invoiceEndData,
  invoiceGrantData,
  isInvoiceActive,
  isInvoicePlan,
  lifetimeGrantData,
  manualPeriodEnd,
  quotaCacheFor,
} from "@/lib/comp";
import { formatDate } from "@/lib/utils/date";
import { safeAuditLog } from "@/server/lib/audit";

const FILTERS = [
  "all",
  "paying",
  "trialing",
  "lifetime",
  "free",
  "expiring",
  "cancelling",
] as const;

/** ใกล้หมดอายุ = ภายใน 7 วัน (ต้นแบบ overview ของ Aim HR) */
const EXPIRING_SOON_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * AuditLog ที่แสดงในหน้ารายละเอียดบริษัท — เฉพาะเรื่องระบบ/สิทธิ์
 * ไม่เอา payment/billing/quotation/... เพราะ entityRef/summary ชี้ไปข้อมูลธุรกิจของลูกค้า
 * (Zero Data Retention — ทีมงานไม่เห็นรายการค้าของลูกค้า)
 */
/** RM-01: mark กันส่งซ้ำของ cron เตือน (summary ดิบ `trial-reminder:7`) → แปลงเป็นข้อความไทยก่อนแสดง */
const REMINDER_MARKS: { prefix: string; label: string }[] = [
  { prefix: "trial-reminder:", label: "ส่ง LINE เตือนทดลอง/ฟรีชั่วคราวใกล้หมด" },
  { prefix: "invoice-reminder:", label: "ส่ง LINE เตือนรอบวางบิลใกล้หมด" },
];
function humaniseAuditSummary(summary: string | null): string | null {
  for (const m of REMINDER_MARKS) {
    const stage = parseStageMark(summary, m.prefix);
    if (stage !== null) return `${m.label} (${stage} วัน) — ระบบ`;
  }
  return summary;
}

const SYSTEM_AUDIT_ENTITY_TYPES = [
  "subscription",
  "organization",
  "org",
  "company",
  "user",
  "line_group",
  "branch",
] as const;

const GrantablePlan = z.enum(
  GRANTABLE_PLANS as [Exclude<PlanTier, "free">, ...Exclude<PlanTier, "free">[]],
);

function normalise(plan: string | null | undefined): PlanTier {
  return (PLAN_TIERS as readonly string[]).includes(plan ?? "")
    ? (plan as PlanTier)
    : "free";
}

interface OrgForRow {
  id: string;
  name: string;
  entityType: string;
  createdAt: Date;
  settings: unknown;
  owner: { fullName: string | null; lineDisplayName: string; email: string | null };
  subscription: Subscription | null;
  _count: { members: number };
}

/** วันหมดอายุที่ "มีความหมาย" ต่อทีมงาน + ชนิดของมัน */
type ExpiryKind = "trial" | "cancel" | "renew" | "invoice" | "lifetime" | "none";

/**
 * สรุปสถานะ 1 บริษัท — ใช้ร่วมกันทั้ง accounts / overview / orgDetail
 * กติกาแพ็กเกจใช้ effectivePlan / isInTrial ตัวเดิม ไม่คิดซ้ำ
 */
function summariseOrg(o: OrgForRow, now: Date) {
  const sub = o.subscription;
  const inTrialRaw = isInTrial(sub);
  const lifetime = sub?.isBetaTester === true;
  const inTrial = inTrialRaw && !lifetime;
  const plan = effectivePlan(sub);
  const basePlan = normalise(sub?.plan);
  const hasStripe = !!sub?.stripeSubscriptionId;
  const isTeam = readIsBackoffice(o.settings);
  // Stripe ยังเก็บเงินได้ (active/trialing/past_due) — ชุดเดียวกับ webhook
  const stripeEntitled =
    hasStripe &&
    ENTITLED_STATUSES.has((sub?.status ?? "") as Parameters<typeof ENTITLED_STATUSES.has>[0]);
  // วางบิล/โอน (นอก Stripe) — รอบที่จ่ายแล้วยังไม่หมด = จ่ายจริง
  const invoice = isInvoicePlan(sub);
  const invoiceActive = isInvoiceActive(sub, now);
  // BO-02 (พี่พิมตัดสิน 06/11): "จ่ายจริง" = Stripe เก็บเงินสำเร็จแล้วเท่านั้น (status active) หรือวางบิลที่ยังไม่หมดรอบ
  // trialing (ผูกบัตรแต่ยังไม่ถูกตัด) / past_due (บัตรถูกปฏิเสธ) ยังใช้งานได้ (entitled) แต่ไม่นับเป็นจ่ายจริง
  const stripePaid = hasStripe && sub?.status === "active";
  /** จ่ายเงินจริง + ไม่ใช่ฟรีตลอดชีพ + ไม่ใช่บริษัททีมงาน */
  const paying =
    (stripePaid || invoiceActive) && !lifetime && basePlan !== "free" && !isTeam;

  let expiryKind: ExpiryKind = "none";
  let expiresAt: Date | null = null;
  if (lifetime) {
    expiryKind = "lifetime";
  } else if (inTrial && sub?.trialEndsAt) {
    expiryKind = "trial";
    expiresAt = sub.trialEndsAt;
  } else if (invoice && sub?.billingPeriodEnd) {
    expiryKind = "invoice";
    expiresAt = sub.billingPeriodEnd;
  } else if (hasStripe && sub?.currentPeriodEnd) {
    expiryKind = sub.cancelAtPeriodEnd ? "cancel" : "renew";
    expiresAt = sub.currentPeriodEnd;
  }
  // "ใกล้หมดอายุ" = สิทธิ์จะหายจริง (trial หมด / ยกเลิกสิ้นรอบ / รอบวางบิลหมด) ภายใน 7 วัน — ต่ออายุอัตโนมัติไม่นับ
  const msLeft = expiresAt ? expiresAt.getTime() - now.getTime() : null;
  const expiringSoon =
    (expiryKind === "trial" || expiryKind === "cancel" || expiryKind === "invoice") &&
    msLeft !== null &&
    msLeft <= EXPIRING_SOON_DAYS * DAY_MS;
  const daysLeft = msLeft === null ? null : Math.ceil(msLeft / DAY_MS);

  const memberCap = PLAN_LIMITS[plan].users; // -1 = ไม่จำกัด

  return {
    orgId: o.id,
    orgName: o.name,
    entityType: o.entityType,
    ownerName: o.owner.fullName || o.owner.lineDisplayName || null,
    ownerEmail: o.owner.email ?? null,
    /** สมาชิกที่ active (ไม่นับ pending/removed) */
    memberCount: o._count.members,
    /** เพดานสมาชิกของแพ็กเกจที่ใช้อยู่ (-1 = ไม่จำกัด) */
    memberCap,
    createdAt: o.createdAt.toISOString(),
    /** แพ็กเกจที่ใช้ได้จริงตอนนี้ (trial ทับ plan) */
    plan,
    planLabel: PLAN_LABELS[plan],
    /** แพ็กเกจฐาน (หลัง trial หมดจะกลับมาที่นี่) */
    basePlan,
    lifetime,
    inTrial,
    trialEndsAt: inTrial ? (sub?.trialEndsAt?.toISOString() ?? null) : null,
    hasStripe,
    stripeStatus: hasStripe ? (sub?.status ?? null) : null,
    /** Stripe ยังเก็บเงินได้ (active/trialing/past_due) — modal ใช้ตัดสินว่าวางบิลได้ไหม (UI-11) */
    stripeEntitled,
    /** วางบิล/โอน (นอก Stripe) · invoiceActive = รอบยังไม่หมด */
    invoice,
    invoiceActive,
    /** รอบบิล: monthly | yearly | null (Stripe หรือวางบิล) */
    billingInterval: hasStripe || invoice ? (sub?.billingInterval ?? null) : null,
    paying,
    cancelAtPeriodEnd: sub?.cancelAtPeriodEnd === true,
    currentPeriodEnd: sub?.currentPeriodEnd?.toISOString() ?? null,
    expiryKind,
    expiresAt: expiresAt?.toISOString() ?? null,
    daysLeft,
    expiringSoon,
    /** บริษัทของทีมงานเอง — ไม่นับเป็นลูกค้า */
    isTeam,
  };
}

type OrgRow = ReturnType<typeof summariseOrg>;

/**
 * ตัวกรอง — ทุกตัวยกเว้น "all" ไม่นับบริษัทของทีมงาน
 * ให้ตัวเลขบนการ์ดภาพรวมเท่ากับจำนวนแถวในหน้าลูกค้าเสมอ (บริษัททีมดูได้ใน "ทั้งหมด")
 */
const ROW_FILTERS: Record<(typeof FILTERS)[number], (r: OrgRow) => boolean> = {
  all: () => true,
  paying: (r) => r.paying,
  trialing: (r) => r.inTrial && !r.isTeam,
  lifetime: (r) => r.lifetime && !r.isTeam,
  free: (r) => r.plan === "free" && !r.lifetime && !r.inTrial && !r.isTeam,
  expiring: (r) => r.expiringSoon && !r.isTeam,
  cancelling: (r) => r.cancelAtPeriodEnd && r.hasStripe && !r.isTeam,
};

const ORG_ROW_SELECT = {
  id: true,
  name: true,
  entityType: true,
  createdAt: true,
  settings: true,
  owner: { select: { fullName: true, lineDisplayName: true, email: true } },
  subscription: true,
  _count: { select: { members: { where: { status: "active" } } } },
} as const;

async function loadRows(now: Date): Promise<OrgRow[]> {
  const orgs = await prisma.organization.findMany({
    select: ORG_ROW_SELECT,
    orderBy: { createdAt: "desc" },
  });
  return orgs.map((o) => summariseOrg(o, now));
}

export const backofficeRouter = router({
  /**
   * ภาพรวมลูกค้า (หน้าแรกของ /backoffice) — Postgres เท่านั้น
   * ตัวเลขทุกตัวมาจาก rows ชุดเดียวกับ accounts → การ์ดกับรายการตรงกันเสมอ
   */
  overview: backofficeProcedure.query(async () => {
    const now = new Date();
    const rows = await loadRows(now);
    const customers = rows.filter((r) => !r.isTeam);
    const since30d = now.getTime() - 30 * DAY_MS;
    const byExpiry = (a: OrgRow, b: OrgRow) =>
      (a.expiresAt ?? "").localeCompare(b.expiresAt ?? "");
    return {
      asOf: now.toISOString(),
      counts: {
        customers: customers.length,
        team: rows.length - customers.length,
        paying: customers.filter(ROW_FILTERS.paying).length,
        trialing: customers.filter(ROW_FILTERS.trialing).length,
        lifetime: customers.filter(ROW_FILTERS.lifetime).length,
        free: customers.filter(ROW_FILTERS.free).length,
        newLast30Days: customers.filter((r) => new Date(r.createdAt).getTime() >= since30d).length,
        yearly: customers.filter((r) => r.paying && r.billingInterval === "yearly").length,
        monthly: customers.filter((r) => r.paying && r.billingInterval === "monthly").length,
        invoice: customers.filter((r) => r.paying && r.invoice).length,
      },
      /** สิทธิ์จะหายภายใน 7 วัน (trial หมด / ยกเลิกสิ้นรอบ) */
      expiringSoon: customers.filter(ROW_FILTERS.expiring).sort(byExpiry),
      /** กดยกเลิกแล้ว ยังใช้ได้ถึงสิ้นรอบ */
      cancelling: customers.filter(ROW_FILTERS.cancelling).sort(byExpiry),
      /** สมัครล่าสุด */
      recent: customers.slice(0, 5),
    };
  }),

  /** ลูกค้าทั้งหมด (ทุก org) + สถานะแพ็กเกจ รอบบิล วันหมดอายุ สมาชิก/เพดาน */
  accounts: backofficeProcedure
    .input(
      z
        .object({ filter: z.enum(FILTERS).default("all") })
        .default({ filter: "all" }),
    )
    .query(async ({ input }) => {
      const rows = await loadRows(new Date());
      const counts = Object.fromEntries(
        FILTERS.map((f) => [f, rows.filter(ROW_FILTERS[f]).length]),
      ) as Record<(typeof FILTERS)[number], number>;
      return { rows: rows.filter(ROW_FILTERS[input.filter]), counts };
    }),

  /**
   * รายละเอียดบริษัท 1 แห่ง — **อ่านเฉพาะ Postgres** (ไม่แตะ Google Sheet/Drive ของลูกค้า)
   * บริษัท/เจ้าของ · สมาชิก · แพ็กเกจ · เครดิต OCR (UsageCounter) · สถานะ Google · ประวัติสิทธิ์ (AuditLog)
   */
  orgDetail: backofficeProcedure
    .input(z.object({ orgId: z.string().uuid() }))
    .query(async ({ input }) => {
      const now = new Date();
      const o = await prisma.organization.findUnique({
        where: { id: input.orgId },
        select: {
          ...ORG_ROW_SELECT,
          slug: true,
          taxId: true,
          branchType: true,
          branchNumber: true,
          phone: true,
          googleSpreadsheetId: true,
          googleDriveFolderId: true,
          owner: {
            select: {
              id: true,
              fullName: true,
              lineDisplayName: true,
              email: true,
              onboardingStep: true,
              createdAt: true,
              googleConnection: {
                select: { googleEmail: true, isActive: true, tokenExpiry: true, updatedAt: true },
              },
            },
          },
          members: {
            select: {
              id: true,
              role: true,
              status: true,
              joinedAt: true,
              createdAt: true,
              user: { select: { id: true, fullName: true, lineDisplayName: true, email: true } },
            },
            orderBy: { createdAt: "asc" },
          },
          _count: {
            select: {
              members: { where: { status: "active" } },
              lineGroups: true,
              invitations: { where: { status: "pending", expiresAt: { gt: now } } },
            },
          },
        },
      });
      if (!o) {
        throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบบริษัทนี้" });
      }

      const row = summariseOrg(o, now);
      const sub = o.subscription;

      // OCR: เดือนนี้ + 3 เดือนย้อนหลัง (เดือนตามเวลาไทย ให้ตรงกับโควตา)
      // BO-05: ถอยเดือนจาก "เดือนนี้ตามเวลาไทย" แบบเลขคณิต (ไม่ผ่าน Date UTC ที่คลาดช่วง 00:00–07:00 วันที่ 1)
      const [y0, m0] = yearMonthBangkok(now).split("-").map(Number);
      const months: string[] = [];
      for (let i = 0; i < 4; i++) {
        const idx = y0 * 12 + (m0 - 1) - i;
        months.push(`${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`);
      }
      const usage = await prisma.usageCounter.findMany({
        where: { orgId: o.id, metric: "ocr", yearMonth: { in: months } },
        select: { yearMonth: true, count: true },
      });
      const usageByMonth = new Map(usage.map((u) => [u.yearMonth, u.count]));

      const logs = await prisma.auditLog.findMany({
        where: { orgId: o.id, entityType: { in: [...SYSTEM_AUDIT_ENTITY_TYPES] } },
        select: {
          id: true,
          createdAt: true,
          action: true,
          entityType: true,
          summary: true,
          user: { select: { fullName: true, lineDisplayName: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      });

      const google = o.owner.googleConnection;
      return {
        ...row,
        org: {
          slug: o.slug,
          taxId: o.taxId,
          branchType: o.branchType,
          branchNumber: o.branchNumber,
          phone: o.phone,
          /** มีชีต/โฟลเดอร์แล้วหรือยัง — ไม่ส่ง id ออกไป */
          hasSpreadsheet: !!o.googleSpreadsheetId,
          hasDriveFolder: !!o.googleDriveFolderId,
          lineGroupCount: o._count.lineGroups,
          pendingInvitations: o._count.invitations,
        },
        owner: {
          userId: o.owner.id,
          name: o.owner.fullName || o.owner.lineDisplayName,
          lineDisplayName: o.owner.lineDisplayName,
          email: o.owner.email,
          onboardingStep: o.owner.onboardingStep,
          createdAt: o.owner.createdAt.toISOString(),
          google: google
            ? {
                email: google.googleEmail,
                isActive: google.isActive,
                tokenExpiry: google.tokenExpiry?.toISOString() ?? null,
                updatedAt: google.updatedAt.toISOString(),
              }
            : null,
        },
        // ฟังก์ชันพิเศษที่ทีมงานเปิดให้รายคน (settings.specialFeatures)
        specialFeatures: SPECIAL_FEATURE_KEYS.map((key) => ({
          key,
          label: SPECIAL_FEATURES[key].label,
          description: SPECIAL_FEATURES[key].description,
          userIds: readSpecialFeatureUsers(o.settings, key),
        })),
        members: o.members.map((m) => ({
          id: m.id,
          userId: m.user.id,
          name: m.user.fullName || m.user.lineDisplayName,
          email: m.user.email,
          role: m.role,
          status: m.status,
          joinedAt: (m.joinedAt ?? m.createdAt).toISOString(),
          isOwner: m.user.id === o.owner.id,
        })),
        subscription: sub
          ? {
              status: sub.status,
              trialPlan: sub.trialPlan,
              trialStartedAt: sub.trialStartedAt?.toISOString() ?? null,
              trialEndsAt: sub.trialEndsAt?.toISOString() ?? null,
              stripeCustomerId: sub.stripeCustomerId,
              stripeSubscriptionId: sub.stripeSubscriptionId,
              billingInterval: sub.billingInterval,
              currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
              cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
              billingPeriodStart: sub.billingPeriodStart?.toISOString() ?? null,
              billingPeriodEnd: sub.billingPeriodEnd?.toISOString() ?? null,
              maxMembers: sub.maxMembers,
              maxEvents: sub.maxEvents,
              scanCredits: sub.scanCredits,
              updatedAt: sub.updatedAt.toISOString(),
            }
          : null,
        ocr: {
          /** -1 = ไม่จำกัด */
          limit: PLAN_LIMITS[row.plan].ocrPerMonth,
          months: months.map((ym) => ({ yearMonth: ym, count: usageByMonth.get(ym) ?? 0 })),
        },
        auditLogs: logs.map((l) => ({
          id: l.id,
          createdAt: l.createdAt.toISOString(),
          action: l.action,
          entityType: l.entityType,
          summary: humaniseAuditSummary(l.summary),
          actor: l.user.fullName || l.user.lineDisplayName,
        })),
      };
    }),

  /**
   * กำหนดแพ็กเกจแบบวางบิล / โอนเงิน — ลูกค้าจ่ายเงินจริงนอก Stripe
   *   - ปฏิเสธถ้ามี Stripe subscription ที่ยังเก็บเงินได้ (ไม่งั้นโดนเก็บสองทาง)
   *   - รอบ monthly/yearly ต่อท้ายรอบเดิมถ้ายังไม่หมด หรือกำหนดวันหมดอายุเอง
   *   - หมดรอบแล้ว cron expire-manual-plans ลดเป็น free · AuditLog ทุกครั้ง (เลขใบแจ้งหนี้ใน note)
   */
  assignPlan: backofficeProcedure
    .input(
      z.object({
        orgId: z.string().uuid(),
        plan: z.enum(INVOICE_PLANS as [Exclude<PlanTier, "free">, ...Exclude<PlanTier, "free">[]]),
        /** รอบที่ชำระ · "custom" = กำหนดวันหมดอายุเอง (ต้องส่ง endDate) */
        interval: z.enum([...INVOICE_INTERVALS, "custom"]).default("yearly"),
        /** extend = ต่อท้ายรอบเดิมที่ยังไม่หมด · today = เริ่มนับวันนี้ (ใช้เฉพาะ monthly/yearly) */
        mode: z.enum(["extend", "today"]).default("extend"),
        /** วันหมดอายุกำหนดเอง YYYY-MM-DD (เวลาไทย สิ้นวัน) — ใช้เมื่อ interval = custom */
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        /** เลขที่ใบแจ้งหนี้ / วันโอน / หมายเหตุ — เก็บใน AuditLog */
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
      if (
        sub?.stripeSubscriptionId &&
        ENTITLED_STATUSES.has(sub.status as Parameters<typeof ENTITLED_STATUSES.has>[0])
      ) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "บริษัทนี้มี subscription ของ Stripe ทำงานอยู่ — ให้ลูกค้ายกเลิกใน Stripe ก่อน ไม่งั้นถูกเก็บเงินสองทาง",
        });
      }

      const now = new Date();
      const curEnd = isInvoicePlan(sub) ? sub?.billingPeriodEnd : null;
      let start: Date;
      let end: Date;
      if (input.interval === "custom") {
        // กำหนดวันเอง: รอบใหม่ = วันนี้ → วันที่เลือก (ไม่ต่อท้ายรอบเดิม — BO-03: กัน start > end)
        if (!input.endDate) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "กรุณาเลือกวันหมดอายุ" });
        }
        end = bangkokEndOfDay(input.endDate);
        if (Number.isNaN(end.getTime()) || end.getTime() <= now.getTime()) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "วันหมดอายุต้องเป็นวันในอนาคต" });
        }
        start = now;
      } else {
        ({ start, end } = manualPeriodEnd(
          input.interval,
          input.mode === "extend" ? curEnd : null,
          now,
        ));
      }

      const data = invoiceGrantData(
        input.plan,
        input.interval === "custom" ? null : input.interval,
        start,
        end,
      );
      await prisma.subscription.upsert({
        where: { orgId: org.id },
        update: data,
        create: { orgId: org.id, ...data },
      });

      const planLabel = PLAN_LABELS[input.plan];
      const intervalText =
        input.interval === "yearly" ? "รายปี" : input.interval === "monthly" ? "รายเดือน" : "กำหนดวันเอง";
      const summary = `ทีมงานกำหนดแพ็กเกจ ${planLabel} แบบวางบิล/โอน (${intervalText}) ถึง ${formatDate(end)}${input.note ? ` · ${input.note}` : ""}`;
      await safeAuditLog({
        data: {
          orgId: org.id,
          userId: ctx.session.userId,
          action: "plan_assign",
          entityType: "subscription",
          entityRef: sub?.id ?? null,
          summary,
        },
      });
      return { success: true, summary, start: start.toISOString(), end: end.toISOString() };
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

      await safeAuditLog({
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
  /**
   * เปิด/ปิดฟังก์ชันพิเศษให้สมาชิกรายคนของ org (เช่น แก้วันที่ใบเสร็จ)
   * userIds = รายชื่อทั้งหมดที่ได้สิทธิ์หลังบันทึก (แทนที่ของเดิม) · ต้องเป็นสมาชิก active ของ org
   */
  setSpecialFeature: backofficeProcedure
    .input(
      z.object({
        orgId: z.string().uuid(),
        feature: z.enum(SPECIAL_FEATURE_KEYS),
        userIds: z.array(z.string().uuid()).max(500),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const org = await prisma.organization.findUnique({
        where: { id: input.orgId },
        select: {
          id: true,
          settings: true,
          members: {
            where: { status: "active" },
            select: { user: { select: { id: true, fullName: true, lineDisplayName: true } } },
          },
        },
      });
      if (!org) throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบบริษัทนี้" });

      const memberById = new Map(org.members.map((m) => [m.user.id, m.user]));
      const userIds = Array.from(new Set(input.userIds));
      const outsider = userIds.find((id) => !memberById.has(id));
      if (outsider) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "เลือกได้เฉพาะสมาชิกที่ใช้งานอยู่ของบริษัทนี้" });
      }

      const before = readSpecialFeatureUsers(org.settings, input.feature);
      // merge เฉพาะ specialFeatures.<feature> — ไม่ทับ key อื่น (vatRegistered, backoffice, …)
      const existing =
        org.settings && typeof org.settings === "object" && !Array.isArray(org.settings)
          ? (org.settings as Prisma.JsonObject)
          : {};
      const features =
        existing.specialFeatures && typeof existing.specialFeatures === "object" && !Array.isArray(existing.specialFeatures)
          ? (existing.specialFeatures as Prisma.JsonObject)
          : {};
      await prisma.organization.update({
        where: { id: org.id },
        data: {
          settings: {
            ...existing,
            specialFeatures: { ...features, [input.feature]: userIds },
          } as Prisma.InputJsonObject,
        },
      });

      const nameOf = (id: string) => {
        const u = memberById.get(id);
        return u?.fullName || u?.lineDisplayName || id.slice(0, 8);
      };
      const added = userIds.filter((id) => !before.includes(id)).map(nameOf);
      const removed = before.filter((id) => !userIds.includes(id)).map(nameOf);
      await safeAuditLog({
        data: {
          orgId: org.id,
          userId: ctx.session.userId,
          action: "update",
          entityType: "organization",
          entityRef: org.id,
          summary: `ทีมงานตั้งฟังก์ชันพิเศษ "${SPECIAL_FEATURES[input.feature].label}"${
            added.length ? ` · เปิดให้ ${added.join(", ")}` : ""
          }${removed.length ? ` · ปิดของ ${removed.join(", ")}` : ""}${!added.length && !removed.length ? " · ไม่เปลี่ยน" : ""}`,
        },
      });

      return { success: true, userIds };
    }),

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
      const trial = isInTrial(sub);
      const invoice = isInvoicePlan(sub);
      if (!lifetime && !trial && !invoice) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "บริษัทนี้ไม่มีสิทธิ์ที่ทีมงานให้ไว้ (ฟรี/วางบิล) ที่ยกเลิกได้",
        });
      }

      // ลำดับ: ฟรีชั่วคราว (trial ทับอยู่) → ถอดก่อน กลับแผนฐาน (อาจเป็นวางบิล) ·
      // ฟรีตลอดชีพ/วางบิล ที่ไม่มี Stripe → free · มี Stripe → คง plan รอ webhook sync
      const kind = trial ? "ใช้ฟรีชั่วคราว" : lifetime ? "ฟรีตลอดชีพ" : "วางบิล/โอน";
      // BO-06: Stripe id ค้างแต่ไม่ entitled (canceled/incomplete_expired) = ไม่มีใครจ่าย → free
      const stripeLive =
        !!sub.stripeSubscriptionId &&
        ENTITLED_STATUSES.has(sub.status as Parameters<typeof ENTITLED_STATUSES.has>[0]);
      const basePlan: PlanTier = trial
        ? normalise(sub.plan)
        : stripeLive
          ? normalise(sub.plan)
          : "free";

      await prisma.subscription.update({
        where: { id: sub.id },
        data: {
          plan: basePlan,
          isBetaTester: trial ? sub.isBetaTester : false,
          trialPlan: null,
          trialStartedAt: null,
          trialEndsAt: null,
          // ยกเลิกวางบิล → ปิดรอบทันที (ข้อมูลในชีตของลูกค้ายังอยู่ครบ)
          ...(!trial && invoice ? invoiceEndData() : {}),
          ...quotaCacheFor(basePlan),
        },
      });

      await safeAuditLog({
        data: {
          orgId: org.id,
          userId: ctx.session.userId,
          action: "update",
          entityType: "subscription",
          entityRef: sub.id,
          summary: `ทีมงานยกเลิกสิทธิ์${kind} → ${PLAN_LABELS[basePlan]}`,
        },
      });

      return { success: true };
    }),
});
