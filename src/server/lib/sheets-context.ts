// ===========================================
// Helper: Get GoogleSheetsService for current org
// Auto-refresh access token if expired
// ===========================================

import { getCache, setCache } from "@/server/lib/cache";
import { SHEET_HEADERS } from "../services/google-sheets.service";
import { prisma } from "@/lib/prisma";
import { decryptToken, encryptToken } from "@/lib/google/token-encryption";
import { refreshAccessToken } from "@/lib/google/oauth";
import { GoogleSheetsService } from "@/server/services/google-sheets.service";
import { GoogleDriveService } from "@/server/services/google-drive.service";
import { TRPCError } from "@trpc/server";
import {
  fileAccessLostError,
  googleNotConnectedError,
  googleRevokedError,
  isFileAccessError,
  isGoogleAuthError,
} from "@/lib/google/errors";

/**
 * CO-08 (revoked): Google ปฏิเสธ refresh token (invalid_grant / "Token has been
 * expired or revoked") = เจ้าของยกเลิกสิทธิ์แอปแล้ว — ปิดการเชื่อมต่อ (isActive=false)
 * และตั้ง tokenExpiry = epoch 0 ให้ request ถัดไปล้มแบบสะอาดด้วยข้อความไทยเดียวกัน
 * (ไม่ลบ refreshToken — เจ้าของกด "เชื่อมต่อใหม่" ที่ /settings/google จะเขียนทับเอง)
 * export ให้ org.router (สร้าง workspace ด้วย token ของผู้ใช้เอง) ใช้กฎเดียวกัน
 */
export async function markGoogleConnectionRevoked(ownerId: string, cause: unknown): Promise<void> {
  console.warn("[sheets-context] Google token revoked for owner", ownerId, cause);
  await prisma.googleConnection
    .updateMany({
      where: { userId: ownerId, isActive: true },
      data: { isActive: false, tokenExpiry: new Date(0) },
    })
    .catch((err) => console.error("[sheets-context] markRevoked failed", err));
  // ทุก org ที่คนนี้เป็นเจ้าของ ต้องเลิกใช้ token ที่ cache ไว้บน instance นี้ทันที
  for (const [orgId, info] of orgInfoCache) {
    if (info.ownerId === ownerId) orgInfoCache.delete(orgId);
  }
}

/**
 * ขอ access token ใหม่ด้วย refresh token ของเจ้าของ — เก็บลง DB แล้วคืนค่า
 * ถ้า Google ตอบ invalid_grant → mark revoked + โยน TRPCError ข้อความไทย
 * ถ้าล้มด้วยเหตุอื่น (network ฯลฯ) → โยน PRECONDITION_FAILED แบบเดิม (ไม่ mark)
 */
async function refreshOwnerToken(
  ownerId: string,
  encryptedRefreshToken: string,
): Promise<string> {
  try {
    const refreshToken = decryptToken(encryptedRefreshToken);
    const { accessToken, expiryDate } = await refreshAccessToken(refreshToken);
    await prisma.googleConnection.update({
      where: { userId: ownerId },
      data: {
        accessToken: encryptToken(accessToken),
        tokenExpiry: expiryDate ? new Date(expiryDate) : null,
      },
    });
    return accessToken;
  } catch (err) {
    if (isGoogleAuthError(err)) {
      await markGoogleConnectionRevoked(ownerId, err);
      throw googleRevokedError(err);
    }
    console.warn("[sheets-context] refresh failed for owner", ownerId, err);
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Token หมดอายุ กรุณาเชื่อมต่อ Google ใหม่",
      cause: err,
    });
  }
}

/**
 * Get a valid Google access token for the org owner
 * (Multi-user model: all writes go through owner's token)
 *
 * `forceRefresh` = token ที่ถืออยู่เพิ่งโดน Google ตอบ 401 → ขอใหม่เลยไม่ดู expiry
 */
export async function getOrgAccessToken(
  ownerId: string,
  opts: { forceRefresh?: boolean } = {},
): Promise<string> {
  const conn = await prisma.googleConnection.findUnique({
    where: { userId: ownerId },
  });

  if (!conn) throw googleNotConnectedError();
  // CO-08: เคยเชื่อมต่อแต่ถูกยกเลิก (revoke / disconnect) → บอกให้เจ้าของเชื่อมต่อใหม่
  if (!conn.isActive) throw googleRevokedError();

  // Refresh token if expired (with 5min buffer)
  // CO-08: tokenExpiry == null = ไม่รู้ว่าหมดเมื่อไร → ถือว่าหมดอายุ (refresh เลย) แทนการใช้ token เก่าดื้อ ๆ
  const isExpired =
    !conn.tokenExpiry ||
    new Date(conn.tokenExpiry).getTime() < Date.now() + 5 * 60 * 1000;

  if ((isExpired || opts.forceRefresh) && conn.refreshToken) {
    return refreshOwnerToken(ownerId, conn.refreshToken);
  }

  if (opts.forceRefresh) {
    // Google ตอบ 401 แต่ไม่มี refresh token ให้ลอง → ถือว่าถูกยกเลิก
    await markGoogleConnectionRevoked(ownerId, "401 without refresh token");
    throw googleRevokedError();
  }

  return decryptToken(conn.accessToken);
}

