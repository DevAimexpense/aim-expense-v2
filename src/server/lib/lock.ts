// ===========================================
// Distributed lock (Upstash Redis, SET NX PX) — กันการอ่าน-แล้ว-เขียนพร้อมกันบน Google Sheet
// ใช้กับ: เลขเอกสารรายเดือน (max+1), recordPayment (PaidAmount), updateById/deleteById (index แถว)
// - ไม่มี Redis (dev) → รัน fn ตรง ๆ (ไม่มี lock) และ log เตือนครั้งเดียว
// - รอ lock ได้สูงสุด waitMs แล้วค่อยรันต่อ (fail-open) เพราะงานผู้ใช้ต้องไม่ค้างเพราะ Redis
// ===========================================
import { randomUUID } from "node:crypto";
import { getRedis } from "./cache";

const RELEASE_SCRIPT = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;
let warned = false;

export async function withLock<T>(
  key: string,
  fn: () => Promise<T>,
  opts: { ttlMs?: number; waitMs?: number } = {},
): Promise<T> {
  const redis = getRedis();
  if (!redis) {
    if (!warned) {
      warned = true;
      console.warn("[lock] Redis not configured — running without distributed lock");
    }
    return fn();
  }
  // CO-24/DOC-23: ค่าเริ่มต้นต้องยาวกว่า "อ่าน Sheet 2 ครั้งใต้ 429 retry" (~5 วิ/ครั้ง)
  // เดิม 8 วิ → lock หมดอายุก่อนเขียน = คนที่สองอ่าน index/เลขเก่าแล้วเขียนทับ
  // ttl 20 วิ ครอบ read→write ทั้งรอบ; รอได้ 8 วิ แล้ว fail-open (งานผู้ใช้ต้องไม่ค้าง)
  const ttlMs = opts.ttlMs ?? 20000;
  const waitMs = opts.waitMs ?? 8000;
  const lockKey = `lock:${key}`;
  const token = randomUUID();
  const deadline = Date.now() + waitMs;
  let acquired = false;
  try {
    // CO-20: Redis ที่ "พัง" (timeout/5xx/429) ต้องไม่ทำให้งานผู้ใช้ล้ม — ทำงานต่อโดยไม่มี lock
    // เหมือนกรณีไม่ได้ตั้งค่า Redis (cache.ts ก็กลืน error ของ Redis แบบเดียวกัน)
    try {
      while (Date.now() < deadline) {
        const ok = await redis.set(lockKey, token, { nx: true, px: ttlMs });
        if (ok) {
          acquired = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 120 + Math.random() * 120));
      }
      if (!acquired) console.warn(`[lock] timeout waiting for ${lockKey} — proceeding without lock`);
    } catch (e) {
      acquired = false;
      console.warn(`[lock] redis error on ${lockKey} — proceeding without lock`, e);
    }
    return await fn();
  } finally {
    if (acquired) {
      try {
        await redis.eval(RELEASE_SCRIPT, [lockKey], [token]);
      } catch (e) {
        console.warn("[lock] release failed", e);
      }
    }
  }
}
