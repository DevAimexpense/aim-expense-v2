// ===========================================
// Aim Expense — JWT Session Management
// Cookie-based JWT auth (ไม่ใช้ NextAuth เพื่อความเรียบง่าย)
// ใช้ jose (Edge-compatible) สำหรับ sign/verify JWT
// ===========================================

import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { cache } from "react";

const SESSION_COOKIE = "aim-session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

const OAUTH_STATE_COOKIE = "aim-oauth-state";
const OAUTH_STATE_MAX_AGE = 60 * 10; // 10 minutes

/**
 * Session payload ใน JWT
 * Primary identity = LINE user ID
 */
export interface SessionPayload {
  userId: string;
  lineUserId: string;
  displayName: string;
  avatarUrl: string | null;
  onboardingStep: string; // line_login | line_oa | google | company | done
  // Multi-org support: user อาจมีหลาย org → ต้องเลือกว่า active อันไหน
  // null = ยังไม่ได้เลือก (ไปหน้า /select-org)
  activeOrgId?: string | null;
}

/**
 * OAuth state ที่เก็บใน cookie ระหว่าง OAuth flow
 */
export interface OAuthStateData {
  state: string;
  nonce: string;
  provider: "line" | "google";
  returnTo?: string;
}

/**
 * Get JWT secret as Uint8Array (required by jose)
 */
function getJwtSecret(): Uint8Array {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("NEXTAUTH_SECRET is not set");
  }
  return new TextEncoder().encode(secret);
}

/**
 * Create a signed JWT token
 */
export async function createSessionToken(
  payload: SessionPayload
): Promise<string> {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(getJwtSecret());

  return token;
}

/**
 * Verify and decode JWT token
 */
export async function verifySessionToken(
  token: string
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

/**
 * Set session cookie after login
 */
export async function setSessionCookie(payload: SessionPayload): Promise<void> {
  const token = await createSessionToken(payload);
  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });
}

/**
 * ตั้ง session cookie ลงบน response ที่จะส่งกลับโดยตรง (ใช้คู่กับ htmlRedirect)
 * — ใช้ตอนแลกตั๋ว handoff เป็น session ใน Safari/Chrome (ดู lib/auth/handoff.ts)
 */
export async function setSessionCookieOnResponse(
  res: NextResponse,
  payload: SessionPayload,
): Promise<void> {
  const token = await createSessionToken(payload);
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });
}

/**
 * พาไปต่อด้วยหน้า HTML 200 + JS แทน 3xx — cookie ที่ set บน 3xx อาจไม่ติดใน
 * browser ฝังของ LINE (iOS WKWebView) · พอร์ตจาก aim-hr
 */
export function htmlRedirect(to: string): NextResponse {
  const jsUrl = JSON.stringify(to);
  const attr = to.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0;url=${attr}"><title>กำลังไปต่อ…</title></head><body style="font-family:system-ui,sans-serif;text-align:center;padding:2.5rem;color:#475569">กำลังไปต่อ…<script>location.replace(${jsUrl})</script><noscript><a href="${attr}">ดำเนินการต่อ</a></noscript></body></html>`;
  return new NextResponse(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

/**
 * Get current session from cookie
 *
 * Wrapped in React.cache() — Next.js App Router runs both layout.tsx and
 * page.tsx within the same request. Without cache, getSession() runs twice
 * (cookie decrypt + JWT verify each time = ~10-20ms each). cache() ensures
 * the result is reused within a single request.
 */
export const getSession = cache(
  async (): Promise<SessionPayload | null> => {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;

    if (!token) return null;
    return verifySessionToken(token);
  }
);

/**
 * Clear session cookie (logout)
 */
export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

// ===== OAuth State Management =====

/**
 * Store OAuth state in short-lived cookie for CSRF protection
 */
export async function setOAuthState(data: OAuthStateData): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(OAUTH_STATE_COOKIE, JSON.stringify(data), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: OAUTH_STATE_MAX_AGE,
    path: "/",
  });
}

/**
 * Read OAuth state cookie (used during OAuth callback)
 */
export async function getOAuthState(): Promise<OAuthStateData | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(OAUTH_STATE_COOKIE)?.value;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as OAuthStateData;
  } catch {
    return null;
  }
}

/**
 * Clear OAuth state cookie after use
 */
export async function clearOAuthState(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(OAUTH_STATE_COOKIE);
}
