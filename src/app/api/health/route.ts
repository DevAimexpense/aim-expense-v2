// ===========================================
// GET /api/health — ตรวจหลัง deploy: commit ที่รันอยู่ + เขียน token Google ได้ไหม (DEV-01)
// ไม่มีข้อมูลลับ/ข้อมูลลูกค้า · googleTokenWrites ต้องเป็น true บนเว็บจริง
//   (false = Vercel ไม่ได้ส่ง VERCEL=1 → token ที่ต่ออายุจะไม่ถูกบันทึก ต้องเปิด
//    "Automatically expose System Environment Variables" ในตั้งค่าโปรเจกต์ Vercel)
// ===========================================

import { NextResponse } from "next/server";
import { canWriteGoogleTokens } from "@/lib/google/token-write-guard";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    ok: true,
    sha: (process.env.VERCEL_GIT_COMMIT_SHA || "local").slice(0, 7),
    env: process.env.VERCEL_ENV || "local",
    googleTokenWrites: canWriteGoogleTokens(),
  });
}
