// UAT: ฟังก์ชันพิเศษรายคน (lib/org-settings.ts) — รัน: npx -y tsx scripts/uat_20261113x1255/special-features.test.ts · ไม่แตะ DB
import { hasSpecialFeature, readSpecialFeatureUsers } from "../../src/lib/org-settings";

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";
const CASES: { name: string; got: unknown; want: unknown }[] = [
  { name: "org เดิม (settings ว่าง) → ไม่มีใครได้", got: hasSpecialFeature({}, "receiptDateEdit", A), want: false },
  { name: "settings = null → ไม่ได้", got: hasSpecialFeature(null, "receiptDateEdit", A), want: false },
  { name: "เปิดให้ A → A ได้", got: hasSpecialFeature({ specialFeatures: { receiptDateEdit: [A] } }, "receiptDateEdit", A), want: true },
  { name: "เปิดให้ A → B ไม่ได้", got: hasSpecialFeature({ specialFeatures: { receiptDateEdit: [A] } }, "receiptDateEdit", B), want: false },
  { name: "ค่าเพี้ยน (ไม่ใช่ array) → ไม่ได้", got: hasSpecialFeature({ specialFeatures: { receiptDateEdit: A } }, "receiptDateEdit", A), want: false },
  { name: "ค่าเพี้ยน (true) → ไม่ได้", got: hasSpecialFeature({ specialFeatures: true }, "receiptDateEdit", A), want: false },
  { name: "อ่านรายชื่อ กรองค่าที่ไม่ใช่ string", got: readSpecialFeatureUsers({ specialFeatures: { receiptDateEdit: [A, 1, null, B] } }, "receiptDateEdit"), want: [A, B] },
  { name: "key อื่นใน settings ไม่กระทบ", got: hasSpecialFeature({ backoffice: true, vatRegistered: false }, "receiptDateEdit", A), want: false },
];
let fail = 0;
for (const c of CASES) {
  const ok = JSON.stringify(c.got) === JSON.stringify(c.want);
  if (!ok) fail++;
  console.log(`${ok ? "✅" : "❌"} ${c.name}${ok ? "" : `\n     got  ${JSON.stringify(c.got)}\n     want ${JSON.stringify(c.want)}`}`);
}
console.log(`\nผ่าน ${CASES.length - fail} · ไม่ผ่าน ${fail}`);
process.exit(fail ? 1 : 0);
