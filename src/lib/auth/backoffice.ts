// ===========================================
// Aim Expense — ประตูหลังบ้านทีมงาน (/backoffice)
//
// เข้าได้เมื่อผู้ใช้เป็น admin (สมาชิก active) ของ "บริษัทหลังบ้าน" —
// org ที่ settings.backoffice = true — **ไม่ว่าจะกำลังเลือกบริษัทไหนอยู่**
// (เดิมเช็กจาก org ที่เลือกอยู่ → สลับไปบริษัทลูกค้าแล้วเมนูหาย)
//
// ใช้ร่วมกัน 3 จุด: backofficeProcedure (tRPC), (app)/backoffice/layout.tsx (หน้า),
// (app)/layout.tsx → Sidebar (เมนู) — กฎเดียว ไม่เขียนซ้ำ
// ===========================================

import * as React from "react";
import { prisma } from "@/lib/prisma";
import { readIsBackoffice } from "@/lib/org-settings";

export interface BackofficeMembershipRow {
  role: string;
  status: string;
  orgSettings: unknown;
}

/**
 * กฎล้วน ๆ (ไม่แตะ DB) — มีอย่างน้อย 1 membership ที่
 *   active + role admin + org นั้นเป็นบริษัทหลังบ้าน
 */
export function hasBackofficeAdminMembership(
  rows: readonly BackofficeMembershipRow[],
): boolean {
  return rows.some(
    (m) =>
      m.status === "active" &&
      m.role === "admin" &&
      readIsBackoffice(m.orgSettings),
  );
}

// React.cache มีเฉพาะ runtime ของ Server Components — สคริปต์/UAT ที่รันด้วย tsx ไม่มี → ไม่ cache
const perRequest: <F extends (...a: never[]) => unknown>(fn: F) => F =
  typeof React.cache === "function" ? React.cache : (fn) => fn;

/**
 * ผู้ใช้คนนี้เป็น admin ของบริษัทหลังบ้านหรือไม่ — query เดียว, cache ต่อ request
 * (layout + page + tRPC ใน request เดียวกันไม่ถาม DB ซ้ำ)
 */
export const isBackofficeAdmin = perRequest(async (userId: string): Promise<boolean> => {
  const rows = await prisma.orgMember.findMany({
    where: { userId, role: "admin", status: "active" },
    select: { role: true, status: true, org: { select: { settings: true } } },
  });
  return hasBackofficeAdminMembership(
    rows.map((m) => ({ role: m.role, status: m.status, orgSettings: m.org.settings })),
  );
});

/** org id ของบริษัทหลังบ้านทั้งหมด (ไว้ตัดออกจาก "ลูกค้าจ่ายจริง") */
export function isBackofficeOrgSettings(settings: unknown): boolean {
  return readIsBackoffice(settings);
}
