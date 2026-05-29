// ===========================================
// Aim Expense — Google OAuth Configuration
// Scopes: Sheets, Drive (file-only), userinfo
// ===========================================

import { google } from "googleapis";

/**
 * Google OAuth2 scopes ที่ต้องการ
 * - userinfo.email + userinfo.profile → ข้อมูล user (non-sensitive)
 * - spreadsheets → อ่าน/เขียน Google Sheets (sensitive — ต้อง verification)
 * - drive.file → ไฟล์ที่ app สร้างเอง (non-sensitive)
 *
 * ⚠️ เคยลองลดเหลือ drive.file อย่างเดียวเพื่อเลี่ยง verification — แต่ใน
 * production พบว่าไม่พอ: master sheet ที่ user สร้างไว้ก่อน reconnect ใหม่
 * จะเข้าไม่ถึง ("The caller does not have permission"). เลยต้องคง spreadsheets
 * ไว้เพื่อความเข้ากันได้กับข้อมูลเดิม + ความเสถียร.
 *
 * ผลคือ Google จะแสดงหน้า "unverified app" จนกว่าจะยื่น verification (sensitive
 * tier — ไม่ต้องผ่าน security assessment เหมือน restricted แต่ต้อง justify scope).
 * Cap 100 users ระหว่างรอ.
 */
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.file",
];

/**
 * Create OAuth2 client instance
 */
export function createOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

/**
 * Generate Google OAuth consent URL
 */
export function getGoogleAuthUrl(): string {
  const client = createOAuth2Client();

  return client.generateAuthUrl({
    access_type: "offline", // ได้ refresh_token
    prompt: "consent", // force consent เพื่อให้ได้ refresh_token ทุกครั้ง
    scope: GOOGLE_SCOPES,
  });
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(code: string) {
  const client = createOAuth2Client();
  const { tokens } = await client.getToken(code);
  return tokens;
}

/**
 * Refresh access token using refresh_token
 */
export async function refreshAccessToken(
  refreshToken: string
): Promise<{ accessToken: string; expiryDate: number | null }> {
  const client = createOAuth2Client();
  client.setCredentials({ refresh_token: refreshToken });

  const { credentials } = await client.refreshAccessToken();

  return {
    accessToken: credentials.access_token!,
    expiryDate: credentials.expiry_date || null,
  };
}

/**
 * Get user info from Google
 */
export async function getGoogleUserInfo(accessToken: string) {
  const client = createOAuth2Client();
  client.setCredentials({ access_token: accessToken });

  const oauth2 = google.oauth2({ version: "v2", auth: client });
  const { data } = await oauth2.userinfo.get();

  return {
    email: data.email!,
    name: data.name || data.email!,
    picture: data.picture || null,
  };
}
