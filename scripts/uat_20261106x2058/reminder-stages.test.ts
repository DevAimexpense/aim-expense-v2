// UAT: ขั้นการเตือน 7/3/1 (lib/reminder-stages.ts) — รัน: npx -y tsx scripts/uat_20261106x2058/reminder-stages.test.ts · ไม่แตะ DB
import { daysLeftUntil, dueStages, parseStageMark } from "../../src/lib/reminder-stages";

const NOW = new Date("2026-11-06T01:30:00Z"); // 08:30 ไทย (เวลา cron)
const endIn = (days: number) => new Date(NOW.getTime() + days * 86_400_000);
type Case = { name: string; got: unknown; want: unknown };
const CASES: Case[] = [
  { name: "เหลือ 10 วัน → ยังไม่ถึงขั้นไหน", got: dueStages(10, new Set()), want: [] },
  { name: "เหลือ 7 วัน → ขั้น 7", got: dueStages(7, new Set()), want: [7] },
  { name: "เหลือ 5 วัน ยังไม่เคยส่ง → ขั้น 7 (ส่งช้าดีกว่าไม่ส่ง)", got: dueStages(5, new Set()), want: [7] },
  { name: "เหลือ 3 วัน ส่ง 7 แล้ว → ขั้น 3", got: dueStages(3, new Set([7])), want: [3] },
  { name: "เหลือ 1 วัน cron หยุดไป 1 สัปดาห์ → ค้าง 3 ขั้น = ส่ง 1 ข้อความ mark ทั้ง 7,3,1", got: dueStages(1, new Set()), want: [7, 3, 1] },
  { name: "เหลือ 1 วัน ส่งครบแล้ว → ไม่ส่งซ้ำ", got: dueStages(1, new Set([7, 3, 1])), want: [] },
  { name: "หมดวันนี้ (0) ส่ง 7,3 แล้ว → ขั้น 1", got: dueStages(0, new Set([7, 3])), want: [1] },
  { name: "daysLeft: รอบวางบิลหมดสิ้นวัน 13/11 ไทย (16:59:59Z) ตอน cron 06/11 08:30 → 8 วัน (ปัดขึ้น)", got: daysLeftUntil(new Date("2026-11-13T16:59:59Z"), NOW), want: 8 },
  { name: "daysLeft: หมด 12/11 สิ้นวันไทย → 7 วัน → เข้าขั้น 7", got: dueStages(daysLeftUntil(new Date("2026-11-12T16:59:59Z"), NOW), new Set()), want: [7] },
  { name: "daysLeft: trial หมดใน 2.5 วัน → 3", got: daysLeftUntil(endIn(2.5), NOW), want: 3 },
  { name: "parseStageMark invoice-reminder:3 → 3", got: parseStageMark("invoice-reminder:3", "invoice-reminder:"), want: 3 },
  { name: "parseStageMark prefix ไม่ตรง (trial mark) → null", got: parseStageMark("trial-reminder:3", "invoice-reminder:"), want: null },
  { name: "parseStageMark ค่าไม่ใช่ตัวเลข → null", got: parseStageMark("invoice-reminder:x", "invoice-reminder:"), want: null },
];
let fail = 0;
for (const c of CASES) {
  const ok = JSON.stringify(c.got) === JSON.stringify(c.want);
  if (!ok) fail++;
  console.log(`${ok ? "✅" : "❌"} ${c.name}${ok ? "" : `\n     got  ${JSON.stringify(c.got)}\n     want ${JSON.stringify(c.want)}`}`);
}
console.log(`\nผ่าน ${CASES.length - fail} · ไม่ผ่าน ${fail}`);
process.exit(fail ? 1 : 0);
