// ===========================================
// Aim Expense — Google auth error mapping (CO-08)
//
// Google ตอบ 401 / invalid_grant / "Token has been expired or revoked" =
// token ของเจ้าของบริษัทใช้ไม่ได้แล้ว (owner revoke ที่ myaccount.google.com,
// เปลี่ยนรหัสผ่าน, หรือ Google เพิกถอนเอง) — ทุก caller ต้องได้ TRPCError
// ข้อความไทยเดียวกัน ไม่ใช่ error ดิบจาก googleapis
// ===========================================

import { TRPCError } from "@trpc/server";

/** ข้อความที่ผู้ใช้ทุกคน (เว็บ + LINE) เห็นเมื่อ token เจ้าของถูกยกเลิก */
export const GOOGLE_REVOKED_MESSAGE =
  "การเชื่อมต่อ Google ของเจ้าของบริษัทถูกยกเลิก — เจ้าของต้องเชื่อมต่อ Google ใหม่ที่ ตั้งค่า › Google";

/** ยังไม่เคยเชื่อมต่อเลย (ไม่มีแถว GoogleConnection) */
export const GOOGLE_NOT_CONNECTED_MESSAGE = "ยังไม่ได้เชื่อมต่อ Google Account";

/**
 * 401 หรือข้อความ invalid_grant / invalid_token / Invalid Credentials /
 * Token has been expired or revoked — จาก googleapis (GaxiosError) หรือจาก
 * OAuth2Client.refreshAccessToken()
 *
 * หมายเหตุ: 403 "caller does not have permission" ไม่ใช่ token ถูกยกเลิก
 * (เป็นบัญชี Google คนละบัญชีกับเจ้าของชีต) — ไม่นับที่นี่
 */
export function isGoogleAuthError(err: unknown): boolean {
  if (err instanceof TRPCError) return false;
  const e = err as {
    code?: number | string;
    status?: number;
    response?: { status?: number; data?: { error?: string | { status?: string } } };
    message?: string;
  } | null;
  const status = Number(e?.response?.status ?? e?.status ?? e?.code);
  if (status === 401) return true;
  const data = e?.response?.data;
  const dataError =
    typeof data?.error === "string" ? data.error : data?.error?.status;
  if (dataError && /invalid_grant|UNAUTHENTICATED/i.test(dataError)) return true;
  return /invalid_grant|invalid_token|Invalid Credentials|Token has been expired or revoked|UNAUTHENTICATED/i.test(
    e?.message || String(err),
  );
}

// ===========================================
// แอปมองไม่เห็นชีต/โฟลเดอร์ของ org (token ยังใช้ได้)
//
// scope drive.file ผูกสิทธิ์ไฟล์กับ OAuth client ที่สร้างไฟล์ — ชีตที่สร้างก่อนย้าย
// Google client (2026-07-09) หรือไฟล์ที่ถูกย้ายไปบัญชีอื่น จะได้ 404 "Requested entity
// was not found" / 403 "The caller does not have permission" ทั้งที่ token ดีอยู่
// → เจ้าของต้องยืนยันสิทธิ์ไฟล์เดิมผ่าน Google Picker ที่ ตั้งค่า › เชื่อมต่อ Google
// (ไม่ต้องเชื่อม Google ใหม่ และข้อมูลเดิมไม่หาย)
// ===========================================

// GA-01/02: 403/404 เกิดได้ทั้ง "ชีตของ client เก่า" (แก้ด้วย Picker) และ "เชื่อม Google ผิดบัญชี"
// (แก้ด้วยเชื่อมต่อใหม่ด้วยบัญชีเดิม) หรือไฟล์ถูกลบจริง — ข้อความจึงพาไปหน้าที่วินิจฉัยได้
// โดยไม่ฟันธงว่าข้อมูลไม่หาย/ไม่ต้องเชื่อมใหม่
export const FILE_ACCESS_LOST_MESSAGE =
  "แอปเข้าถึง Google Sheet/Drive ของธุรกิจนี้ไม่ได้ — เจ้าของธุรกิจเข้า ตั้งค่า › เชื่อมต่อ Google เพื่อตรวจสอบและแก้ไข";

/**
 * 403 ที่ไม่ใช่ "แอปมองไม่เห็นไฟล์":
 * - โควตา/ความถี่
 * - GA-03: เขียนทับช่อง/แท็บที่เจ้าของล็อกไว้ (protected range) — แอปเข้าไฟล์ได้ปกติ
 */
const NOT_FILE_ACCESS_403_RE =
  /rateLimitExceeded|userRateLimitExceeded|quotaExceeded|RESOURCE_EXHAUSTED|Quota exceeded|protected cell|protected range|protected sheet/i;

/**
 * Google ตอบว่าแอปมองไม่เห็น/ไม่มีสิทธิ์ไฟล์นี้ (404 not found หรือ 403 permission)
 * — ไม่นับ 401/invalid_grant (นั่นคือ token ถูกยกเลิก ดู isGoogleAuthError)
 * และไม่นับ 403 ที่เป็นโควตา
 */
export function isFileAccessError(err: unknown): boolean {
  if (err instanceof TRPCError) return false;
  if (isGoogleAuthError(err)) return false;
  const e = err as {
    code?: number | string;
    status?: number;
    response?: { status?: number; data?: unknown };
    message?: string;
  } | null;
  const status = Number(e?.response?.status ?? e?.status ?? e?.code);
  const text = `${e?.message || String(err)} ${JSON.stringify(e?.response?.data ?? "")}`;
  if (status === 404) return true;
  if (status === 403) return !NOT_FILE_ACCESS_403_RE.test(text);
  return /Requested entity was not found|caller does not have permission|insufficientFilePermissions|appNotAuthorizedToFile/i.test(text);
}

/** TRPCError เมื่อแอปเข้าถึงชีต/โฟลเดอร์ของ org ไม่ได้ */
export function fileAccessLostError(cause?: unknown): TRPCError {
  return new TRPCError({
    code: "PRECONDITION_FAILED",
    message: FILE_ACCESS_LOST_MESSAGE,
    cause,
  });
}

/** TRPCError ที่ส่งให้ทุก caller เมื่อ token ของเจ้าของถูกยกเลิก */
export function googleRevokedError(cause?: unknown): TRPCError {
  return new TRPCError({
    code: "PRECONDITION_FAILED",
    message: GOOGLE_REVOKED_MESSAGE,
    cause,
  });
}

/** TRPCError เมื่อเจ้าของยังไม่เคยเชื่อมต่อ Google */
export function googleNotConnectedError(): TRPCError {
  return new TRPCError({
    code: "PRECONDITION_FAILED",
    message: GOOGLE_NOT_CONNECTED_MESSAGE,
  });
}

/** error นี้คือ "token ถูกยกเลิก" ที่ map แล้วหรือไม่ (ใช้ใน UI / handler ที่อยากแยกกรณี) */
export function isGoogleRevokedError(err: unknown): boolean {
  return (
    err instanceof TRPCError &&
    err.code === "PRECONDITION_FAILED" &&
    err.message === GOOGLE_REVOKED_MESSAGE
  );
}
