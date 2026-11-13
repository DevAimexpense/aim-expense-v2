// ===========================================
// ขากลับของ "ยืนยันสิทธิ์ชีตเดิม" (Google Picker แบบ redirect) — เรียกจาก
// /api/auth/google/callback เมื่อ state ขึ้นต้นด้วย "regrant:"
//
// - ไม่แตะ GoogleConnection เดิม: token ที่ได้ขากลับมีแค่ drive.file ใช้แค่เช็คว่าเลือกไฟล์
//   ด้วยบัญชีเดียวกับเจ้าของแล้วทิ้ง — สิทธิ์ไฟล์ที่ Google มอบให้ผูกกับ "แอป+ผู้ใช้" จึงใช้ได้
//   กับ refresh token เดิมของเจ้าของทันที
// - ผลลัพธ์ส่งกลับเป็น ?regrant=<code> (ไม่ใส่อีเมล/ข้อมูลส่วนตัวใน URL)
// ===========================================

import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens } from "@/lib/google/oauth";
import { invalidateOrgInfoCache } from "@/server/lib/sheets-context";
import { safeAuditLog } from "@/server/lib/audit";
import {
  REGRANT_COOKIE,
  REGRANT_STATE_PREFIX,
  checkOrgFileAccess,
  loadOrgFiles,
} from "@/server/lib/google-file-access";

export type RegrantResult =
  | "ok"
  | "partial"
  | "cancelled"
  | "wrong_account"
  | "not_owner"
  | "expired"
  | "drive_not_granted"
  | "failed";

const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";

/** อีเมลของบัญชี Google ที่ใช้เลือกไฟล์ (null ถ้าเช็คไม่ได้ — ไม่ถือว่าผิด) */
async function pickerAccountEmail(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(
      "https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)",
      { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { user?: { emailAddress?: string } };
    return data.user?.emailAddress?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

export async function handleRegrantCallback(
  request: NextRequest,
  userId: string,
  state: string,
): Promise<NextResponse> {
  const done = (result: RegrantResult) => {
    const res = NextResponse.redirect(new URL(`/settings/google?regrant=${result}`, request.url));
    res.cookies.set(REGRANT_COOKIE, "", { maxAge: 0, path: "/api/auth/google" });
    return res;
  };

  // CSRF: nonce ใน state ต้องตรงกับ cookie ที่ตั้งตอนกดปุ่ม (หมดอายุ 15 นาที)
  const [cookieNonce, orgId] = (request.cookies.get(REGRANT_COOKIE)?.value ?? "").split(".");
  const stateNonce = state.slice(REGRANT_STATE_PREFIX.length);
  if (!cookieNonce || !orgId || cookieNonce !== stateNonce) return done("expired");

  const params = request.nextUrl.searchParams;
  if (params.get("error")) return done("cancelled");
  const code = params.get("code");
  if (!code) return done("failed");

  try {
    const loaded = await loadOrgFiles(orgId);
    if (loaded.ownerId !== userId) return done("not_owner");

    // เลือกไฟล์ด้วยบัญชีอื่น → สิทธิ์ไปผูกกับบัญชีนั้น ไม่ช่วยอะไร (GA-01)
    const tokens = await exchangeCodeForTokens(code);
    // GA-10: หน้า Google อาจให้ติ๊กสิทธิ์ Drive เอง — ไม่ติ๊ก = ไม่ได้มอบสิทธิ์ไฟล์
    if (!(tokens.scope ?? "").split(" ").includes(DRIVE_FILE_SCOPE)) return done("drive_not_granted");
    if (tokens.access_token && loaded.ownerEmail) {
      const email = await pickerAccountEmail(tokens.access_token);
      if (email && email !== loaded.ownerEmail.toLowerCase()) return done("wrong_account");
    }

    invalidateOrgInfoCache(orgId);
    const { items, allOk } = await checkOrgFileAccess(loaded);
    await safeAuditLog({
      orgId,
      userId,
      action: allOk ? "google_files_regranted" : "google_files_regrant_partial",
      entityType: "organization",
      entityRef: orgId,
      summary: items.map((i) => `${i.key}:${i.status}`).join(" "),
    });
    return done(allOk ? "ok" : "partial");
  } catch (err) {
    console.error("[Google regrant callback] error:", err);
    return done("failed");
  }
}
