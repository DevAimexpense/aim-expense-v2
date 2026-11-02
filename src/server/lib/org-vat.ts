// ===========================================
// VAT guard ฝั่ง server (DOC-06)
// org ที่ไม่ได้จดทะเบียน VAT ต้องออกเอกสารที่มี VAT ไม่ได้ — UI บังคับ isVat=false อยู่แล้ว
// แต่ tRPC ถูกเรียกตรงได้ จึงต้องเช็กซ้ำที่นี่ (ctx.org ไม่มี flag นี้ — อ่านจาก Organization.settings
// แบบเดียวกับ org.router)
// ===========================================

import { TRPCError } from "@trpc/server";
import { prisma } from "@/lib/prisma";
import { readVatRegistered } from "@/lib/org-settings";

/** org นี้จด VAT หรือไม่ (default true สำหรับ org เดิมที่ไม่เคยตั้งค่า — ไม่กระทบ flow เดิม) */
export async function isOrgVatRegistered(orgId: string): Promise<boolean> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { settings: true },
  });
  return readVatRegistered(org?.settings);
}

/**
 * โยน FORBIDDEN เมื่อ org ไม่จด VAT แต่พยายามออกเอกสารที่มี VAT
 * - ใบเสนอราคา/ใบวางบิล/ใบเสร็จ: เรียกเมื่อ `input.isVat === true`
 * - ใบกำกับภาษี: เรียกเสมอ (ใบกำกับภาษีมี VAT เสมอ)
 */
export async function assertVatAllowed(
  orgId: string,
  isVat: boolean,
  docLabel: string
): Promise<void> {
  if (!isVat) return;
  if (await isOrgVatRegistered(orgId)) return;
  throw new TRPCError({
    code: "FORBIDDEN",
    message: `ธุรกิจนี้ไม่ได้จดทะเบียนภาษีมูลค่าเพิ่ม — ออก${docLabel}แบบมี VAT ไม่ได้ (ตั้งค่าได้ที่ ตั้งค่า → ข้อมูลบริษัท)`,
  });
}
