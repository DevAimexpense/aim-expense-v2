// ===========================================
// DEV-01 (16/11/2569): กันเครื่อง dev เขียนสถานะ/token Google ลงฐานข้อมูลจริง
//
// เหตุ: .env.local ต่อ DB ของ prod แต่ Google OAuth client / TOKEN_ENCRYPTION_KEY ในเครื่องไม่ตรงกับเว็บจริง
//   → refresh token ในเครื่องล้ม → markGoogleConnectionRevoked ปิดการเชื่อมต่อของเจ้าของ "บนเว็บจริง"
//   (องค์กรของเจ้าของคนนั้นใช้ Sheets/LINE ไม่ได้จนกว่าจะเชื่อมต่อใหม่)
//
// กติกา (DEV-02): เขียนได้เมื่อ
//   - build แบบ production (NODE_ENV=production — เว็บจริงทุก deployment ไม่ต้องพึ่งตั้งค่า Vercel)
//   - หรือ VERCEL=1 · หรือเครื่องที่ใช้ DB แยกของตัวเองและตั้ง ALLOW_GOOGLE_TOKEN_WRITES=1 ไว้ชัดเจน
//   กันเฉพาะ `next dev` (NODE_ENV=development) = ต้นเหตุ incident · `next start` ในเครื่องจะเขียนได้ (ไม่ค่อยใช้)
// ===========================================

export function canWriteGoogleTokens(env: Record<string, string | undefined> = process.env): boolean {
  return env.ALLOW_GOOGLE_TOKEN_WRITES === "1" || env.VERCEL === "1" || env.NODE_ENV === "production";
}

export const LOCAL_GOOGLE_WRITE_BLOCKED =
  "เครื่อง dev: ต่อ Google ของเจ้าของไม่ได้ (ค่าตั้ง Google ในเครื่องไม่ตรงกับเว็บจริง) — ระบบไม่ได้แก้สถานะการเชื่อมต่อในฐานข้อมูล · ทดสอบบนเว็บจริง หรือใช้ DB แยกแล้วตั้ง ALLOW_GOOGLE_TOKEN_WRITES=1";
