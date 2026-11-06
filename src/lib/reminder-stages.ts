// ===========================================
// ขั้นการเตือนก่อนหมดอายุ (7 / 3 / 1 วัน) — ใช้ร่วมกันระหว่างเตือน trial และเตือนรอบวางบิล
// กติกา (BIL-11): แต่ละขั้นยิงครั้งเดียวต่อรอบ เป็น "หน้าต่าง" (daysLeft <= stage) ไม่ใช่วันตรงเป๊ะ
// cron ที่พลาด/ช้าจะส่งวันถัดไปแทนที่จะไม่ส่งเลย · ถ้าค้างหลายขั้นพร้อมกัน ส่ง 1 ข้อความแล้ว mark ทุกขั้น
// ===========================================

export const REMINDER_DAYS = [7, 3, 1] as const;
const DAY_MS = 86_400_000;

/** จำนวนวันที่เหลือ (ปัดขึ้น) — 0 = หมดวันนี้ */
export function daysLeftUntil(end: Date, now: Date): number {
  return Math.ceil((end.getTime() - now.getTime()) / DAY_MS);
}

/** ขั้นที่ถึงกำหนดและยังไม่เคยส่งในรอบนี้ */
export function dueStages(daysLeft: number, done: ReadonlySet<number>): number[] {
  return REMINDER_DAYS.filter((d) => daysLeft <= d && !done.has(d));
}

/** แปลง mark `<prefix><stage>` ที่อยู่ใน AuditLog.summary → stage (null ถ้าไม่ใช่) */
export function parseStageMark(summary: string | null | undefined, prefix: string): number | null {
  if (!summary || !summary.startsWith(prefix)) return null;
  const n = Number(summary.slice(prefix.length));
  return Number.isFinite(n) ? n : null;
}
