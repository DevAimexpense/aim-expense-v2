// UAT: ประตูหลังบ้าน /backoffice — รัน: npx -y tsx scripts/uat_<ts>/backoffice-gate.test.ts
//
// ส่วนที่ 1 (ไม่แตะ DB): กฎ hasBackofficeAdminMembership
// ส่วนที่ 2 (อ่าน DB ใน .env อย่างเดียว ไม่เขียน): backofficeProcedure ผ่าน appRouter.createCaller
//   - คนนอกทีม (user id ที่ไม่มีจริง)            → FORBIDDEN
//   - admin หลังบ้านที่ "ไม่ได้เลือกบริษัท"        → ผ่าน
//   - admin หลังบ้านที่ "เลือกบริษัทลูกค้าอยู่"     → ผ่าน (ประตูไม่ผูกกับบริษัทที่เลือก)
//   - admin ของบริษัทลูกค้า (ไม่ใช่ทีม) ถ้ามีใน DB  → FORBIDDEN
//   ข้ามส่วนที่ 2 ด้วย UAT_SKIP_DB=1
import { createRequire } from "node:module";
import { hasBackofficeAdminMembership } from "../../src/lib/auth/backoffice";
import type { TRPCContext } from "../../src/server/trpc";

// React.cache มีเฉพาะ runtime ของ Next (server components) — นอก Next ให้เป็น identity
// ต้องทำก่อน import session.ts/_app.ts (ซึ่งเรียก cache() ตอนโหลดโมดูล)
const reactCjs = createRequire(import.meta.url)("react") as { cache?: unknown };
if (typeof reactCjs.cache !== "function") reactCjs.cache = <F,>(fn: F) => fn;

type Case = { name: string; got: unknown; want: unknown };
const BO = { backoffice: true };
const CUST = { vatRegistered: true };

const PURE: Case[] = [
  { name: "admin active ของบริษัทหลังบ้าน → ผ่าน", got: hasBackofficeAdminMembership([{ role: "admin", status: "active", orgSettings: BO }]), want: true },
  { name: "admin หลังบ้าน + เป็นสมาชิกบริษัทลูกค้าด้วย → ผ่าน (ไม่ขึ้นกับบริษัทที่เลือก)", got: hasBackofficeAdminMembership([{ role: "admin", status: "active", orgSettings: CUST }, { role: "admin", status: "active", orgSettings: BO }]), want: true },
  { name: "admin ของบริษัทลูกค้าเท่านั้น → ไม่ผ่าน", got: hasBackofficeAdminMembership([{ role: "admin", status: "active", orgSettings: CUST }]), want: false },
  { name: "staff ของบริษัทหลังบ้าน → ไม่ผ่าน", got: hasBackofficeAdminMembership([{ role: "staff", status: "active", orgSettings: BO }]), want: false },
  { name: "manager ของบริษัทหลังบ้าน → ไม่ผ่าน", got: hasBackofficeAdminMembership([{ role: "manager", status: "active", orgSettings: BO }]), want: false },
  { name: "admin หลังบ้านแต่ pending → ไม่ผ่าน", got: hasBackofficeAdminMembership([{ role: "admin", status: "pending", orgSettings: BO }]), want: false },
  { name: "admin หลังบ้านแต่ removed → ไม่ผ่าน", got: hasBackofficeAdminMembership([{ role: "admin", status: "removed", orgSettings: BO }]), want: false },
  { name: "settings.backoffice = 'true' (string) → ไม่ผ่าน (ต้อง boolean)", got: hasBackofficeAdminMembership([{ role: "admin", status: "active", orgSettings: { backoffice: "true" } }]), want: false },
  { name: "settings เป็น null → ไม่ผ่าน", got: hasBackofficeAdminMembership([{ role: "admin", status: "active", orgSettings: null }]), want: false },
  { name: "ไม่มี membership → ไม่ผ่าน", got: hasBackofficeAdminMembership([]), want: false },
];

