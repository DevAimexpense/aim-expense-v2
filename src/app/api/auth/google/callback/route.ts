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

    // 5. Update user email + name (if not already set from LINE)
    const user = await prisma.user.update({
      where: { id: session.userId },
      data: {
        email: userInfo.email,
        fullName: userInfo.name,
        avatarUrl: userInfo.picture || undefined,
        onboardingStep: "company", // move to next step
      },
    });

    // 6. Refresh session with new onboardingStep
    await setSessionCookie({
      userId: user.id,
      lineUserId: user.lineUserId,
      displayName: user.lineDisplayName,
      avatarUrl: user.avatarUrl,
      onboardingStep: user.onboardingStep,
    });

    return NextResponse.redirect(new URL("/onboarding/company", request.url));
  } catch (err) {
    console.error("[Google OAuth callback] error:", err);
    return NextResponse.redirect(
      new URL("/onboarding/google?error=auth_failed", request.url)
    );
  }
}
