// UAT: กติกาวางบิล/โอน (lib/comp.ts) — รัน: npx -y tsx scripts/uat_20261106x2058/invoice-plan.test.ts · ไม่แตะ DB
import {
  INVOICE_STATUS,
  addMonthsClamped,
  bangkokEndOfDay,
  invoiceEndData,
  invoiceGrantData,
  isInvoiceActive,
  isInvoicePlan,
  manualPeriodEnd,
} from "../../src/lib/comp";

const NOW = new Date("2026-11-06T12:00:00+07:00");
const iso = (d: Date) => d.toISOString();
type Case = { name: string; got: unknown; want: unknown };
const CASES: Case[] = [
  { name: "addMonthsClamped 31/01 + 1 = 28/02 (2026 ไม่ใช่ปีอธิกสุรทิน)", got: addMonthsClamped(new Date(2026, 0, 31), 1).getDate(), want: 28 },
  { name: "addMonthsClamped 31/01/2028 + 1 = 29/02", got: addMonthsClamped(new Date(2028, 0, 31), 1).getDate(), want: 29 },
  { name: "addMonthsClamped 15/11 + 12 = 15/11 ปีถัดไป", got: [addMonthsClamped(new Date(2026, 10, 15), 12).getFullYear(), addMonthsClamped(new Date(2026, 10, 15), 12).getMonth(), addMonthsClamped(new Date(2026, 10, 15), 12).getDate()], want: [2027, 10, 15] },
  { name: "manualPeriodEnd monthly ไม่มีรอบเดิม → สิ้นวัน 06/12 เวลาไทย (16:59:59Z)", got: iso(manualPeriodEnd("monthly", null, NOW).end), want: "2026-12-06T16:59:59.000Z" },
  { name: "manualPeriodEnd yearly ไม่มีรอบเดิม → สิ้นวัน 06/11/2027 เวลาไทย", got: iso(manualPeriodEnd("yearly", null, NOW).end), want: "2027-11-06T16:59:59.000Z" },
  { name: "BO-04: กดตี 2 วันที่ 7 (= 6 พ.ย. 19:00Z) → end = 07/12 สิ้นวันไทย ไม่ใช่ 06/12", got: iso(manualPeriodEnd("monthly", null, new Date("2026-11-06T19:00:00Z")).end), want: "2026-12-07T16:59:59.000Z" },
  { name: "BO-04: end แสดงวันเดียวกันทั้ง UTC และไทย (getUTCDate = วันไทย)", got: manualPeriodEnd("monthly", null, new Date("2026-11-06T19:00:00Z")).end.getUTCDate(), want: 7 },
  { name: "manualPeriodEnd 31/01 ไทย + 1 เดือน → สิ้นวัน 28/02", got: iso(manualPeriodEnd("monthly", null, new Date("2026-01-31T03:00:00+07:00")).end), want: "2026-02-28T16:59:59.000Z" },
  { name: "bangkokEndOfDay('2026-12-20') = 20/12 16:59:59Z", got: iso(bangkokEndOfDay("2026-12-20")), want: "2026-12-20T16:59:59.000Z" },
  { name: "invoiceGrantData interval null (กำหนดวันเอง) → billingInterval null", got: invoiceGrantData("pro", null, NOW, bangkokEndOfDay("2026-12-20")).billingInterval, want: null },
  { name: "manualPeriodEnd ต่อท้ายรอบเดิมที่ยังไม่หมด (extend): start = รอบเดิม, end = +1 เดือนสิ้นวัน", got: [iso(manualPeriodEnd("monthly", new Date("2026-12-01T16:59:59Z"), NOW).start), iso(manualPeriodEnd("monthly", new Date("2026-12-01T16:59:59Z"), NOW).end)], want: ["2026-12-01T16:59:59.000Z", "2027-01-01T16:59:59.000Z"] },
  { name: "manualPeriodEnd รอบเดิมหมดแล้ว → เริ่มวันนี้", got: iso(manualPeriodEnd("monthly", new Date("2026-10-01T00:00:00+07:00"), NOW).start), want: iso(NOW) },
  { name: "isInvoicePlan: status manual_invoice ไม่มี Stripe → true", got: isInvoicePlan({ status: INVOICE_STATUS, stripeSubscriptionId: null }), want: true },
  { name: "isInvoicePlan: มี stripeSubscriptionId → false (Stripe ดูแลอยู่)", got: isInvoicePlan({ status: INVOICE_STATUS, stripeSubscriptionId: "sub_1" }), want: false },
  { name: "isInvoicePlan: status active → false", got: isInvoicePlan({ status: "active" }), want: false },
  { name: "isInvoiceActive: รอบยังไม่หมด → true", got: isInvoiceActive({ status: INVOICE_STATUS, billingPeriodEnd: new Date("2026-12-31T23:59:59+07:00") }, NOW), want: true },
  { name: "isInvoiceActive: หมดรอบแล้ว → false (แต่ isInvoicePlan ยัง true จน cron ลด)", got: [isInvoiceActive({ status: INVOICE_STATUS, billingPeriodEnd: new Date("2026-11-01T00:00:00+07:00") }, NOW), isInvoicePlan({ status: INVOICE_STATUS, billingPeriodEnd: new Date("2026-11-01T00:00:00+07:00") })], want: [false, true] },
  { name: "isInvoiceActive: ไม่มี billingPeriodEnd → false", got: isInvoiceActive({ status: INVOICE_STATUS, billingPeriodEnd: null }, NOW), want: false },
  { name: "invoiceGrantData ล้าง trial/lifetime/Stripe id + quota ของแพ็กเกจ", got: (() => { const d = invoiceGrantData("business", "yearly", NOW, addMonthsClamped(NOW, 12)); return [d.status, d.isBetaTester, d.trialPlan, d.stripeSubscriptionId, d.currentPeriodEnd, d.maxMembers, d.billingInterval]; })(), want: [INVOICE_STATUS, false, null, null, null, 10, "yearly"] },
  { name: "invoiceEndData → free + canceled + quota free", got: (() => { const d = invoiceEndData(); return [d.plan, d.status, d.billingPeriodEnd, d.maxMembers, d.scanCredits]; })(), want: ["free", "canceled", null, 1, 5] },
];
let fail = 0;
for (const c of CASES) {
  const ok = JSON.stringify(c.got) === JSON.stringify(c.want);
  if (!ok) fail++;
  console.log(`${ok ? "✅" : "❌"} ${c.name}${ok ? "" : `\n     got  ${JSON.stringify(c.got)}\n     want ${JSON.stringify(c.want)}`}`);
}
console.log(`\nผ่าน ${CASES.length - fail} · ไม่ผ่าน ${fail}`);
process.exit(fail ? 1 : 0);