let pass = 0;
let fail = 0;
function report(c: Case) {
  const ok = JSON.stringify(c.got) === JSON.stringify(c.want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "✅" : "❌"} ${c.name}${ok ? "" : `\n     got  ${JSON.stringify(c.got)}\n     want ${JSON.stringify(c.want)}`}`);
}

async function dbCases(): Promise<Case[]> {
  const { prisma } = await import("../../src/lib/prisma");
  const { appRouter } = await import("../../src/server/routers/_app");
  const { readIsBackoffice } = await import("../../src/lib/org-settings");
  type Ctx = TRPCContext;

  const email = process.env.UAT_BACKOFFICE_EMAIL ?? "dev@aimexpense.com";
  const admin = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true, lineUserId: true, lineDisplayName: true,
      orgMembers: { where: { status: "active" }, select: { orgId: true, role: true, org: { select: { name: true, settings: true, entityType: true, googleSpreadsheetId: true, googleDriveFolderId: true } } } },
    },
  });
  if (!admin) throw new Error(`ไม่พบผู้ใช้ ${email} ใน DB`);
  const customerOrg = admin.orgMembers.find((m) => !readIsBackoffice(m.org.settings));

  const sessionFor = (userId: string): NonNullable<Ctx["session"]> => ({
    userId, lineUserId: admin.lineUserId, displayName: admin.lineDisplayName, avatarUrl: null, onboardingStep: "done", activeOrgId: null,
  });
  const orgCtx = (m: NonNullable<typeof customerOrg>): NonNullable<Ctx["org"]> => ({
    orgId: m.orgId, orgName: m.org.name, entityType: m.org.entityType, role: m.role,
    permissions: {} as NonNullable<Ctx["org"]>["permissions"], eventScope: [],
    googleSpreadsheetId: m.org.googleSpreadsheetId, googleDriveFolderId: m.org.googleDriveFolderId,
    isBackoffice: readIsBackoffice(m.org.settings), plan: "free", features: [],
  });
  const codeOf = async (fn: () => Promise<unknown>): Promise<string> => {
    try { await fn(); return "OK"; } catch (e) { return (e as { code?: string }).code ?? String(e); }
  };

  const outsider = appRouter.createCaller({ session: sessionFor("00000000-0000-4000-8000-000000000000"), org: null });
  const adminNoOrg = appRouter.createCaller({ session: sessionFor(admin.id), org: null });
  const adminOnCustomer = customerOrg
    ? appRouter.createCaller({ session: sessionFor(admin.id), org: orgCtx(customerOrg) })
    : null;

  // admin ของบริษัทลูกค้า (ไม่ใช่ทีม) — ถ้ามีใน DB
  const outsideAdmin = await prisma.orgMember.findFirst({
    where: { role: "admin", status: "active", userId: { not: admin.id } },
    select: { userId: true, org: { select: { settings: true } } },
  });
  const outsideAdminIsTeam = outsideAdmin ? readIsBackoffice(outsideAdmin.org.settings) : true;

  const cases: Case[] = [
    { name: "DB: คนนอกทีม → overview FORBIDDEN", got: await codeOf(() => outsider.backoffice.overview()), want: "FORBIDDEN" },
    { name: "DB: คนนอกทีม → accounts FORBIDDEN", got: await codeOf(() => outsider.backoffice.accounts({ filter: "all" })), want: "FORBIDDEN" },
    { name: "DB: คนนอกทีม → orgDetail FORBIDDEN (ก่อนถึง NOT_FOUND)", got: await codeOf(() => outsider.backoffice.orgDetail({ orgId: "00000000-0000-4000-8000-000000000001" })), want: "FORBIDDEN" },
    { name: "DB: คนนอกทีม → grant FORBIDDEN (ไม่เขียนอะไร)", got: await codeOf(() => outsider.backoffice.grant({ orgId: "00000000-0000-4000-8000-000000000001", kind: "months", months: 1, plan: "pro" })), want: "FORBIDDEN" },
    { name: `DB: ${email} ไม่ได้เลือกบริษัท → overview ผ่าน`, got: await codeOf(() => adminNoOrg.backoffice.overview()), want: "OK" },
    { name: `DB: ${email} → orgDetail ของ id ที่ไม่มี = NOT_FOUND (ผ่านประตูแล้ว)`, got: await codeOf(() => adminNoOrg.backoffice.orgDetail({ orgId: "00000000-0000-4000-8000-000000000001" })), want: "NOT_FOUND" },
  ];
  if (adminOnCustomer && customerOrg) {
    cases.push({ name: `DB: ${email} เลือกบริษัทลูกค้า "${customerOrg.org.name}" อยู่ → accounts ผ่าน`, got: await codeOf(() => adminOnCustomer.backoffice.accounts({ filter: "paying" })), want: "OK" });
  } else {
    console.log("⚪ ข้าม: ผู้ใช้ไม่มี membership ในบริษัทลูกค้า");
  }
  if (outsideAdmin && !outsideAdminIsTeam) {
    const c = appRouter.createCaller({ session: sessionFor(outsideAdmin.userId), org: null });
    cases.push({ name: "DB: admin ของบริษัทลูกค้า (คนอื่น) → FORBIDDEN", got: await codeOf(() => c.backoffice.overview()), want: "FORBIDDEN" });
  } else {
    console.log("⚪ ข้าม: ไม่มี admin ของบริษัทลูกค้าคนอื่นใน DB");
  }
  await prisma.$disconnect();
  return cases;
}

(async () => {
  console.log("— ส่วนที่ 1: กฎล้วน —");
  PURE.forEach(report);
  if (process.env.UAT_SKIP_DB !== "1") {
    console.log("\n— ส่วนที่ 2: ผ่าน tRPC กับ DB (อ่านอย่างเดียว) —");
    (await dbCases()).forEach(report);
  }
  console.log(`\nผ่าน ${pass} · ไม่ผ่าน ${fail}`);
  process.exit(fail ? 1 : 0);
})();
