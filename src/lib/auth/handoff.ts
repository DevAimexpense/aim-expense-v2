// ===========================================
// Aim Expense — ส่งต่อการล็อกอินข้ามเบราว์เซอร์ (browser ของ LINE → Safari/Chrome)
// พอร์ตจาก aim-hr (src/lib/auth/handoff.ts)
//
// ปัญหาที่แก้: Google อาจบล็อก OAuth ใน browser ฝังของแอป (403 disallowed_useragent)
// ลิงก์เชื่อม Google จึงใส่ `openExternalBrowser=1` ให้ LINE เปิด Safari/Chrome — แต่
// cookie session อยู่ใน browser ของ LINE ตามไปไม่ได้ (เคยทำ login พังมาแล้ว — ดู
// lib/line/flex/menu.ts) → ออก "ตั๋ว" ตอนยังล็อกอินอยู่ พกไปกับ URL ปลายทางแลกเป็น session
//
// กันตั๋วรั่ว 4 ชั้น:
//   1. เก็บแค่ sha256 ใน DB — หลุดจาก DB ก็ใช้ต่อไม่ได้
//   2. อายุ 10 นาที
//   3. ใช้ได้ครั้งเดียว (usedAt) — ตัดสินที่ DB ด้วย updateMany + usedAt: null
//   4. ปลายทางแลกตั๋วแล้ว "เด้งต่อไปยัง URL ที่ไม่มีตั๋ว" ก่อนไป Google (ตั๋วไม่ติด Referer)
//
// ⚠️ fail-safe: ถ้าตาราง auth_handoffs ยังไม่ถูกสร้าง (ยังไม่ db push) ทุกฟังก์ชันคืน null
// → ลิงก์ไม่มีตั๋ว ทำงานแบบเดิมทุกอย่าง
// ===========================================

import { randomBytes, createHash } from "crypto";
import { prisma } from "@/lib/prisma";

const TTL_MINUTES = 10;

function hash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** ออกตั๋วใหม่ — คืนตัวตั๋วจริง (เก็บแค่ hash) หรือ null ถ้าออกไม่ได้ */
export async function createAuthHandoff(userId: string): Promise<string | null> {
  try {
    const token = randomBytes(32).toString("base64url");
    await prisma.authHandoff.create({
      data: {
        tokenHash: hash(token),
        userId,
        expiresAt: new Date(Date.now() + TTL_MINUTES * 60_000),
      },
    });
    // เก็บกวาดตั๋วเก่า best-effort (ไม่ต้องมี cron แยก)
    void prisma.authHandoff
      .deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 60 * 60_000) } } })
      .catch(() => {});
    return token;
  } catch (err) {
    console.warn("[handoff] create failed (table missing?)", err);
    return null;
  }
}

/** แลกตั๋วเป็น userId — null ถ้าไม่มีจริง/หมดอายุ/ใช้ไปแล้ว/DB ยังไม่พร้อม */
export async function consumeAuthHandoff(token: string | null | undefined): Promise<string | null> {
  if (!token) return null;
  try {
    const row = await prisma.authHandoff.findUnique({ where: { tokenHash: hash(token) } });
    if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) return null;
    const claimed = await prisma.authHandoff.updateMany({
      where: { id: row.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    return claimed.count === 1 ? row.userId : null;
  } catch (err) {
    console.warn("[handoff] consume failed", err);
    return null;
  }
}

/**
 * ลิงก์เชื่อม Google: มีตั๋ว → ให้ LINE เปิด Safari/Chrome (`openExternalBrowser=1`) + แนบตั๋ว
 * ไม่มีตั๋ว (เช่นยังไม่ db push) → ลิงก์เดิม **ห้ามใส่ openExternalBrowser** เพราะ session
 * ไม่ตามไป Safari = ต้องล็อกอินใหม่ (บั๊กเดิมที่เคยทำ login พัง)
 */
export function googleLinkWithHandoff(path: string, handoff: string | null | undefined): string {
  if (!handoff) return path;
  return `${path}?openExternalBrowser=1&h=${encodeURIComponent(handoff)}`;
}
