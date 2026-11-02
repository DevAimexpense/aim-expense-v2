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

/**
 * Get a valid Google access token for the org owner
 * (Multi-user model: all writes go through owner's token)
 */
export async function getOrgAccessToken(ownerId: string): Promise<string> {
  const conn = await prisma.googleConnection.findUnique({
    where: { userId: ownerId },
  });

  if (!conn || !conn.isActive) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "ยังไม่ได้เชื่อมต่อ Google Account",
    });
  }

  // Refresh token if expired (with 5min buffer)
  // CO-08: tokenExpiry == null = ไม่รู้ว่าหมดเมื่อไร → ถือว่าหมดอายุ (refresh เลย) แทนการใช้ token เก่าดื้อ ๆ
  const isExpired =
    !conn.tokenExpiry ||
    new Date(conn.tokenExpiry).getTime() < Date.now() + 5 * 60 * 1000;

  if (isExpired && conn.refreshToken) {
    try {
      const refreshToken = decryptToken(conn.refreshToken);
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
      console.warn("[sheets-context] refresh failed for owner", ownerId, err);
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Token หมดอายุ กรุณาเชื่อมต่อ Google ใหม่",
      });
    }
  }

  return decryptToken(conn.accessToken);
}

/**
 * CO-08: Google ตอบ 401 / invalid_grant / invalid token = token ที่ถือไว้ใช้ไม่ได้แล้ว
 * (owner revoke หรือ reconnect บัญชีอื่น) — ต้องทิ้งค่าที่ cache ไว้ ไม่ใช่รอ 4 นาที
 */
function isGoogleAuthError(err: unknown): boolean {
  const e = err as {
    code?: number | string;
    status?: number;
    response?: { status?: number };
    message?: string;
  } | null;
  const status = Number(e?.response?.status ?? e?.status ?? e?.code);
  if (status === 401) return true;
  return /invalid_grant|invalid_token|Invalid Credentials|Token has been expired or revoked/i.test(
    e?.message || String(err),
  );
}

/**
 * ครอบ service ให้ทุก method ที่ reject ด้วย auth error ล้าง orgInfoCache ของ org นั้น
 * ก่อนโยน error ต่อ — request ถัดไปจะอ่าน token ใหม่จาก DB (หรือ refresh) แทนค่าเก่า
 */
function withAuthErrorEviction<T extends object>(service: T, orgId: string): T {
  return new Proxy(service, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        const result = (value as (...a: unknown[]) => unknown).apply(target, args);
        if (result instanceof Promise) {
          return result.catch((err: unknown) => {
            if (isGoogleAuthError(err)) {
              console.warn("[sheets-context] Google auth error → evict token cache for org", orgId);
              invalidateOrgInfoCache(orgId);
            }
            throw err;
          });
        }
        return result;
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
    expiresAt: number;
  }
>();
const ORG_INFO_TTL_MS = 4 * 60 * 1000;

/**
 * ล้าง token/spreadsheet ที่ cache ไว้ของ org (instance นี้) — เรียกจาก Google OAuth callback
 * หลังเก็บ token ใหม่ และจาก withAuthErrorEviction เมื่อ Google ปฏิเสธ token
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
    return withAuthErrorEviction(
      new GoogleSheetsService(cached.accessToken, cached.spreadsheetId),
      orgId,
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
  orgInfoCache.set(orgId, {
    accessToken,
    spreadsheetId: org.googleSpreadsheetId,
    expiresAt: Date.now() + ORG_INFO_TTL_MS,
  });
  return withAuthErrorEviction(
    new GoogleSheetsService(accessToken, org.googleSpreadsheetId),
    orgId,
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
    drive: new GoogleDriveService(accessToken),
    rootFolderId: org.googleDriveFolderId,
    receiptsFolderId: org.driveReceiptsFolderId || org.googleDriveFolderId,
    documentsFolderId: org.driveDocumentsFolderId || org.googleDriveFolderId,
    reportsFolderId: org.driveReportsFolderId || org.googleDriveFolderId,
    orgName: org.name,
  };
}
