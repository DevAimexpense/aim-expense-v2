// ===========================================
// บันทึก AuditLog แบบไม่ทำให้งานหลักล้ม (CO-08)
// เดิม `await safeAuditLog(...)` อยู่ "หลัง" การเขียน Google Sheet — ถ้า Postgres สะดุด
// mutation จะ throw ทั้งที่แถวลง Sheet แล้ว → ผู้ใช้กดซ้ำ → แถวซ้ำ · ที่นี่จับ error แล้วส่ง Sentry แทน
// ใช้แทน prisma.auditLog.create ทุกที่ ยกเว้นใน $transaction (tx.auditLog) ซึ่งต้องล้มพร้อม tx
// ===========================================
import * as Sentry from "@sentry/nextjs";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type Args = Prisma.AuditLogCreateArgs | Prisma.AuditLogUncheckedCreateInput;

export async function safeAuditLog(args: Args): Promise<void> {
  // AuditLog ไม่มีคอลัมน์ชื่อ data → ถ้ามี key "data" คือรูป { data: {...} } ของ prisma.create
  const createArgs: Prisma.AuditLogCreateArgs =
    "data" in args ? (args as Prisma.AuditLogCreateArgs) : { data: args as Prisma.AuditLogUncheckedCreateInput };
  try {
    await prisma.auditLog.create(createArgs);
  } catch (err) {
    console.error("[audit] create failed:", createArgs.data.action, err);
    Sentry.captureException(err);
  }
}
