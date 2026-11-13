// UAT: OCR เครดิตหมด → ข้อความไทยที่บอกให้กรอกเอง (lib/ocr/index.ts) — รัน: npx -y tsx scripts/uat_20261113x1255/ocr-credit.test.ts
import { OcrFailedError, OCR_UNAVAILABLE_MESSAGE, OCR_FAILED_MESSAGE, OCR_TIMEOUT_MESSAGE } from "../../src/lib/ocr";

// error จริงจาก log prod 2026-11-13
const AKSON_402 = 'aksonocr: Akson OCR API error: 402 {"success":false,"error":{"code":"HTTP_ERROR","message":"Http Exception"}}';
const OPENAI_429 = 'openai: GPT parse failed: 429 { "error": { "message": "You have no credits remaining.", "type": "insufficient_quota", "code": "credit_balance_exhausted" } }';
const OPENAI_RATE = 'openai: GPT parse failed: 429 { "error": { "message": "Rate limit reached", "type": "requests" } }';
const CASES = [
  { name: "Akson 402 + OpenAI เครดิตหมด → ใช้งานไม่ได้ชั่วคราว", got: new OcrFailedError([AKSON_402, OPENAI_429], false).message, want: OCR_UNAVAILABLE_MESSAGE },
  { name: "flag outOfCredit = true", got: new OcrFailedError([AKSON_402, OPENAI_429], false).outOfCredit, want: true },
  { name: "Akson 402 แต่ OpenAI แค่ rate limit → ข้อความเดิม (ลองใหม่ได้)", got: new OcrFailedError([AKSON_402, OPENAI_RATE], false).message, want: OCR_FAILED_MESSAGE },
  { name: "timeout อย่างเดียว → ข้อความ timeout เดิม", got: new OcrFailedError(["openai: TimeoutError"], true).message, want: OCR_TIMEOUT_MESSAGE },
  { name: "ไม่มี provider error → ข้อความเดิม", got: new OcrFailedError([], false).message, want: OCR_FAILED_MESSAGE },
];
let fail = 0;
for (const c of CASES) {
  const ok = JSON.stringify(c.got) === JSON.stringify(c.want);
  if (!ok) fail++;
  console.log(`${ok ? "✅" : "❌"} ${c.name}${ok ? "" : `\n     got  ${JSON.stringify(c.got)}\n     want ${JSON.stringify(c.want)}`}`);
}
console.log(`\nผ่าน ${CASES.length - fail} · ไม่ผ่าน ${fail}`);
process.exit(fail ? 1 : 0);
