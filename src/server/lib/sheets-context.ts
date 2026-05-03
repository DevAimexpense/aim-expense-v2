// ===========================================
// Helper: Get GoogleSheetsService for current org
// Auto-refresh access token if expired
// ===========================================

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
  const isExpired =
    conn.tokenExpiry &&
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
    } catch {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Token หมดอายุ กรุณาเชื่อมต่อ Google ใหม่",
      });
    }
  }

  return decryptToken(conn.accessToken);
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
    return new GoogleSheetsService(cached.accessToken, cached.spreadsheetId);
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
  return new GoogleSheetsService(accessToken, org.googleSpreadsheetId);
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
  await sheets.ensureAllTabsExist();
  ensuredOrgs.set(orgId, Date.now());
}

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
