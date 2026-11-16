// UAT แก้ BUGS_20261116x1839 — CRON-02: อ่านชีตไม่ได้ ≠ "ตรวจแล้ว ตรงกัน"
// รัน: npx -y tsx scripts/uat_20261116x1841/cron02.test.ts
(async () => {
  const { compareFingerprints, cronVerifyOutcome } = await import("../../src/lib/period-close");
  type T = { outputVat: number; inputVat: number; wht: number; revenue?: number; expense?: number };
  const full: T = { outputVat: 700, inputVat: 210, wht: 30, revenue: 10000, expense: 3000 };
  const snaps: Record<string, T> = { "2026-08": full, "2026-09": full, "2026-10": full };
  const months = ["2026-08", "2026-09", "2026-10"];
  const taxOnly: T = { outputVat: 700, inputVat: 210, wht: 30 };

  const allFail = compareFingerprints(snaps, {}, months);
  const allOk = compareFingerprints(snaps, { "2026-08": full, "2026-09": full, "2026-10": full }, months);
  const oneFail = compareFingerprints(snaps, { "2026-08": full, "2026-10": full }, months);
  const partial = compareFingerprints(snaps, { "2026-08": full, "2026-09": full, "2026-10": taxOnly }, months);
  const mismatchAndFail = compareFingerprints(snaps, { "2026-08": { ...full, expense: 3500 } }, months);
  const noSnap = compareFingerprints({}, {}, months);

  const CASES: { name: string; got: unknown; want: unknown }[] = [
    { name: "CRON-02: อ่านชีตไม่ได้ทุกเดือน → unchecked ครบ · ผล failed (ไม่ mark · ลองพรุ่งนี้)", got: [allFail.checked, allFail.unchecked, cronVerifyOutcome(allFail)], want: [[], months, "failed"] },
    { name: "CRON-02: ตรวจครบ ตรงทั้งหมด → ok", got: [allOk.checked.length, allOk.unchecked, cronVerifyOutcome(allOk)], want: [3, [], "ok"] },
    { name: "CRON-02: ตรวจไม่ได้ 1 เดือน → failed (ไม่ถือว่าตรง)", got: [oneFail.unchecked, cronVerifyOutcome(oneFail)], want: [["2026-09"], "failed"] },
    { name: "CRON-02: อ่านได้แค่ภาษี (รายได้/ค่าใช้จ่ายไม่ได้) → partial · failed", got: [partial.partial, cronVerifyOutcome(partial)], want: [["2026-10"], "failed"] },
    { name: "CRON-02: เจอยอดไม่ตรง (แม้บางเดือนตรวจไม่ได้) → alert ครั้งเดียว", got: [mismatchAndFail.mismatches.length, mismatchAndFail.unchecked.length, cronVerifyOutcome(mismatchAndFail)], want: [1, 2, "alert"] },
    { name: "CRON-02: ไม่มีลายนิ้วมือ = ไม่มีอะไรตรวจ (ไม่ใช่ล้มเหลว)", got: [noSnap.unchecked, cronVerifyOutcome(noSnap)], want: [[], "ok"] },
    { name: "CRON-02: ลายนิ้วมือรุ่นแรก (ไม่มีรายได้/ค่าใช้จ่าย) อ่านได้แค่ภาษี → ไม่ถือว่า partial", got: compareFingerprints({ "2026-10": taxOnly }, { "2026-10": taxOnly }, ["2026-10"]).partial, want: [] },
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
