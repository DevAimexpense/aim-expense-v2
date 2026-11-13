// UAT GA-07: proxy withAuthRecovery แปลง 403/404 สิทธิ์ไฟล์เป็นข้อความไทย (sheets-context.ts)
// รัน: npx -y tsx scripts/uat_20261113x1115/auth-recovery-proxy.test.ts
// ไม่แตะ DB / Google — ใช้ service ปลอม และไม่มีเคส 401 (เคสนั้นจะไป refresh token ใน DB)
import { withAuthRecovery } from "../../src/server/lib/sheets-context";
import { FILE_ACCESS_LOST_MESSAGE } from "../../src/lib/google/errors";

const gaxios = (status: number, message: string) =>
  Object.assign(new Error(message), { code: status, status, response: { status } });

class FakeService {
  constructor(private err: unknown) {}
  async read(): Promise<string> { throw this.err; }
  async deleteFile(): Promise<void> { throw this.err; }
  async ok(): Promise<string> { return "ok"; }
  sync(): number { return 42; }
}
const wrap = (err: unknown, raw: string[] = []) =>
  withAuthRecovery(new FakeService(err), "org-test", "owner-test", () => new FakeService(err), new Set(raw));
const msgOf = async (p: Promise<unknown>) => p.then(() => "resolved", (e: Error) => e.message);

(async () => {
  const CASES: { name: string; got: unknown; want: unknown }[] = [
    { name: "Sheets 404 → ข้อความไทย", got: await msgOf(wrap(gaxios(404, "Requested entity was not found.")).read()), want: FILE_ACCESS_LOST_MESSAGE },
    { name: "403 caller does not have permission → ข้อความไทย", got: await msgOf(wrap(gaxios(403, "The caller does not have permission")).read()), want: FILE_ACCESS_LOST_MESSAGE },
    { name: "deleteFile (raw list) 404 → error ดิบ ไม่แปลง", got: await msgOf(wrap(gaxios(404, "File not found: x"), ["deleteFile"]).deleteFile()), want: "File not found: x" },
    { name: "403 protected cell → error ดิบ (GA-03)", got: await msgOf(wrap(gaxios(403, "You are trying to edit a protected cell or object.")).read()), want: "You are trying to edit a protected cell or object." },
    { name: "429 quota → error ดิบ", got: await msgOf(wrap(gaxios(429, "Quota exceeded")).read()), want: "Quota exceeded" },
    { name: "method ปกติไม่กระทบ", got: await wrap(new Error("x")).ok(), want: "ok" },
    { name: "method sync ไม่กระทบ", got: wrap(new Error("x")).sync(), want: 42 },
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
