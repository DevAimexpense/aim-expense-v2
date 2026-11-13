// UAT: ลิงก์เชื่อม Google ต้องให้ LINE เปิด browser จริง + แนบตั๋ว และ route ที่ไม่มีตั๋วต้องทำงานแบบเดิม
// รัน: npx -y tsx scripts/uat_20261113x1115/handoff-link.test.ts · ไม่แตะ DB (ไม่มีเคสที่แลกตั๋วจริง)
import { createRequire } from "node:module";
import { NextRequest } from "next/server";

// React.cache มีเฉพาะ runtime ของ Next — นอก Next ให้เป็น identity (ต้องทำก่อนโหลด session.ts)
const reactCjs = createRequire(import.meta.url)("react") as { cache?: unknown };
if (typeof reactCjs.cache !== "function") reactCjs.cache = <F,>(fn: F) => fn;

(async () => {
  const { googleLinkWithHandoff } = await import("../../src/lib/auth/handoff");
  const { redeemHandoff } = await import("../../src/lib/auth/handoff-redeem");
  const { htmlRedirect } = await import("../../src/lib/auth/session");
  const noTicket = await redeemHandoff(new NextRequest("https://aimexpense.com/api/auth/google?openExternalBrowser=1"));
  const html = await htmlRedirect("https://accounts.google.com/x?a=1&b=2").text();
  const CASES = [
    { name: "มีตั๋ว → เปิด browser จริง + แนบตั๋ว", got: googleLinkWithHandoff("/api/auth/google", "abc"), want: "/api/auth/google?openExternalBrowser=1&h=abc" },
    { name: "ออกตั๋วไม่ได้ (ยังไม่ db push) → ลิงก์เดิม ไม่มี openExternalBrowser (กัน login พัง)", got: googleLinkWithHandoff("/api/auth/google", null), want: "/api/auth/google" },
    { name: "ตั๋วมีอักขระพิเศษ → encode", got: googleLinkWithHandoff("/api/auth/google/regrant", "a+b/c="), want: "/api/auth/google/regrant?openExternalBrowser=1&h=a%2Bb%2Fc%3D" },
    { name: "route ไม่มีตั๋ว → redeemHandoff คืน null (ทำงานแบบเดิม)", got: noTicket, want: null },
    { name: "htmlRedirect escape & ใน meta refresh", got: html.includes('content="0;url=https://accounts.google.com/x?a=1&amp;b=2"'), want: true },
    { name: "htmlRedirect ใช้ JS location.replace", got: html.includes('location.replace("https://accounts.google.com/x?a=1&b=2")'), want: true },
  ];
  let fail = 0;
  for (const c of CASES) {
    const ok = JSON.stringify(c.got) === JSON.stringify(c.want);
    if (!ok) fail++;
    console.log(`${ok ? "✅" : "❌"} ${c.name}${ok ? "" : `\n     got  ${JSON.stringify(c.got)}\n     want ${JSON.stringify(c.want)}`}`);
  }
  console.log(`\nผ่าน ${CASES.length - fail} · ไม่ผ่าน ${fail}`);
  process.exit(fail ? 1 : 0);
})();
