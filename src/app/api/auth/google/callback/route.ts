// ===========================================
// GET /api/auth/google/callback
// Step 3 of onboarding — link Google account to existing LINE user
// ===========================================

import { NextRequest, NextResponse } from "next/server";
import {
  exchangeCodeForTokens,
  getGoogleUserInfo,
} from "@/lib/google/oauth";
import { encryptToken } from "@/lib/google/token-encryption";
import { getSession, setSessionCookie } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { invalidateOrgInfoCache } from "@/server/lib/sheets-context";
import { REGRANT_STATE_PREFIX } from "@/server/lib/google-file-access";
import { handleRegrantCallback } from "@/server/lib/google-regrant-callback";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  // Must be logged in via LINE first
  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(
      new URL("/login?error=must_login_first", request.url)
    );
  }

  // ขากลับของ "ยืนยันสิทธิ์ชีตเดิม" (Google Picker แบบ redirect) — แยก flow ทั้งหมด
  // ไม่แตะ GoogleConnection / onboarding (ดู google-regrant-callback.ts)
  const state = searchParams.get("state");
  if (state?.startsWith(REGRANT_STATE_PREFIX)) {
    return handleRegrantCallback(request, session.userId, state);
  }

  if (error) {
    return NextResponse.redirect(
      new URL("/onboarding/google?error=access_denied", request.url)
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL("/onboarding/google?error=no_code", request.url)
    );
  }

  try {
    // 1. Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code);
    if (!tokens.access_token) {
      throw new Error("No access token received");
    }

    // 1b. Guard: drive.file must be granted.
    //     Under Google granular consent, drive.file shows as an OPTIONAL
    //     checkbox. If the user continues without ticking it, the token is
    //     valid but lacks drive.file → every Sheets/Drive operation (create
    //     master sheet, upload receipts) would later fail. Worse, on a
    //     reconnect we'd overwrite a previously-good connection with a
    //     scope-deficient one. Reject BEFORE persisting and ask them to
    //     reconnect and grant Drive access.
    const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";
    const grantedScopes = tokens.scope?.split(" ") ?? [];
    if (!grantedScopes.includes(DRIVE_FILE_SCOPE)) {
      const inOnboarding =
        session.onboardingStep === "line_login" ||
        session.onboardingStep === "line_oa" ||
        session.onboardingStep === "google";
      return NextResponse.redirect(
        new URL(
          `${inOnboarding ? "/onboarding/google" : "/settings/google"}?error=drive_not_granted`,
          request.url,
        ),
      );
    }

    // 2. Get user info from Google
    const userInfo = await getGoogleUserInfo(tokens.access_token);

    // 3. Encrypt tokens
    const encryptedAccessToken = encryptToken(tokens.access_token);
    const encryptedRefreshToken = tokens.refresh_token
      ? encryptToken(tokens.refresh_token)
      : null;

    // 4. Upsert GoogleConnection for the current LINE user
    await prisma.googleConnection.upsert({
      where: { userId: session.userId },
      update: {
        googleEmail: userInfo.email,
        accessToken: encryptedAccessToken,
        ...(encryptedRefreshToken && {
          refreshToken: encryptedRefreshToken,
        }),
        tokenExpiry: tokens.expiry_date
          ? new Date(tokens.expiry_date)
          : null,
        scopes: tokens.scope?.split(" ") ?? [],
        isActive: true,
      },
      create: {
        userId: session.userId,
        googleEmail: userInfo.email,
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken ?? "",
        tokenExpiry: tokens.expiry_date
          ? new Date(tokens.expiry_date)
          : null,
        scopes: tokens.scope?.split(" ") ?? [],
      },
    });

    // 4b. CO-08: ล้าง token cache (4 นาที) ของทุก org ที่ user นี้เป็นเจ้าของ
    //     ไม่งั้น instance อุ่นยังใช้ token ของบัญชี Google เดิมต่ออีกพักหลัง reconnect
    const ownedOrgs = await prisma.organization.findMany({
      where: { ownerId: session.userId },
      select: { id: true },
    });
    ownedOrgs.forEach((o) => invalidateOrgInfoCache(o.id));

    // 5. Update user email + name (if not already set from LINE)
    //    Only advance onboarding step when the user is still partway through
    //    onboarding. Reconnects from /settings/google ("done") must NOT reset
    //    the step back to "company" — that would kick the user out of the app.
    const isInOnboarding =
      session.onboardingStep === "line_login" ||
      session.onboardingStep === "line_oa" ||
      session.onboardingStep === "google";

    const user = await prisma.user.update({
      where: { id: session.userId },
      data: {
        email: userInfo.email,
        fullName: userInfo.name,
        avatarUrl: userInfo.picture || undefined,
        ...(isInOnboarding ? { onboardingStep: "company" } : {}),
      },
    });

    // 6. Refresh session with (possibly new) onboardingStep
    //    CO-05: คง activeOrgId ไว้ — ไม่งั้น reconnect Google ทำให้เว็บสลับไป org เก่าสุดเงียบ ๆ
    await setSessionCookie({
      userId: user.id,
      lineUserId: user.lineUserId,
      displayName: user.lineDisplayName,
      avatarUrl: user.avatarUrl,
      onboardingStep: user.onboardingStep,
      activeOrgId: session.activeOrgId ?? user.activeOrgId ?? null,
    });

    // 7. Redirect: in-onboarding → next step, post-onboarding → settings page
    return NextResponse.redirect(
      new URL(
        isInOnboarding
          ? "/onboarding/company"
          : "/settings/google?reconnected=1",
        request.url,
      ),
    );
  } catch (err) {
    console.error("[Google OAuth callback] error:", err);
    return NextResponse.redirect(
      new URL("/onboarding/google?error=auth_failed", request.url)
    );
  }
}
