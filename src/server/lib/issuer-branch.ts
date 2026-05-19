// ===========================================
// Issuer-branch snapshot resolver (S27)
// Documents (quotation / billing / tax-invoice) snapshot which branch of the
// company issued them, so historical docs stay stable if branches change.
// ===========================================

import { prisma } from "@/lib/prisma";

export interface IssuerBranchSnapshot {
  /** Display label — "สำนักงานใหญ่" or "สาขา 00001". */
  branchLabel: string;
  /** Address of the issuing branch. */
  address: string;
}

/**
 * Resolve the issuer-branch snapshot for a document at creation time.
 * `branchId` set → that Branch record; otherwise the org's own
 * registration (HQ / main branch).
 */
export async function resolveIssuerBranch(
  orgId: string,
  branchId?: string | null,
): Promise<IssuerBranchSnapshot> {
  if (branchId) {
    const branch = await prisma.branch.findFirst({
      where: { id: branchId, orgId },
    });
    if (branch) {
      return {
        branchLabel: `สาขา ${branch.branchNumber}`,
        address: branch.address,
      };
    }
    // branchId invalid for this org → fall back to the org default below
  }

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { branchType: true, branchNumber: true, address: true },
  });
  const isBranch = org?.branchType === "Branch" && !!org?.branchNumber;
  return {
    branchLabel: isBranch ? `สาขา ${org!.branchNumber}` : "สำนักงานใหญ่",
    address: org?.address || "",
  };
}
