// ===========================================
// LineDraft.status helpers (LINE-25)
// status ที่ใช้จริงตอนนี้: "pending" | "saving:<epochMs>"
// (confirmed/cancelled ไม่มีแล้ว — บันทึก/ยกเลิก/หมดอายุ = ลบแถวทิ้ง ตาม LINE-06)
//
// model ไม่มี updatedAt → เก็บเวลาที่ claim ไว้ใน status เอง ("saving:1730000000000")
// เพื่อให้รู้ว่า draft "ค้าง saving" (function ตายกลางทาง) มานานแค่ไหนโดยไม่ต้องแก้ schema
// และไม่ต้องเดาจาก createdAt (ซึ่งทำให้ draft เก่าที่เพิ่งกดบันทึกถูกมองว่าค้างทันที →
// กดซ้ำแล้วบันทึกซ้ำ = LINE-04 กลับมา)
// แถวเก่าที่ยังเป็น "saving" เฉย ๆ (ก่อน deploy นี้) → ใช้ createdAt แทน
// ===========================================

export const SAVING_PREFIX = "saving";

/** postback: ค้าง saving เกิน 3 นาที = function ตายแน่ (การบันทึกจริงใช้ < 30 วิ) → ให้ลองใหม่ได้ */
export const SAVING_STALE_MS = 3 * 60 * 1000;
/** cron: ค้างเกิน 10 นาที → คืนเป็น pending */
export const SAVING_STALE_CRON_MS = 10 * 60 * 1000;

/** ค่า status ตอน claim (pending → saving) — ฝังเวลาที่ claim */
export function savingStatus(now: number = Date.now()): string {
  return `${SAVING_PREFIX}:${now}`;
}

export function isSavingStatus(status: string): boolean {
  return status === SAVING_PREFIX || status.startsWith(`${SAVING_PREFIX}:`);
}

/** เวลาที่ draft ถูก claim เป็น saving (ms) — แถวเก่าไม่มี timestamp → createdAt */
export function savingClaimedAt(draft: { status: string; createdAt: Date }): number {
  const m = /^saving:(\d{10,})$/.exec(draft.status);
  if (m) return Number(m[1]);
  return draft.createdAt.getTime();
}

export function isSavingStale(
  draft: { status: string; createdAt: Date },
  staleMs: number,
  now: number = Date.now(),
): boolean {
  return isSavingStatus(draft.status) && now - savingClaimedAt(draft) > staleMs;
}
