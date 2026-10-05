/**
 * One-off setup (S34):
 *   1) ตั้ง "บริษัทหลังบ้าน" — org ที่ admin เข้า /admin/customers ได้
 *      (Organization.settings.backoffice = true)
 *   2) ตั้งทุก org ที่ owner คนเดียวกันเป็นเจ้าของ → ฟรีตลอดชีพ แพ็กเกจสูงสุด
 *      (enterprise + isBetaTester)
 *
 * Usage (from aim-expense/, against the DB in .env):
 *   npx tsx scripts/setup-backoffice.ts                 # dry-run (แสดงอย่างเดียว)
 *   npx tsx scripts/setup-backoffice.ts --apply
 *   npx tsx scripts/setup-backoffice.ts --apply --org "ชื่อบริษัทหลังบ้าน"
 */

import { PrismaClient, type Prisma } from "@prisma/client";
import { lifetimeGrantData } from "../src/lib/comp";

const prisma = new PrismaClient();
const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const orgArg = args.indexOf("--org");
const BACKOFFICE_ORG_NAME =
  orgArg >= 0 ? args[orgArg + 1] : "บริษัท เอม เอ็กเพนส์ซิส จำกัด";

async function main() {
  const backoffice = await prisma.organization.findFirst({
    where: { name: BACKOFFICE_ORG_NAME },
    select: { id: true, name: true, ownerId: true, settings: true },
  });
  if (!backoffice) {
    console.error(`❌ ไม่พบ org ชื่อ "${BACKOFFICE_ORG_NAME}"`);
    return;
  }
  console.log(`${APPLY ? "▶️  APPLY" : "👀 DRY-RUN"}\n`);
  console.log(`🏢 บริษัทหลังบ้าน: ${backoffice.name} (${backoffice.id})`);

  if (APPLY) {
    const existing =
      backoffice.settings &&
      typeof backoffice.settings === "object" &&
      !Array.isArray(backoffice.settings)
        ? (backoffice.settings as Prisma.JsonObject)
        : {};
    await prisma.organization.update({
      where: { id: backoffice.id },
      data: { settings: { ...existing, backoffice: true } },
    });
    console.log("   ✅ settings.backoffice = true");
  }

  const owned = await prisma.organization.findMany({
    where: { ownerId: backoffice.ownerId },
    select: {
      id: true,
      name: true,
      subscription: {
        select: { plan: true, trialPlan: true, isBetaTester: true, stripeSubscriptionId: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`\n📦 org ของเจ้าของเดียวกัน ${owned.length} แห่ง → ฟรีตลอดชีพ Enterprise:`);
  const data = lifetimeGrantData("enterprise");
  for (const o of owned) {
    const s = o.subscription;
    console.log(
      `   - ${o.name}  [ตอนนี้: plan=${s?.plan ?? "-"} trial=${s?.trialPlan ?? "-"} lifetime=${s?.isBetaTester ?? false}${s?.stripeSubscriptionId ? " · ⚠️ ผูก Stripe " + s.stripeSubscriptionId : ""}]`,
    );
    if (!APPLY) continue;
    await prisma.subscription.upsert({
      where: { orgId: o.id },
      update: data,
      create: { orgId: o.id, ...data },
    });
    await prisma.auditLog.create({
      data: {
        orgId: o.id,
        userId: backoffice.ownerId,
        action: "update",
        entityType: "subscription",
        summary: "ตั้งเป็นฟรีตลอดชีพ (Enterprise) — บริษัทของทีมงาน",
      },
    });
    console.log("     ✅ enterprise · ฟรีตลอดชีพ");
  }
  if (!APPLY) console.log("\n(ยังไม่ได้เขียนอะไร — ใส่ --apply เพื่อบันทึกจริง)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
