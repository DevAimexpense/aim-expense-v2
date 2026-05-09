// ===========================================
// POST /api/onboarding/create-company
// Create org + Google Sheet + Drive folder structure
// → mark onboarding as "done" → next: /dashboard
// ===========================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession, setSessionCookie } from "@/lib/auth/session";
import { decryptToken, encryptToken } from "@/lib/google/token-encryption";
import { refreshAccessToken } from "@/lib/google/oauth";
import { GoogleSheetsService } from "@/server/services/google-sheets.service";
import { GoogleDriveService } from "@/server/services/google-drive.service";
import { getDefaultPermissions } from "@/lib/permissions";
import { LEGAL_VERSION } from "@/lib/legal/version";

const CompanySchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    taxId: z.string().trim().regex(/^\d{13}$/, "เลขผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก"),
    branchType: z.enum(["HQ", "Branch"]).default("HQ"),
    branchNumber: z.string().trim().regex(/^\d{5}$/, "เลขสาขาต้องเป็นตัวเลข 5 หลัก").default("00000"),
    address: z.string().trim().min(1).max(500),
    phone: z.string().trim().max(30).nullable().optional(),
    acceptedTerms: z.literal(true, {
      message: "โปรดยอมรับนโยบายความเป็นส่วนตัวและข้อกำหนดการใช้งาน",
    }),
  })
  .transform((v) => ({
    ...v,
    branchNumber: v.branchType === "HQ" ? "00000" : v.branchNumber,
  }));