/**
 * CO-08: ครอบ service ให้ทุก method ที่ reject ด้วย Google auth error (401 /
 * invalid_grant) ทำดังนี้:
 *   1. ล้าง orgInfoCache ของ org (ไม่รอ 4 นาที)
 *   2. ลอง refresh token ของเจ้าของ 1 ครั้ง — 401 หมายถึง Google ไม่ได้ทำ
 *      request นั้นเลย จึงเรียกซ้ำบน service ใหม่ได้ปลอดภัย (ทั้งอ่านและเขียน)
 *   3. refresh ไม่ผ่าน (invalid_grant) → ปิดการเชื่อมต่อ + โยน TRPCError ข้อความไทย
 *      (ไม่ใช่ error ดิบจาก googleapis) — ใช้ร่วมกันทั้ง tRPC, route handlers และ LINE
 *      เพราะทุกทางเข้าถึง Sheets/Drive ของ org ผ่าน getSheetsService/getDriveService
 *   4. Google ตอบ 404/403 เรื่องสิทธิ์ไฟล์ (แอปมองไม่เห็นชีต/โฟลเดอร์เดิม) → โยน
 *      fileAccessLostError (ข้อความไทยบอกให้เจ้าของยืนยันสิทธิ์ชีตเดิม) แทน error ดิบ
 *      — ยกเว้น method ใน `rawFileErrors` (เช่น deleteFile ของไฟล์เก่าทีละไฟล์)
 */
export function withAuthRecovery<T extends object>(
  service: T,
  orgId: string,
  ownerId: string,
  rebuild: (accessToken: string) => T,
  rawFileErrors: ReadonlySet<PropertyKey> = new Set(),
): T {
  const mapFileError = (prop: PropertyKey, err: unknown): never => {
    if (!rawFileErrors.has(prop) && isFileAccessError(err)) {
      console.warn("[sheets-context] file access lost for org", orgId, String(prop));
      throw fileAccessLostError(err);
    }
    throw err;
  };
  return new Proxy(service, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") return value;
      const method = value as (...a: unknown[]) => unknown;
      return (...args: unknown[]) => {
        const result = method.apply(target, args);
        if (!(result instanceof Promise)) return result;
        return result.catch(async (err: unknown) => {
          if (!isGoogleAuthError(err)) return mapFileError(prop, err);
          console.warn("[sheets-context] Google auth error for org", orgId, "→ refresh + retry once");
          invalidateOrgInfoCache(orgId);
          // โยน googleRevokedError เองถ้า refresh ไม่ผ่าน
          const freshToken = await getOrgAccessToken(ownerId, { forceRefresh: true });
          const fresh = rebuild(freshToken);
          const retryMethod = Reflect.get(fresh, prop, fresh) as (...a: unknown[]) => unknown;
          try {
            return await (retryMethod.apply(fresh, args) as Promise<unknown>);
          } catch (retryErr) {
            if (!isGoogleAuthError(retryErr)) return mapFileError(prop, retryErr);
            // token ที่เพิ่ง refresh ก็ยังถูกปฏิเสธ → ถือว่าถูกยกเลิก
            await markGoogleConnectionRevoked(ownerId, retryErr);
            throw googleRevokedError(retryErr);
          }
        });
      };
    },
  });
}

/**
 * Cache org metadata + access token per orgId — avoid 2 prisma queries +
 * decryptToken on every getSheetsService() call.
 *
 * TTL = 4 minutes (well under 1-hour token lifetime). On miss → re-fetch.
 * Module-level cache: persists across requests within a warm Next.js instance.
 *
 * Saves ~50-150ms per request that touches sheets.
 */
const orgInfoCache = new Map<
  string,
  {
    accessToken: string;
    spreadsheetId: string;
    ownerId: string;
    expiresAt: number;
  }
>();
const ORG_INFO_TTL_MS = 4 * 60 * 1000;

/**
 * ล้าง token/spreadsheet ที่ cache ไว้ของ org (instance นี้) — เรียกจาก Google OAuth callback
 * หลังเก็บ token ใหม่ และจาก withAuthRecovery เมื่อ Google ปฏิเสธ token
 */
export function invalidateOrgInfoCache(orgId: string): void {
  orgInfoCache.delete(orgId);
}

/**
 * Get GoogleSheetsService instance for an org
 */
