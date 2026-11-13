// UAT: ขากลับ "ยืนยันสิทธิ์ชีตเดิม" ต้องปฏิเสธเมื่อ state/cookie ไม่ตรง หรือผู้ใช้ยกเลิก — ก่อนแตะ DB/Google
// รัน: npx -y tsx scripts/uat_20261113x1115/regrant-callback-guard.test.ts
import { NextRequest } from "next/server";
import { handleRegrantCallback } from "../../src/server/lib/google-regrant-callback";
import { REGRANT_COOKIE } from "../../src/server/lib/google-file-access";

const req = (qs: string, cookie?: string) =>
  new NextRequest(`https://aimexpense.com/api/auth/google/callback?${qs}`, {
    headers: cookie ? { cookie: `${REGRANT_COOKIE}=${cookie}` } : {},
  });
const result = async (r: NextRequest, state: string) => {
  const res = await handleRegrantCallback(r, "user-1", state);
  return new URL(res.headers.get("location")!).searchParams.get("regrant");
};

(async () => {
  const CASES = [
    { name: "ไม่มี cookie (กดลิงก์จากที่อื่น/หมดอายุ) → expired", got: await result(req("state=regrant:abc&code=x"), "regrant:abc"), want: "expired" },
    { name: "nonce ใน state ไม่ตรง cookie (CSRF) → expired", got: await result(req("state=regrant:evil&code=x", "abc.org-1"), "regrant:evil"), want: "expired" },
    { name: "ผู้ใช้กดยกเลิกในหน้า Google → cancelled", got: await result(req("state=regrant:abc&error=access_denied", "abc.org-1"), "regrant:abc"), want: "cancelled" },
    { name: "ไม่มี code → failed", got: await result(req("state=regrant:abc", "abc.org-1"), "regrant:abc"), want: "failed" },
  ];
  let fail = 0;
  for (const c of CASES) {
    const ok = c.got === c.want;
    if (!ok) fail++;
    console.log(`${ok ? "✅" : "❌"} ${c.name}${ok ? "" : `\n     got  ${c.got}\n     want ${c.want}`}`);
  }
  console.log(`\nผ่าน ${CASES.length - fail} · ไม่ผ่าน ${fail}`);
  process.exit(fail ? 1 : 0);
})();
