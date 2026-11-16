// UAT WHT-03 (50 ทวิ ใน Drive ตามข้อมูลล่าสุด) + DOC-04 (คิวใบเสร็จหยุดเมื่อเข้า Drive ไม่ได้)
// รัน: npx -y tsx scripts/uat_20261113x1255/wht03-doc04.test.ts · ไม่แตะ DB/Google
import { createRequire } from "node:module";
const reactCjs = createRequire(import.meta.url)("react") as { cache?: unknown };
if (typeof reactCjs.cache !== "function") reactCjs.cache = <F,>(fn: F) => fn;

(async () => {
  const { whtAutoSaveSkipReason, whtCertSignature } = await import("../../src/server/lib/wht-cert-pdf");
  const { isDriveAccessProblem } = await import("../../src/lib/utils/auto-gen-doc");
  const { FILE_ACCESS_LOST_MESSAGE, GOOGLE_REVOKED_MESSAGE } = await import("../../src/lib/google/errors");

  const base = {
    WTHAmount: "300", PctWTH: "3", TTLAmount: "10000", PayeeID: "PAY-1",
    PaymentDate: "2026-12-05", ReceiptDate: "2026-11-25", Description: "ค่าจ้างออกแบบ",
    Status: "paid", GeneratedDocUrl: "https://drive.google.com/file/d/abc1234567/view", GeneratedDocType: "wht-cert",
  };
  const saved = { ...base, WhtCertFor: whtCertSignature(base) };
  const CASES = [
    { name: "WHT-03: ไฟล์สร้างจากข้อมูลชุดนี้แล้ว → ใช้ไฟล์เดิม", got: whtAutoSaveSkipReason(saved), want: "exists" },
    { name: "WHT-03: แก้ยอดหัก 300 → 500 → เขียนทับ (null)", got: whtAutoSaveSkipReason({ ...saved, WTHAmount: "500" }), want: null },
    { name: "WHT-03: แก้วันที่จ่าย → เขียนทับ", got: whtAutoSaveSkipReason({ ...saved, PaymentDate: "2026-12-06" }), want: null },
    { name: "WHT-03: เปลี่ยนผู้รับเงิน → เขียนทับ", got: whtAutoSaveSkipReason({ ...saved, PayeeID: "PAY-2" }), want: null },
    { name: "WHT-03: แถวเก่าไม่มี WhtCertFor → สร้างใหม่ครั้งเดียว", got: whtAutoSaveSkipReason(base), want: null },
    { name: "WHT-03: ช่องว่าง/เว้นวรรคไม่ทำให้ถือว่าเปลี่ยน", got: whtCertSignature({ ...base, Description: " ค่าจ้างออกแบบ " }) === whtCertSignature(base), want: true },
    { name: "WHT-01 ยังคง: pending → ไม่ออก แม้ข้อมูลเปลี่ยน", got: whtAutoSaveSkipReason({ ...saved, Status: "pending", WTHAmount: "500" }), want: "not_paid" },
    { name: "DOC-04: เข้า Sheet/Drive ไม่ได้ → หยุดคิว", got: isDriveAccessProblem(FILE_ACCESS_LOST_MESSAGE), want: true },
    { name: "DOC-04: การเชื่อม Google ถูกยกเลิก → หยุดคิว", got: isDriveAccessProblem(GOOGLE_REVOKED_MESSAGE), want: true },
    { name: "DOC-04: timeout / อื่น ๆ → ข้ามใบนี้ ทำใบถัดไป", got: [isDriveAccessProblem("timeout"), isDriveAccessProblem(undefined)], want: [false, false] },
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
