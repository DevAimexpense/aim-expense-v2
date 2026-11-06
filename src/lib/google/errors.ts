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