export async function getSheetsService(
  orgId: string
): Promise<GoogleSheetsService> {
  const cached = orgInfoCache.get(orgId);
  if (cached && cached.expiresAt > Date.now()) {
    const { spreadsheetId, ownerId } = cached;
    return withAuthRecovery(
      new GoogleSheetsService(cached.accessToken, spreadsheetId),
      orgId,
      ownerId,
      (token) => new GoogleSheetsService(token, spreadsheetId),
    );
  }

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { ownerId: true, googleSpreadsheetId: true },
  });

  if (!org) {
    throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบบริษัท" });
  }
  if (!org.googleSpreadsheetId) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "ยังไม่ได้สร้าง Master Sheet",
    });
  }

  const accessToken = await getOrgAccessToken(org.ownerId);
  const spreadsheetId = org.googleSpreadsheetId;
  orgInfoCache.set(orgId, {
    accessToken,
    spreadsheetId,
    ownerId: org.ownerId,
    expiresAt: Date.now() + ORG_INFO_TTL_MS,
  });
  return withAuthRecovery(
    new GoogleSheetsService(accessToken, spreadsheetId),
    orgId,
    org.ownerId,
    (token) => new GoogleSheetsService(token, spreadsheetId),
  );
}

// Module-level cache: orgId → timestamp ของการ ensureAllTabsExist ครั้งล่าสุด
// ป้องกันการเรียก spreadsheets.get + values.get N tabs ทุก request (~1-2s)
// Cold start serverless = first request ของ instance นั้นจะตรวจ tabs จริง
// Warm instance ภายใน TTL = ข้าม
const ensuredOrgs = new Map<string, number>();
const TAB_CACHE_MS = 60 * 60 * 1000; // 1 hour

/**
 * Cached wrapper รอบ sheets.ensureAllTabsExist()
 * ใช้แทน sheets.ensureAllTabsExist() โดยตรงใน routers
 *
 * Per-process module cache: orgId checked → ข้าม subsequent calls ภายใน 1 ชม.
 * (next.js server runtime: warm instance reuses module state)
 */
export async function ensureTabsCached(
  sheets: GoogleSheetsService,
  orgId: string
): Promise<void> {
  const last = ensuredOrgs.get(orgId);
  if (last && Date.now() - last < TAB_CACHE_MS) return;

  // หลาย query ใน batch เดียวกันบน instance ใหม่ → ตรวจครั้งเดียวร่วมกัน
  const pending = ensuring.get(orgId);
  if (pending) return pending;

  const run = (async () => {
    // ผลตรวจเก็บใน Redis (ข้าม instance) ผูกกับ "รุ่นของ schema" —
    // instance ใหม่/cold start ไม่ต้องยิง Google ซ้ำ ถ้า schema รุ่นนี้เคยตรวจ org นี้แล้ว
    // deploy ที่เพิ่มคอลัมน์/แท็บ = hash เปลี่ยน → ตรวจใหม่อัตโนมัติ
    const key = `sheets:schema-ok:${orgId}:${SCHEMA_VERSION}`;
    const known = await getCache<number>(key);
    if (!known) {
      await sheets.ensureAllTabsExist();
      await setCache(key, Date.now(), SCHEMA_OK_TTL_SEC);
    }
    ensuredOrgs.set(orgId, Date.now());
  })();
  ensuring.set(orgId, run);
  try {
    await run;
  } finally {
    ensuring.delete(orgId);
  }
}

const ensuring = new Map<string, Promise<void>>();
const SCHEMA_OK_TTL_SEC = 6 * 60 * 60; // 6 ชม.

/** hash ของชื่อแท็บ + header ทั้งหมด — เปลี่ยนเมื่อ schema ในโค้ดเปลี่ยน */
const SCHEMA_VERSION = (() => {
  const text = JSON.stringify(SHEET_HEADERS);
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
})();

const DRIVE_RAW_FILE_ERRORS: ReadonlySet<PropertyKey> = new Set(["deleteFile", "getFileAccess"]);

/**
 * Get GoogleDriveService instance for an org
 */
export async function getDriveService(orgId: string): Promise<{
  drive: GoogleDriveService;
  rootFolderId: string;
  receiptsFolderId: string;
  documentsFolderId: string;
  reportsFolderId: string;
  orgName: string;
}> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
  });

  if (!org) {
    throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบบริษัท" });
  }
  if (!org.googleDriveFolderId) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "ยังไม่ได้สร้าง Drive folder",
    });
  }

  const accessToken = await getOrgAccessToken(org.ownerId);
  return {
    // CO-08: Drive ก็ใช้ token เจ้าของเหมือนกัน → refresh/retry/revoke แบบเดียวกับ Sheets
    drive: withAuthRecovery(
      new GoogleDriveService(accessToken),
      orgId,
      org.ownerId,
      (token) => new GoogleDriveService(token),
      // ลบไฟล์เก่าทีละไฟล์ 404 = ไฟล์นั้นหาย/เป็นของ client เก่า ไม่ใช่โฟลเดอร์ของ org หาย
      DRIVE_RAW_FILE_ERRORS,
    ),
    rootFolderId: org.googleDriveFolderId,
    receiptsFolderId: org.driveReceiptsFolderId || org.googleDriveFolderId,
    documentsFolderId: org.driveDocumentsFolderId || org.googleDriveFolderId,
    reportsFolderId: org.driveReportsFolderId || org.googleDriveFolderId,
    orgName: org.name,
  };
}
