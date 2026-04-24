// ===========================================
// GET /api/auth/line/callback
// Handle LINE Login OAuth callback
// → verify state → exchange code → get user profile → create/update user → set session
// ===========================================

import { NextRequest, NextResponse } from "next/server";
import {
  exchangeCodeForLineTokens,
  getLineProfile,
  verifyLineIdToken,
} from "@/lib/line/oauth";
import { encryptToken } from "@/lib/google/token-encryption";
import {
  setSessionCookie,
  getOAuthState,
  clearOAuthState,
} from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const searchParams = req.nextUrl.searchParams;

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  // User rejected consent
  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error)}`
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(`${origin}/login?error=missing_code_or_state`);
  }

  try {
    // 1. Verify state (CSRF protection)
    const storedState = await getOAuthState();
    if (
      !storedState ||
      storedState.provider !== "line" ||
      storedState.state !== state
    ) {
      return NextResponse.redirect(`${origin}/login?error=invalid_state`);
    }

    // 2. Exchange code for tokens
    const tokens = await exchangeCodeForLineTokens(code);

    // 3. Verify ID token (OpenID Connect) — gets userId + email
    const idTokenPayload = await verifyLineIdToken(
      tokens.idToken,
      storedState.nonce
    );

    const lineUserId = idTokenPayload.sub;
    const email = idTokenPayload.email || null;

    // 4. Get full profile (displayName, pictureUrl)
    const profile = await getLineProfile(tokens.accessToken);

    // 5. Upsert User + LineConnection in a transaction
    const tokenExpiry = new Date(Date.now() + tokens.expiresIn * 1000);

    const user = await prisma.$transaction(async (tx) => {
      const existingUser = await tx.user.findUnique({
        where: { lineUserId },
        include: { lineConnection: true },
      });

      const userData = {
        lineUserId,
        lineDisplayName: profile.displayName,
        linePictureUrl: profile.pictureUrl,
        lineEmail: email,
        email: email || undefined,
        fullName: profile.displayName,
        avatarUrl: profile.pictureUrl,
      };

      const upsertedUser = existingUser
        ? await tx.user.update({
            where: { id: existingUser.id },
            data: {
              lineDisplayName: profile.displayName,
              linePictureUrl: profile.pictureUrl,
              lineEmail: email,
              avatarUrl: profile.pictureUrl,
            },
          })
        : await tx.user.create({
            data: {
              ...userData,
              onboardingStep: "line_oa", // after LINE login, move to next step
            },
          });

      // Upsert LineConnection
      await tx.lineConnection.upsert({
        where: { userId: upsertedUser.id },
        create: {
          userId: upsertedUser.id,
          accessToken: encryptToken(tokens.accessToken),
          refreshToken: tokens.refreshToken
            ? encryptToken(tokens.refreshToken)
            : null,
          tokenExpiry,
          scopes: tokens.scope.split(" "),
        },
        update: {
          accessToken: encryptToken(tokens.accessToken),
          refreshToken: tokens.refreshToken
            ? encryptToken(tokens.refreshToken)
            : null,
          tokenExpiry,
          scopes: tokens.scope.split(" "),
        },
      });

      return upsertedUser;
    });

    // 6. Check existing org memberships for multi-org picker logic
    const memberships = await prisma.orgMember.findMany({
      where: { userId: user.id, status: "active" },
      select: { orgId: true },
    });
    // ถ้ามี org เดียว → auto-select, ถ้ามีหลาย → ให้ไป /select-org, ถ้าไม่มี → onboarding
    const activeOrgId = memberships.length === 1 ? memberships[0].orgId : null;

    // 7. Set session cookie
    await setSessionCookie({
      userId: user.id,
      lineUserId: user.lineUserId,
      displayName: user.lineDisplayName,
      avatarUrl: user.avatarUrl,
      onboardingStep: user.onboardingStep,
      activeOrgId,
    });

    // 8. Clear OAuth state cookie
    await clearOAuthState();

    // 9. Check for "next" cookie (e.g. /invite/{token}) — takes priority
    const cookieStore = await import("next/headers").then((m) => m.cookies());
    const nextCookie = cookieStore.get("oauth_next")?.value;
    if (nextCookie && nextCookie.startsWith("/")) {
      cookieStore.delete("oauth_next");
      return NextResponse.redirect(`${origin}${nextCookie}`);
    }

    // 10. Smart redirect based on membership state:
    //  - มี org แล้ว (ถูกเชิญ/เจ้าของ) → ข้าม onboarding google+company → ไป /select-org
    //    (ใช้ Google Drive + settings ของ owner เดิม ไม่ต้องตั้งใหม่)
    //  - ยังไม่มี org → ทำ onboarding ปกติ (line_oa → google → company)
    if (memberships.length > 0) {
      // ถ้ายังไม่ผ่าน line_oa → ให้ follow OA ก่อน (notif ต่าง ๆ)
      if (user.onboardingStep === "line_login" || user.onboardingStep === "line_oa") {
        return NextResponse.redirect(`${origin}/onboarding/line-oa`);
      }
      // มี 1 org → auto-enter dashboard | มีหลาย → picker
      return NextResponse.redirect(
        `${origin}${memberships.length === 1 ? "/dashboard" : "/select-org"}`
      );
    }

    // 11. ยังไม่มี org → onboarding ปกติ (สำหรับเจ้าของ org)
    const nextPath = getNextOnboardingPath(user.onboardingStep);
    return NextResponse.redirect(`${origin}${nextPath}`);
  } catch (err) {
    console.error("[LINE OAuth callback] error:", err);
    const message = err instanceof Error ? err.message : "unknown_error";
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(message)}`
    );
  }
}

/**
 * Get next path based on onboarding step
 */
function getNextOnboardingPath(step: string): string {
  switch (step) {
    case "line_login":
    case "line_oa":
      return "/onboarding/line-oa";
    case "google":
      return "/onboarding/google";
    case "company":
      return "/onboarding/company";
    case "done":
      return "/dashboard";
    default:
      return "/onboarding/line-oa";
  }
}
