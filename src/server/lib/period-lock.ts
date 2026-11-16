// ===========================================
// CTRL-01: ด่านปิดงวดฝั่ง server — ทุก mutation ที่ทำให้รายงานของงวดที่ปิดแล้วเปลี่ยนต้องผ่านที่นี่
// ===========================================

import { TRPCError } from "@trpc/server";
import { prisma } from "@/lib/prisma";
import { readPeriodClose, isDateInClosedPeriod, thaiPeriodLabel, paymentReportDates } from "@/lib/period-close";

/** เดือนล่าสุดที่ปิด (YYYY-MM) · "" = ไม่ปิด · อ่านไม่ได้ → "" (ไม่บล็อกงานปกติเพราะ DB สะดุด) */
export async function getClosedThrough(orgId: string): Promise<string> {
  try {
    const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { settings: true } });
    return readPeriodClose(org?.settings).closedThrough;
  } catch (err) {
    console.error("[period-lock] read settings failed — not enforcing", err);
    return "";
  }
}

/** ห้ามถ้าวันที่ใดอยู่ในงวดที่ปิดแล้ว */
export async function assertPeriodOpen(
  orgId: string,
  dates: string | undefined | null | (string | undefined | null)[],
  what: string,
): Promise<void> {
  const list = (Array.isArray(dates) ? dates : [dates]).filter((d): d is string => !!d);
  if (list.length === 0) return;
  const closedThrough = await getClosedThrough(orgId);
  const hit = list.find((d) => isDateInClosedPeriod(d, closedThrough));
  if (hit) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `งวด ${thaiPeriodLabel(hit.slice(0, 7))} ปิดแล้ว — ${what}ไม่ได้ (รายงานที่ยื่นแล้วจะเปลี่ยน) · ให้ผู้มีสิทธิ์เปิดงวดที่ ตั้งค่าองค์กร → ปิดงวดบัญชี ก่อน`,
    });
  }
}

/** รายการจ่ายที่จ่ายแล้ว (ก่อน/หลังเปลี่ยน) ลงงวดที่ปิดแล้วไหม */
export async function assertPaymentPeriodOpen(
  orgId: string,
  rows: (Record<string, string | undefined> | null | undefined)[],
  what: string,
): Promise<void> {
  const dates = rows.flatMap((r) => (r ? paymentReportDates(r) : []));
  await assertPeriodOpen(orgId, dates, what);
}
