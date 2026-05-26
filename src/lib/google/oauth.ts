// ===========================================
// Aim Expense — Google OAuth Configuration
// Scopes: Sheets, Drive (file-only), userinfo
// ===========================================

import { google } from "googleapis";

/**
 * Google OAuth2 scopes ที่ต้องการ
 * - userinfo.email + userinfo.profile → ข้อมูล user (non-sensitive)
 * - drive.file → สร้าง/อ่าน/เขียนเฉพาะไฟล์ที่ app สร้างเอง (non-sensitive)
 *   ครอบคลุม Sheets API (create/get/values/batchUpdate) บน master sheet
 *   ที่แอปสร้าง — ไม่ต้องใช้ full `spreadsheets` scope
 *
 * ❗️ ตั้งใจ "ไม่ใช้" sensitive scopes (auth/spreadsheets, drive เต็ม) เพื่อ
 * เลี่ยง Google OAuth verification — แอปจึง publish ใช้สาธารณะได้โดยไม่ต้อง
 * ผ่าน review. ถ้าเพิ่ม sensitive scope ภายหลัง → ต้องยื่น verification.
 */
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
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
