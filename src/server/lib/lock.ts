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
  const ttlMs = opts.ttlMs ?? 8000;
  const waitMs = opts.waitMs ?? 6000;
  const lockKey = `lock:${key}`;
  const token = randomUUID();
  const deadline = Date.now() + waitMs;
  let acquired = false;
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
