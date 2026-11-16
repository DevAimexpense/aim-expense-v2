// ===========================================
// GET /api/cron/period-fingerprint — CTRL-03r: ตรวจงวดที่ปิดแล้วอัตโนมัติ (เดือนละครั้งต่อองค์กร)
//
// องค์กรที่มีลายนิ้วมือยอดงวด (settings.periodClose.snapshots) และยังไม่ได้ตรวจในเดือนนี้
//   → คำนวณยอด 3 เดือนปิดล่าสุดใหม่ (รายงานตัวเดียวกับที่ผู้ใช้เห็น) เทียบกับตอนปิด
//   → ไม่ตรง: แจ้งเจ้าของทาง LINE 1 ข้อความ + audit log · ตรง: เงียบ
//   → บันทึก periodClose.lastVerified = เดือนนี้ (jsonb_set เฉพาะคีย์นั้น) — วันถัดไปไม่ตรวจซ้ำ
// รันทุกวัน แต่แต่ละองค์กรตรวจเดือนละครั้ง · มีงบเวลา — องค์กรที่ไม่ทันจะถูกตรวจวันถัดไป
// อ่านชีตด้วย token ของเจ้าของ (เหมือนทุกทาง) · ไม่เขียนข้อมูลธุรกิจ
//
// Auth: `Authorization: Bearer ${CRON_SECRET}` (Vercel Cron)
// ===========================================

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/auth/middleware";
import { pushMessage } from "@/lib/line/messaging";
import { cronVerifyOutcome, readPeriodClose, snapshotMonthsToVerify } from "@/lib/period-close";
import { yearMonthBangkok } from "@/lib/utils/date";
import { verifyClosedPeriods } from "@/server/lib/period-fingerprint";
import { safeAuditLog } from "@/server/lib/audit";
import type { TRPCContext } from "@/server/trpc";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const TIME_BUDGET_MS = 240_000;

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[cron/period-fingerprint] CRON_SECRET is not set — refusing to run");
    return NextResponse.json({ error: "CRON_SECRET not configured — cron disabled" }, { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  const thisMonth = yearMonthBangkok();
  const orgs = await prisma.organization.findMany({
    where: { settings: { not: Prisma.DbNull } },
    select: { id: true, name: true, ownerId: true, settings: true, owner: { select: { lineUserId: true, fullName: true, lineDisplayName: true } } },
  });

  const due = orgs
    .map((o) => ({ ...o, period: readPeriodClose(o.settings) }))
    .filter((o) => o.period.snapshots && (o.period.lastVerified || "") < thisMonth);

  let checked = 0;
  let alerted = 0;
  let processed = 0;
  const failed: string[] = [];
  for (const o of due) {
    if (Date.now() - started > TIME_BUDGET_MS) break;
    processed++;
    try {
      const months = snapshotMonthsToVerify(o.period, 3);
      if (months.length > 0) {
        const org = await getOrgContext(o.ownerId, o.id);
        if (!org) {
          // เจ้าของไม่ใช่สมาชิก active ขององค์กรแล้ว (ข้อมูลผิดปกติ) — ให้ทีมเห็น ไม่ mark
          failed.push(o.id);
          console.error(`[cron/period-fingerprint] org=${o.id} owner has no active membership — skipped`);
          continue;
        }
        const ctx: TRPCContext = {
          session: {
            userId: o.ownerId,
            lineUserId: o.owner.lineUserId,
            displayName: "ระบบตรวจงวดอัตโนมัติ",
            avatarUrl: null,
            onboardingStep: "done",
            activeOrgId: o.id,
          },
          org: {
            orgId: org.orgId,
            orgName: org.orgName,
            entityType: org.entityType,
            role: "admin",
            permissions: org.permissions,
            eventScope: [],
            googleSpreadsheetId: org.googleSpreadsheetId,
            googleDriveFolderId: org.googleDriveFolderId,
            isBackoffice: org.isBackoffice,
            plan: org.plan,
            features: org.features,
          },
        };
        const result = await verifyClosedPeriods(ctx, o.period, months);
        const outcome = cronVerifyOutcome(result);
        if (outcome === "failed") {
          // CRON-02: อ่านชีตไม่ได้ (บางเดือน/บางส่วน) และไม่เจอยอดไม่ตรง → ไม่ถือว่าตรวจแล้ว · ลองใหม่พรุ่งนี้
          failed.push(o.id);
          console.error(
            `[cron/period-fingerprint] org=${o.id} incomplete — unchecked=${result.unchecked.join(",") || "-"} partial=${result.partial.join(",") || "-"}`,
          );
          continue;
        }
        if (outcome === "alert") {
          const lines = result.mismatches.map((m) => `${m.label}\n${m.diffs.map((d) => `· ${d}`).join("\n")}`).join("\n\n");
          const text =
            `⚠️ ${o.name}: ตัวเลขงวดที่ปิดแล้วไม่ตรงกับตอนปิด\n\n${lines}\n\n` +
            `มีการแก้ข้อมูลหลังปิดงวด (เช่นแก้ใน Google Sheet โดยตรง) — ตรวจกับแบบที่ยื่นแล้ว และดูประวัติเวอร์ชันของชีต ` +
            `(ตั้งค่าองค์กร → ปิดงวดบัญชี → ตรวจตัวเลขงวดที่ปิดแล้ว)`;
          if (o.owner.lineUserId) {
            await pushMessage(o.owner.lineUserId, [{ type: "text", text: text.slice(0, 4900) }]).catch((err) =>
              console.error(`[cron/period-fingerprint] LINE push failed org=${o.id}`, err),
            );
          }
          await safeAuditLog({
            data: {
              orgId: o.id,
              userId: o.ownerId,
              action: "update",
              entityType: "period_close",
              entityRef: "verify",
              summary: `ตรวจงวดอัตโนมัติ: ไม่ตรง ${result.mismatches.map((m) => m.label).join(", ")}`,
            },
          });
          alerted++;
        } else {
          checked++;
        }
      }
      // บันทึกว่าตรวจเดือนนี้แล้ว (เฉพาะคีย์ lastVerified — ไม่ทับค่าอื่นของ periodClose)
      await prisma.$executeRaw(
        Prisma.sql`UPDATE organizations SET settings = jsonb_set(settings, '{periodClose,lastVerified}', to_jsonb(${thisMonth}::text), true) WHERE id = ${o.id} AND settings ? 'periodClose'`,
      );
    } catch (err) {
      // อ่านชีตไม่ได้ (token หมดอายุ / โควตา) → ไม่ mark — ลองใหม่พรุ่งนี้ · รายชื่ออยู่ใน response/log ให้ทีมตามได้
      failed.push(o.id);
      console.error(`[cron/period-fingerprint] org=${o.id} failed`, err);
    }
  }

  const deferred = due.length - processed; // ไม่ทันงบเวลา → ตรวจวันถัดไป
  if (failed.length > 0) console.warn(`[cron/period-fingerprint] ${failed.length} org(s) failed: ${failed.join(",")}`);
  return NextResponse.json({ success: true, due: due.length, ok: checked, alerted, failed: failed.length, failedOrgIds: failed, deferred });
}