async function getValidAccessToken(userId: string): Promise<string> {
  const conn = await prisma.googleConnection.findUnique({
    where: { userId },
  });
  if (!conn || !conn.isActive) {
    throw new Error("ยังไม่ได้เชื่อมต่อ Google Account");
  }

  const isExpired =
    conn.tokenExpiry &&
    new Date(conn.tokenExpiry).getTime() < Date.now() + 5 * 60 * 1000;

  if (isExpired && conn.refreshToken) {
    const refreshToken = decryptToken(conn.refreshToken);
    const { accessToken, expiryDate } = await refreshAccessToken(refreshToken);
    await prisma.googleConnection.update({
      where: { userId },
      data: {
        accessToken: encryptToken(accessToken),
        tokenExpiry: expiryDate ? new Date(expiryDate) : null,
      },
    });
    return accessToken;
  }

  return decryptToken(conn.accessToken);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check that user is at "company" step
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (user.onboardingStep === "done") {
    return NextResponse.json({ error: "Already onboarded" }, { status: 400 });
  }

  // Parse input
  let input: z.infer<typeof CompanySchema>;
  try {
    const body = await req.json();
    input = CompanySchema.parse(body);
  } catch (err) {
    const message =
      err instanceof z.ZodError
        ? err.issues[0]?.message || "ข้อมูลไม่ถูกต้อง"
        : "ข้อมูลไม่ถูกต้อง";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // Check if user already owns an org
  const existingOrg = await prisma.organization.findFirst({
    where: { ownerId: session.userId },
  });
  if (existingOrg) {
    return NextResponse.json({ error: "มีบริษัทอยู่แล้ว" }, { status: 409 });
  }

  try {
    // Get valid Google access token
    const accessToken = await getValidAccessToken(session.userId);

    // Generate slug
    const baseSlug = input.name
      .toLowerCase()
      .replace(/[^\w]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 50);
    const slug = baseSlug || `org-${Date.now()}`;

    // 1. Create Google Sheets master template
    const { spreadsheetId } = await GoogleSheetsService.createMasterSheet(
      accessToken,
      input.name
    );

    // 2. Create Google Drive folders
    const driveService = new GoogleDriveService(accessToken);
    const driveFolders = await driveService.createOrgFolder(input.name);

    // 3. Seed default banks
    const sheetsService = new GoogleSheetsService(accessToken, spreadsheetId);
    await sheetsService.seedDefaultBanks();

    // 4. Transaction: create org + member + permissions + subscription + mark user done
    const org = await prisma.$transaction(async (tx) => {
      const newOrg = await tx.organization.create({
        data: {
          name: input.name,
          slug,
          ownerId: session.userId,
          taxId: input.taxId,
          branchType: input.branchType,
          branchNumber: input.branchNumber,
          address: input.address,
          phone: input.phone || null,
          googleSpreadsheetId: spreadsheetId,
          googleDriveFolderId: driveFolders.rootId,
          driveReceiptsFolderId: driveFolders.receiptsId,
          driveDocumentsFolderId: driveFolders.documentsId,
          driveReportsFolderId: driveFolders.reportsId,
        },
      });

      await tx.orgMember.create({
        data: {
          orgId: newOrg.id,
          userId: session.userId,
          role: "admin",
          status: "active",
          joinedAt: new Date(),
        },
      });

      const adminPerms = getDefaultPermissions("admin");
      await tx.userPermission.create({
        data: {
          orgId: newOrg.id,
          userId: session.userId,
          ...adminPerms,
        },
      });

      // Enrol new orgs in 30-day Pro trial automatically (no card needed).
      // After trial ends, the cron job at /api/cron/expire-trials downgrades
      // them to "free" — until then, effectivePlan() returns "pro".
      const TRIAL_DAYS = 30;
      const trialEnds = new Date();
      trialEnds.setDate(trialEnds.getDate() + TRIAL_DAYS);
      await tx.subscription.create({
        data: {
          orgId: newOrg.id,
          plan: "free",
          status: "active",
          trialPlan: "pro",
          trialStartedAt: new Date(),
          trialEndsAt: trialEnds,
          maxMembers: 5, // Pro limits while in trial
          maxEvents: 20,
          scanCredits: 300,
        },
      });

      await tx.auditLog.create({
        data: {
          orgId: newOrg.id,
          userId: session.userId,
          action: "create",
          entityType: "organization",
          entityRef: newOrg.id,
          summary: `สร้างบริษัท "${input.name}"`,
        },
      });

      // Mark user's onboarding as done + record consent
      await tx.user.update({
        where: { id: session.userId },
        data: {
          onboardingStep: "done",
          acceptedTermsAt: new Date(),
          acceptedTermsVersion: LEGAL_VERSION,
        },
      });

      // Affiliate referral capture (S26)
      // If user signed up with `?ref=CODE` (cookie set by middleware),
      // record a pending Referral row so the partner can be credited
      // later when the org converts to paid (Stripe webhook).
      const refCookie = req.cookies.get("aim_ref")?.value;
      if (refCookie && /^[A-Za-z0-9-]{4,16}$/.test(refCookie)) {
        const partner = await tx.affiliatePartner.findUnique({
          where: { code: refCookie },
        });
        // Self-referral guard — block if the partner is the same user
        if (partner && partner.isActive && partner.userId !== session.userId) {
          try {
            await tx.referral.create({
              data: {
                partnerId: partner.id,
                referredOrgId: newOrg.id,
                code: refCookie,
                status: "pending",
              },
            });
            await tx.affiliatePartner.update({
              where: { id: partner.id },
              data: { totalReferrals: { increment: 1 } },
            });
          } catch (e) {
            // Unique constraint or otherwise — log + ignore (don't fail signup)
            console.warn("[create-company] referral capture failed:", e);
          }
        }
      }

      return newOrg;
    });

    // Refresh session
    await setSessionCookie({
      userId: user.id,
      lineUserId: user.lineUserId,
      displayName: user.lineDisplayName,
      avatarUrl: user.avatarUrl,
      onboardingStep: "done",
    });

    return NextResponse.json({
      success: true,
      orgId: org.id,
      slug: org.slug,
    });
  } catch (err) {
    console.error("[create-company] error:", err);
    const message =
      err instanceof Error ? err.message : "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
