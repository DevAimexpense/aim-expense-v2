// UAT DEV-01 — เครื่อง dev ห้ามเขียน token/สถานะการเชื่อมต่อ Google ลงฐานข้อมูลจริง
// รัน: npx -y tsx scripts/uat_20261116x1856/dev01-token-guard.test.ts
(async () => {
  const { canWriteGoogleTokens } = await import("../../src/lib/google/token-write-guard");
  const CASES: { name: string; got: unknown; want: unknown }[] = [
    { name: "DEV-01: บน Vercel (prod/preview) เขียนได้", got: canWriteGoogleTokens({ VERCEL: "1", NODE_ENV: "production" }), want: true },
    { name: "DEV-01: เครื่อง dev (next dev) เขียนไม่ได้", got: canWriteGoogleTokens({ NODE_ENV: "development" }), want: false },
    { name: "DEV-01: next start ในเครื่อง (production build) ก็เขียนไม่ได้", got: canWriteGoogleTokens({ NODE_ENV: "production" }), want: false },
    { name: "DEV-01: เครื่องที่ใช้ DB แยกและตั้ง ALLOW_GOOGLE_TOKEN_WRITES=1 เขียนได้", got: canWriteGoogleTokens({ NODE_ENV: "development", ALLOW_GOOGLE_TOKEN_WRITES: "1" }), want: true },
    { name: "DEV-01: ค่าอื่นที่ไม่ใช่ \"1\" ไม่นับ", got: [canWriteGoogleTokens({ VERCEL: "true" }), canWriteGoogleTokens({ ALLOW_GOOGLE_TOKEN_WRITES: "yes" })], want: [false, false] },
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
