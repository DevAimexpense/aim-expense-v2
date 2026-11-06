// UAT: LINE text-expense parser — รัน: npx -y tsx scripts/uat_<ts>/parser.test.ts
// แต่ละข้อ = [ข้อความ, ผลที่ต้องได้ (1-1), ผลที่ต้องได้ (กลุ่ม strict)] · null = ไม่บันทึก
import { parseTextExpense } from "../../src/lib/line/parse-text-expense";

const CASES: Array<[string, number | null, number | null]> = [
  // ของเดิมต้องยังผ่าน (LINE-28)
  ["ค่ากาแฟ 60 วันนี้", 60, null],
  ["จ่าย 500 ที่ร้าน", 500, null],
  ["ค่าของ 300 ใบเสร็จแนบ", 300, null],
  ["ค่าแท็กซี่ 250 ที่ไปหาลูกค้า", 250, null],
  ["ค่ารถ 300 รอบเช้า", 300, null],
  ["ค่าน้ำ 120 ขวดใหญ่", 120, null],
  ["ซื้อของ 200 อันนี้ของทีม", 200, null],
  ["ค่าแท็กซี่ 250", 250, 250],
  ["ค่ากาแฟ100บาท", 100, 100],
  ["1,234.50 บาท ค่าอะไหล่", 1234.5, 1234.5],
  ["฿1,234 ค่าส่ง", 1234, 1234],
  ["ค่าเน็ต 500บ.", 500, 500],
  // คำนับ (LINE-20)
  ["ค่าแรง 1200 2 วัน", 1200, null],
  ["ค่าห้อง 1500 3 คืน", 1500, null],
  ["ค่าอาหาร 900 3 มื้อ", 900, null],
  ["ซื้อน้ำ 120 6 ขวด", 120, null],
  ["ค่ากาแฟ 100 บาท 2 แก้ว", 100, 100],
  ["ค่าอาหาร 10 คน 1,500", 1500, 1500],
  ["ค่าแท็กซี่ 2 เที่ยว 250 บาท", 250, 250],
  // เลขที่ไม่ใช่เงิน (LINE-03 / LINE-29)
  ["0891234567 ค่าโทร 300", 300, 300],
  ["2024-11-01 ค่ากาแฟ 100", 100, 100],
  ["ประชุม 3 โมง", null, null],
  ["นัดส่งของ 15/11", null, null],
  ["ค่าเช่า 3000 วันที่ 5", 3000, null],
  ["ค่าบริการ 2500 เลขที่ 12", 2500, null],
  ["โอน 12,000,000", null, null],
  // LINE-30: "no"/"#" ต้องเป็น token แยก — ชื่อร้านละตินที่ลงท้าย no ต้องผ่าน
  ["Domino 450", 450, 450],
  ["Casino 300", 300, 300],
  ["Techno 1,200", 1200, 1200],
  ["Domino 450 บาท", 450, 450],
  ["ค่ารถ no 300", null, null],
  ["ค่ารถ No. 300", null, null],
  ["สั่ง #12 350", 350, 350],
  ["no 300", null, null],
  ["วันที่ 5", null, null],
  ["100", 100, 100], // กลุ่มตัด "เลขล้วน" ด้วย hasDescriptionWord ใน handlers ไม่ใช่ที่ parser
];

let fail = 0;
for (const [text, want, wantStrict] of CASES) {
  const got = parseTextExpense(text)?.amount ?? null;
  const gotStrict = parseTextExpense(text, { strict: true })?.amount ?? null;
  const ok = got === want && gotStrict === wantStrict;
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${JSON.stringify(text)} → ${got} / strict ${gotStrict}${ok ? "" : `  (want ${want} / ${wantStrict})`}`);
}
console.log(fail === 0 ? `\nALL ${CASES.length} PASS` : `\n${fail} FAILED`);
process.exit(fail === 0 ? 0 : 1);
