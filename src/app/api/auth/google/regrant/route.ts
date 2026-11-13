// ===========================================
// GET /api/auth/google/regrant
// ยืนยันสิทธิ์ชีต/โฟลเดอร์เดิมของ org ด้วย Google Picker แบบ redirect ("OnePick")
//
// ใช้ได้ทุกอุปกรณ์ (คอม/iPad/มือถือ) เพราะเปิดเต็มหน้าที่ accounts.google.com ไม่ใช้
// iframe/cookie ข้ามโดเมน — https://developers.google.com/workspace/drive/picker/guides/desktop-mobile-picker
// ขอแค่ drive.file + prompt=consent + trigger_onepick=true + file_ids ของ org นี้เท่านั้น
// กลับมาที่ callback เดิม (redirect URI ที่ลงทะเบียนไว้แล้ว) โดยแยกด้วย state "regrant:<nonce>"
// เจ้าของ org เท่านั้น
// ===========================================

import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSession, htmlRedirect } from "@/lib/auth/session";
import { redeemHandoff } from "@/lib/auth/handoff-redeem";
import { getOrgContext } from "@/lib/auth/middleware";
import {
  REGRANT_COOKIE,
  REGRANT_STATE_PREFIX,
  loadOrgFiles,
  orgFileIds,
} from "@/server/lib/google-file-access";

const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";

export async function GET(req: NextRequest) {
  // มากับตั๋วจาก browser ของ LINE → แลกเป็น session ใน Safari/Chrome ก่อน (ดู lib/auth/handoff.ts)
  const redeemed = await redeemHandoff(req);
  if (redeemed) return redeemed;

  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(new URL("/login?error=must_login_first", req.url));
  }
  const back = (code: string) =>
    NextResponse.redirect(new URL(`/settings/google?regrant=${code}`, req.url));

  const orgCtx = await getOrgContext(session.userId, session.activeOrgId);
  if (!orgCtx) return back("no_org");

  const loaded = await loadOrgFiles(orgCtx.orgId);
  if (loaded.ownerId !== session.userId) return back("not_owner");
  const fileIds = orgFileIds(loaded);
  if (fileIds.length === 0) return back("no_files");

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !redirectUri) return back("failed");

  // CSRF: nonce ใน state ต้องตรงกับ cookie (ผูก org ที่กดไว้ด้วย — กลับมาแล้วตรวจ org เดิม)
  const nonce = randomBytes(16).toString("hex");
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: DRIVE_FILE_SCOPE,
    prompt: "consent",
    trigger_onepick: "true",
    allow_multiple: "true",
    allow_folder_selection: "true",
    file_ids: fileIds.join(","),
    state: `${REGRANT_STATE_PREFIX}${nonce}`,
  });
  // ให้ Google เลือกบัญชีเจ้าของไว้ก่อน (กันเลือกผิดบัญชีบนเครื่องที่ login หลายบัญชี)
  if (loaded.ownerEmail) params.set("login_hint", loaded.ownerEmail);

  // HTML 200 แทน 3xx — cookie บน 3xx อาจไม่ติดใน browser ฝังของ LINE
  const res = htmlRedirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  res.cookies.set(REGRANT_COOKIE, `${nonce}.${orgCtx.orgId}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 15 * 60,
    path: "/api/auth/google",
  });
  return res;
}
