/**
 * Set OCR scan credits for an organization's subscription
 *
 * Usage (from project root):
 *   npx tsx scripts/set-ocr-quota.ts
 *
 * This will set scanCredits to 500 for the first org found,
 * or you can modify the ORG_ID below.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Set your target — leave empty to auto-detect first org
const TARGET_ORG_ID = "";
const NEW_SCAN_CREDITS = 500;

async function main() {
  let orgId = TARGET_ORG_ID;

  if (!orgId) {
    // Find first org
    const org = await prisma.organization.findFirst({ select: { id: true, name: true } });
    if (!org) { console.error("❌ No organization found"); return; }
    orgId = org.id;
    console.log(`📌 Found org: ${org.name} (${orgId})`);
  }

  // Check if subscription exists
  let sub = await prisma.subscription.findUnique({ where: { orgId } });

  if (!sub) {
    console.log("⚠️ No subscription found — creating one...");
    sub = await prisma.subscription.create({
      data: {
        orgId,
        plan: "starter",
        status: "active",
        scanCredits: NEW_SCAN_CREDITS,
        creditsUsed: 0,
        bonusCredits: 0,
        maxMembers: 10,
        maxEvents: 50,
      },
    });
    console.log(`✅ Created subscription with ${NEW_SCAN_CREDITS} scan credits`);
  } else {
    // Update existing
    const updated = await prisma.subscription.update({
      where: { orgId },
      data: { scanCredits: NEW_SCAN_CREDITS },
    });
    console.log(`✅ Updated scan credits: ${sub.scanCredits} → ${updated.scanCredits}`);
    console.log(`   Credits used: ${updated.creditsUsed}`);
    console.log(`   Remaining: ${updated.scanCredits + updated.bonusCredits - updated.creditsUsed}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
