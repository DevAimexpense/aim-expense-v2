// UAT: LineDraft status helpers (LINE-25 / รอบ 4 updatedAt) — รัน: npx -y tsx scripts/uat_<ts>/draft-status.test.ts
// ตรวจขอบเขต "ค้าง saving" ของ savingClaimedAt / isSavingStale โดยไม่แตะ DB
import {
  SAVING_STALE_MS,
  SAVING_STALE_CRON_MS,
  savingStatus,
  isSavingStatus,
  savingClaimedAt,
  isSavingStale,
  type DraftStatusRow,
} from "../../src/lib/line/draft-status";

const NOW = 1_762_400_000_000; // epoch ms คงที่ ให้ผลทดสอบซ้ำได้
const MIN = 60 * 1000;
const row = (status: string, createdAgoMs: number, updatedAgoMs?: number): DraftStatusRow => ({
  status,
  createdAt: new Date(NOW - createdAgoMs),
  ...(updatedAgoMs === undefined ? {} : { updatedAt: new Date(NOW - updatedAgoMs) }),
});

type Case = { name: string; got: unknown; want: unknown };
const CASES: Case[] = [
  // --- status format ---
  { name: "savingStatus ฝัง epoch ms", got: savingStatus(NOW), want: `saving:${NOW}` },
  { name: "isSavingStatus saving:<ms>", got: isSavingStatus(`saving:${NOW}`), want: true },
  { name: "isSavingStatus legacy bare saving", got: isSavingStatus("saving"), want: true },
  { name: "isSavingStatus pending", got: isSavingStatus("pending"), want: false },
  { name: "isSavingStatus savings (คำอื่นที่ขึ้นต้นเหมือน)", got: isSavingStatus("savings"), want: false },

  // --- fresh saving: เพิ่ง claim → ไม่ค้าง (LINE-04 ห้ามบันทึกซ้ำ) ---
  { name: "fresh saving (claim ตอนนี้) ไม่ stale", got: isSavingStale(row(savingStatus(NOW), 60 * MIN), SAVING_STALE_MS, NOW), want: false },
  { name: "fresh saving แม้ draft สร้างมานาน 1 ชม. (createdAt ต้องไม่ถูกใช้)", got: isSavingStale(row(savingStatus(NOW - 10_000), 60 * MIN), SAVING_STALE_MS, NOW), want: false },
  { name: "claimedAt = timestamp ใน status ไม่ใช่ createdAt/updatedAt", got: savingClaimedAt(row(savingStatus(NOW - 5_000), 60 * MIN, 30 * MIN)), want: NOW - 5_000 },

  // --- boundary: exactly at threshold = ไม่ stale, เกิน 1 ms = stale ---
  { name: "ค้างพอดี 3 นาที → ยังไม่ stale (ต้อง > ไม่ใช่ >=)", got: isSavingStale(row(savingStatus(NOW - SAVING_STALE_MS), 0), SAVING_STALE_MS, NOW), want: false },
  { name: "ค้าง 3 นาที + 1 ms → stale", got: isSavingStale(row(savingStatus(NOW - SAVING_STALE_MS - 1), 0), SAVING_STALE_MS, NOW), want: true },
  { name: "cron: ค้าง 10 นาทีพอดี → ไม่ stale", got: isSavingStale(row(savingStatus(NOW - SAVING_STALE_CRON_MS), 0), SAVING_STALE_CRON_MS, NOW), want: false },
  { name: "cron: ค้าง 10 นาที + 1 ms → stale", got: isSavingStale(row(savingStatus(NOW - SAVING_STALE_CRON_MS - 1), 0), SAVING_STALE_CRON_MS, NOW), want: true },
  { name: "postback stale (4 นาที) แต่ cron ยังไม่ stale", got: [isSavingStale(row(savingStatus(NOW - 4 * MIN), 0), SAVING_STALE_MS, NOW), isSavingStale(row(savingStatus(NOW - 4 * MIN), 0), SAVING_STALE_CRON_MS, NOW)], want: [true, false] },

  // --- legacy bare "saving" (แถวก่อน LINE-25) → ไม่มี updatedAt → createdAt ---
  { name: "legacy saving ไม่มี updatedAt → claimedAt = createdAt", got: savingClaimedAt(row("saving", 7 * MIN)), want: NOW - 7 * MIN },
  { name: "legacy saving createdAt 7 นาที → stale (postback)", got: isSavingStale(row("saving", 7 * MIN), SAVING_STALE_MS, NOW), want: true },
  { name: "legacy saving createdAt 1 นาที → ไม่ stale", got: isSavingStale(row("saving", 1 * MIN), SAVING_STALE_MS, NOW), want: false },
  { name: "legacy saving updatedAt: null → createdAt", got: savingClaimedAt({ status: "saving", createdAt: new Date(NOW - 2 * MIN), updatedAt: null }), want: NOW - 2 * MIN },

  // --- garbage suffix: ไม่ตรง /^saving:(\d{10,})$/ → ถือเป็น saving ที่ไม่มี timestamp ---
  { name: "saving:abc → isSavingStatus true", got: isSavingStatus("saving:abc"), want: true },
  { name: "saving:abc → claimedAt fallback createdAt (ไม่มี updatedAt)", got: savingClaimedAt(row("saving:abc", 5 * MIN)), want: NOW - 5 * MIN },
  { name: "saving:123 (สั้นกว่า 10 หลัก) → fallback createdAt", got: savingClaimedAt(row("saving:123", 5 * MIN)), want: NOW - 5 * MIN },
  { name: "saving:<ms>x (ท้ายเพี้ยน) → fallback createdAt", got: savingClaimedAt(row(`saving:${NOW}x`, 5 * MIN)), want: NOW - 5 * MIN },
  { name: "saving: (ว่าง) ค้าง 5 นาที → stale", got: isSavingStale(row("saving:", 5 * MIN), SAVING_STALE_MS, NOW), want: true },

  // --- pending never stale (ไม่ว่านานแค่ไหน) ---
  { name: "pending เก่า 1 วัน → ไม่ stale", got: isSavingStale(row("pending", 24 * 60 * MIN, 24 * 60 * MIN), SAVING_STALE_MS, NOW), want: false },
  { name: "confirmed เก่า 1 วัน → ไม่ stale", got: isSavingStale(row("confirmed", 24 * 60 * MIN), SAVING_STALE_CRON_MS, NOW), want: false },

  // --- updatedAt preferred (รอบ 4): status ไม่มี timestamp + มี updatedAt → ใช้ updatedAt ไม่ใช่ createdAt ---
  { name: "legacy saving + updatedAt 1 นาที (createdAt 1 ชม.) → claimedAt = updatedAt", got: savingClaimedAt(row("saving", 60 * MIN, 1 * MIN)), want: NOW - 1 * MIN },
  { name: "legacy saving + updatedAt 1 นาที → ไม่ stale (createdAt เก่าต้องไม่ทำให้ค้างทันที)", got: isSavingStale(row("saving", 60 * MIN, 1 * MIN), SAVING_STALE_MS, NOW), want: false },
  { name: "legacy saving + updatedAt 4 นาที → stale", got: isSavingStale(row("saving", 60 * MIN, 4 * MIN), SAVING_STALE_MS, NOW), want: true },
  { name: "garbage suffix + updatedAt → ใช้ updatedAt", got: savingClaimedAt(row("saving:abc", 60 * MIN, 2 * MIN)), want: NOW - 2 * MIN },
  { name: "updatedAt invalid Date → ข้ามไป createdAt", got: savingClaimedAt({ status: "saving", createdAt: new Date(NOW - 3 * MIN), updatedAt: new Date(NaN) }), want: NOW - 3 * MIN },
];

let fail = 0;
for (const c of CASES) {
  const ok = JSON.stringify(c.got) === JSON.stringify(c.want);
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${c.name}${ok ? "" : `  (got ${JSON.stringify(c.got)} want ${JSON.stringify(c.want)})`}`);
}
console.log(fail === 0 ? `\nALL ${CASES.length} PASS` : `\n${fail} FAILED`);
process.exit(fail === 0 ? 0 : 1);
