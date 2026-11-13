// UAT: แยก "แอปมองไม่เห็นชีต/โฟลเดอร์" ออกจาก "token ถูกยกเลิก" และ "โควตา" (lib/google/errors.ts)
// รัน: npx -y tsx scripts/uat_20261113x1115/file-access-error.test.ts · ไม่แตะ DB / Google
import { TRPCError } from "@trpc/server";
import { isFileAccessError, isGoogleAuthError, fileAccessLostError, FILE_ACCESS_LOST_MESSAGE } from "../../src/lib/google/errors";

const gaxios = (status: number, message: string, data?: unknown) =>
  Object.assign(new Error(message), { code: status, status, response: { status, data } });

type Case = { name: string; got: unknown; want: unknown };
const CASES: Case[] = [
  { name: "Sheets 404 Requested entity was not found (ชีตของ client เก่า) → file access", got: isFileAccessError(gaxios(404, "Requested entity was not found.")), want: true },
  { name: "Sheets 403 The caller does not have permission (ภาพหน้าจอ PKK) → file access", got: isFileAccessError(gaxios(403, "The caller does not have permission")), want: true },
  { name: "Drive 404 File not found → file access", got: isFileAccessError(gaxios(404, "File not found: abc.")), want: true },
  { name: "Drive 403 appNotAuthorizedToFile → file access", got: isFileAccessError(gaxios(403, "The user has not granted the app access", { error: { errors: [{ reason: "appNotAuthorizedToFile" }] } })), want: true },
  { name: "Drive 403 userRateLimitExceeded → ไม่ใช่ (โควตา)", got: isFileAccessError(gaxios(403, "User rate limit exceeded", { error: { errors: [{ reason: "userRateLimitExceeded" }] } })), want: false },
  { name: "Sheets 429 Quota exceeded → ไม่ใช่", got: isFileAccessError(gaxios(429, "Quota exceeded for quota metric 'Read requests'")), want: false },
  { name: "401 invalid credentials → ไม่ใช่ file access (เป็น auth)", got: isFileAccessError(gaxios(401, "Invalid Credentials")), want: false },
  { name: "401 invalid credentials → isGoogleAuthError", got: isGoogleAuthError(gaxios(401, "Invalid Credentials")), want: true },
  { name: "403 caller does not have permission → ไม่ใช่ auth (ห้าม mark revoked)", got: isGoogleAuthError(gaxios(403, "The caller does not have permission")), want: false },
  { name: "400 Unable to parse range (tab หาย) → ไม่ใช่", got: isFileAccessError(gaxios(400, "Unable to parse range: Config!A:B")), want: false },
  { name: "TRPCError ที่ map แล้ว → ไม่ map ซ้ำ", got: isFileAccessError(fileAccessLostError()), want: false },
  { name: "fileAccessLostError → PRECONDITION_FAILED + ข้อความไทย", got: [fileAccessLostError() instanceof TRPCError, fileAccessLostError().code, fileAccessLostError().message === FILE_ACCESS_LOST_MESSAGE], want: [true, "PRECONDITION_FAILED", true] },
  { name: "network error ทั่วไป → ไม่ใช่", got: isFileAccessError(new Error("socket hang up")), want: false },
  // GA-03: เขียนทับช่องที่เจ้าของล็อกไว้ — แอปเข้าไฟล์ได้ ไม่ใช่ "สิทธิ์ไฟล์หาย"
  { name: "GA-03 403 protected cell → ไม่ใช่ file access", got: isFileAccessError(gaxios(403, "You are trying to edit a protected cell or object. Please contact the spreadsheet owner to remove protection if you need to edit.")), want: false },
  // GA-01/02: ข้อความต้องไม่ฟันธงว่าไม่ต้องเชื่อมใหม่ / ข้อมูลไม่หาย (กรณีเชื่อมผิดบัญชี/ไฟล์ถูกลบ)
  { name: "GA-01 ข้อความไม่บอก 'ไม่ต้องเชื่อม Google ใหม่'", got: /ไม่ต้องเชื่อม/.test(FILE_ACCESS_LOST_MESSAGE), want: false },
  { name: "GA-02 ข้อความไม่การันตี 'ข้อมูลเดิมไม่หาย'", got: /ไม่หาย/.test(FILE_ACCESS_LOST_MESSAGE), want: false },
  { name: "GA-01 ข้อความพาไป ตั้งค่า › เชื่อมต่อ Google", got: FILE_ACCESS_LOST_MESSAGE.includes("ตั้งค่า › เชื่อมต่อ Google"), want: true },
];
let fail = 0;
for (const c of CASES) {
  const ok = JSON.stringify(c.got) === JSON.stringify(c.want);
  if (!ok) fail++;
  console.log(`${ok ? "✅" : "❌"} ${c.name}${ok ? "" : `\n     got  ${JSON.stringify(c.got)}\n     want ${JSON.stringify(c.want)}`}`);
}
console.log(`\nผ่าน ${CASES.length - fail} · ไม่ผ่าน ${fail}`);
process.exit(fail ? 1 : 0);
