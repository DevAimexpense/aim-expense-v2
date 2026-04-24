// ===========================================
// Settings → Organization Info
// ===========================================

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getOrgContext } from "@/lib/auth/middleware";
import { prisma } from "@/lib/prisma";
import { OrgSettingsForm } from "./form";

export default async function OrgSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const orgCtx = await getOrgContext(session.userId);
  if (!orgCtx) redirect("/");

  const org = await prisma.organization.findUnique({
    where: { id: orgCtx.orgId },
    select: {
      id: true,
      name: true,
      taxId: true,
      branchType: true,
      branchNumber: true,
      address: true,
      phone: true,
      googleSpreadsheetId: true,
      googleDriveFolderId: true,
    },
  });
  if (!org) redirect("/");

  const isAdmin = orgCtx.role === "admin";

  return (
    <OrgSettingsForm
      org={org}
      isAdmin={isAdmin}
      sheetUrl={
        org.googleSpreadsheetId
          ? `https://docs.google.com/spreadsheets/d/${org.googleSpreadsheetId}`
          : null
      }
      driveUrl={
        org.googleDriveFolderId
          ? `https://drive.google.com/drive/folders/${org.googleDriveFolderId}`
          : null
      }
    />
  );
}
