// ===========================================
// Aim Expense — Google OAuth Configuration
// Scopes: Sheets, Drive (file-only), userinfo
// ===========================================

import { google } from "googleapis";

/**
 * Google OAuth2 scopes ที่ต้องการ
 * - userinfo.email + userinfo.profile → ข้อมูล user (non-sensitive)
 * - drive.file → ไฟล์ที่ app สร้างเอง (non-sensitive) — ใช้ได้ทั้ง Sheets API
 *   และ Drive API สำหรับ master sheet / folders / receipts ที่แอปสร้างเอง
 *
 * 🔄 MIGRATION (2026-06, S31): ลด scope `spreadsheets` (sensitive) → `drive.file`
 * ตามที่ Google verification บังคับ. drive.file เป็น non-sensitive → ไม่ต้องผ่าน
 * verification (ไม่มี unverified-app warning / 100-user cap). เทสต์ครบใน test
 * project แล้ว: spreadsheets.create + values.* + batchUpdate + Drive upload/list
 * ใช้ได้ครบกับไฟล์ที่แอปสร้างเอง.
 *
 * ⚠️ ข้อจำกัด: ชีตที่ "แอปไม่ได้สร้าง" (เช่นชีตเก่าก่อนมี drive.file grant) จะเข้า
 * ไม่ได้ — Sheets API คืน 404 "Requested entity was not found" (drive.file ทำให้
 * แอปมองไม่เห็นไฟล์). ตอน migrate prod ไม่มี data ลูกค้าจริง (มีแต่ demo) จึงไม่
 * ต้องทำ Google Picker re-grant. ถ้าอนาคตต้องกู้ชีตเก่าที่มี data → ใช้ Picker
 * (setFileIds) ให้ user ยืนยันชีตเดิมครั้งเดียว.
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
