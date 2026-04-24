// ===========================================
// Aim Expense — LINE Login OAuth 2.1
// Docs: https://developers.line.biz/en/docs/line-login/
// Scopes: profile openid email
// ===========================================

import crypto from "crypto";

const LINE_AUTHORIZE_URL = "https://access.line.me/oauth2/v2.1/authorize";
const LINE_TOKEN_URL = "https://api.line.me/oauth2/v2.1/token";
const LINE_PROFILE_URL = "https://api.line.me/v2/profile";
const LINE_VERIFY_URL = "https://api.line.me/oauth2/v2.1/verify";

// Email scope: LINE Console status "Applied" = ยื่นแล้วรอ review, ยังใช้ไม่ได้
// ต้องรอเป็น "Approved" ก่อนถึงจะใช้ "email" ได้
// ถ้าใส่ทั้งที่ยังไม่ Approved → LINE return 400 ที่ consent page
export const LINE_SCOPES = ["profile", "openid"];
// TODO: เมื่อ LINE approve email permission แล้ว → เพิ่ม "email" กลับเข้ามา

export interface LineTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  idToken: string;
  scope: string;
  tokenType: string;
}

export interface LineProfile {
  userId: string;
  displayName: string;
  pictureUrl: string | null;
  statusMessage: string | null;
  email: string | null; // from id_token payload
}

interface LineIdTokenPayload {
  iss: string;
  sub: string; // LINE user ID
  aud: string;
  exp: number;
  iat: number;
  nonce?: string;
  amr?: string[];
  name?: string;
  picture?: string;
  email?: string;
}

/**
 * Generate a secure random state string for CSRF protection
 */
export function generateState(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Generate a secure random nonce for OpenID Connect
 */
export function generateNonce(): string {
  return crypto.randomBytes(16).toString("hex");
}

/**
 * Build LINE Login authorization URL
 *
 * bot_prompt=aggressive → prompt user ให้ add friend LINE OA อัตโนมัติ
 * bot_prompt=normal     → user ต้องกดยืนยันเอง
 */
export function getLineAuthUrl(params: {
  state: string;
  nonce: string;
  botPrompt?: "normal" | "aggressive";
}): string {
  const clientId = process.env.LINE_LOGIN_CHANNEL_ID;
  const redirectUri = process.env.LINE_CALLBACK_URL;

  if (!clientId) throw new Error("LINE_LOGIN_CHANNEL_ID is not set");
  if (!redirectUri) throw new Error("LINE_CALLBACK_URL is not set");

  const url = new URL(LINE_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", params.state);
  url.searchParams.set("scope", LINE_SCOPES.join(" "));
  url.searchParams.set("nonce", params.nonce);

  if (params.botPrompt) {
    url.searchParams.set("bot_prompt", params.botPrompt);
  }

  return url.toString();
}

/**
 * Exchange authorization code for LINE tokens
 */
export async function exchangeCodeForLineTokens(
  code: string
): Promise<LineTokens> {
  const clientId = process.env.LINE_LOGIN_CHANNEL_ID;
  const clientSecret = process.env.LINE_LOGIN_CHANNEL_SECRET;
  const redirectUri = process.env.LINE_CALLBACK_URL;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("LINE credentials are not configured");
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch(LINE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`LINE token exchange failed: ${res.status} ${errorText}`);
  }

  const json = await res.json();

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresIn: json.expires_in,
    idToken: json.id_token,
    scope: json.scope,
    tokenType: json.token_type,
  };
}

/**
 * Decode LINE ID Token (JWT) without verification
 * Used to extract user info (email, userId, etc.)
 * For production, consider verifying with LINE verify API
 */
export function decodeLineIdToken(idToken: string): LineIdTokenPayload {
  const parts = idToken.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid LINE id_token format");
  }

  const payloadBase64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const padded = payloadBase64 + "=".repeat((4 - (payloadBase64.length % 4)) % 4);
  const payloadJson = Buffer.from(padded, "base64").toString("utf8");

  return JSON.parse(payloadJson) as LineIdTokenPayload;
}

/**
 * Verify LINE ID Token via LINE API (recommended for production)
 * Returns payload if valid, throws error if invalid
 */
export async function verifyLineIdToken(
  idToken: string,
  nonce?: string
): Promise<LineIdTokenPayload> {
  const clientId = process.env.LINE_LOGIN_CHANNEL_ID;
  if (!clientId) throw new Error("LINE_LOGIN_CHANNEL_ID is not set");

  const body = new URLSearchParams({
    id_token: idToken,
    client_id: clientId,
  });
  if (nonce) body.set("nonce", nonce);

  const res = await fetch(LINE_VERIFY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`LINE id_token verification failed: ${errorText}`);
  }

  return (await res.json()) as LineIdTokenPayload;
}

/**
 * Get LINE user profile using access token
 */
export async function getLineProfile(
  accessToken: string
): Promise<Omit<LineProfile, "email">> {
  const res = await fetch(LINE_PROFILE_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`LINE profile fetch failed: ${errorText}`);
  }

  const json = await res.json();
  return {
    userId: json.userId,
    displayName: json.displayName,
    pictureUrl: json.pictureUrl || null,
    statusMessage: json.statusMessage || null,
  };
}

/**
 * Refresh LINE access token
 */
export async function refreshLineAccessToken(
  refreshToken: string
): Promise<LineTokens> {
  const clientId = process.env.LINE_LOGIN_CHANNEL_ID;
  const clientSecret = process.env.LINE_LOGIN_CHANNEL_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("LINE credentials are not configured");
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch(LINE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`LINE token refresh failed: ${errorText}`);
  }

  const json = await res.json();
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresIn: json.expires_in,
    idToken: json.id_token || "",
    scope: json.scope,
    tokenType: json.token_type,
  };
}
