// UAT WHT-01/02: เงื่อนไขบันทึก 50 ทวิ อัตโนมัติ (server/lib/wht-cert-pdf.ts) — รัน: npx -y tsx scripts/uat_20261113x1255/wht-autosave-rules.test.ts
// ไม่แตะ DB/Google — ทดสอบฟังก์ชันล้วน whtAutoSaveSkipReason
import { createRequire } from "node:module";
const reactCjs = createRequire(import.meta.url)("react") as { cache?: unknown };
if (typeof reactCjs.cache !== "function") reactCjs.cache = <F,>(fn: F) => fn;

(async () => {
  const { whtAutoSaveSkipReason } = await import("../../src/server/lib/wht-cert-pdf");
  const CASES = [
    { name: "LINE: pending + มี WHT (มีวันที่ใบเสร็จ) → ไม่ออก (WHT-01)", got: whtAutoSaveSkipReason({ WTHAmount: "300", Status: "pending" }), want: "not_paid" },
    { name: "อนุมัติแล้วแต่ยังไม่จ่าย → ไม่ออก", got: whtAutoSaveSkipReason({ WTHAmount: "300", Status: "approved" }), want: "not_paid" },
    { name: "ไม่อนุมัติ/ยกเลิก → ไม่ออก", got: [whtAutoSaveSkipReason({ WTHAmount: "300", Status: "rejected" }), whtAutoSaveSkipReason({ WTHAmount: "300", Status: "cancelled" })], want: ["not_paid", "not_paid"] },
    { name: "จ่ายแล้ว (paid) → ออก", got: whtAutoSaveSkipReason({ WTHAmount: "300", Status: "paid" }), want: null },
    { name: "เคลียร์แล้ว (cleared) → ออก", got: whtAutoSaveSkipReason({ WTHAmount: "300", Status: "cleared" }), want: null },
    { name: "ไม่มี WHT → ข้าม", got: whtAutoSaveSkipReason({ WTHAmount: "0", Status: "paid" }), want: "no_wht" },
    { name: "จ่ายแล้วและมี 50 ทวิ แล้ว → ใช้ไฟล์เดิม", got: whtAutoSaveSkipReason({ WTHAmount: "300", Status: "paid", GeneratedDocUrl: "https://drive/x", GeneratedDocType: "wht-cert" }), want: "exists" },
    { name: "มีใบรับรองแทนใบเสร็จในช่องเดียวกัน → other_doc (WHT-02)", got: whtAutoSaveSkipReason({ WTHAmount: "300", Status: "paid", GeneratedDocUrl: "https://drive/y", GeneratedDocType: "substitute-receipt" }), want: "other_doc" },
  ];
  let fail = 0;
  for (const c of CASES) {
    const ok = JSON.stringify(c.got) === JSON.stringify(c.want);
    if (!ok) fail++;
    console.log(`${ok ? "✅" : "❌"} ${c.name}${ok ? "" : `\n     got  ${JSON.stringify(c.got)}\n     want ${JSON.stringify(c.want)}`}`);
  }
  console.log(`\nผ่าน ${CASES.length - fail} · ไม่ผ่าน ${fail}`);
  process.exit(fail ? 1 : 0);
})();
