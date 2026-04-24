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
 * Get GoogleSheetsService instance for an org
 */
export async function getSheetsService(orgId: string): Promise<GoogleSheetsService> {
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
  return new GoogleSheetsService(accessToken, org.googleSpreadsheetId);
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
