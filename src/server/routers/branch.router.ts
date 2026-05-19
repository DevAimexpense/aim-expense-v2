// ===========================================
// Aim Expense — Branch Router (S27)
// Additional branch locations (สาขา) of a single business.
// Branches share the org's juristic person (taxId) — they do NOT consume a
// multi-business quota slot.
// ===========================================

import { z } from "zod";
import { router, orgProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";
import { TRPCError } from "@trpc/server";

const BranchInput = z.object({
  name: z.string().trim().min(1, "กรอกชื่อสาขา").max(200),
  branchNumber: z
    .string()
    .trim()
    .regex(/^\d{5}$/, "เลขสาขาต้องเป็นตัวเลข 5 หลัก"),
  address: z.string().trim().min(1, "กรอกที่อยู่สาขา").max(500),
  phone: z.string().trim().max(30).optional(),
});

function requireAdmin(role: string) {
  if (role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "เฉพาะ Admin เท่านั้นที่จัดการสาขาได้",
    });
  }
}

export const branchRouter = router({
  /** All additional branches of the active org. */
  list: orgProcedure.query(async ({ ctx }) => {
    const branches = await prisma.branch.findMany({
      where: { orgId: ctx.org.orgId },
      orderBy: { branchNumber: "asc" },
    });
    return branches.map((b) => ({
      id: b.id,
      name: b.name,
      branchNumber: b.branchNumber,
      address: b.address,
      phone: b.phone || "",
    }));
  }),

  create: orgProcedure
    .input(BranchInput)
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx.org.role);

      const clash = await prisma.branch.findUnique({
        where: {
          orgId_branchNumber: {
            orgId: ctx.org.orgId,
            branchNumber: input.branchNumber,
          },
        },
      });
      if (clash) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `มีสาขาเลข ${input.branchNumber} อยู่แล้ว`,
        });
      }

      const branch = await prisma.branch.create({
        data: {
          orgId: ctx.org.orgId,
          name: input.name,
          branchNumber: input.branchNumber,
          address: input.address,
          phone: input.phone || null,
        },
      });

      await prisma.auditLog.create({
        data: {
          orgId: ctx.org.orgId,
          userId: ctx.session.userId,
          action: "create",
          entityType: "branch",
          entityRef: branch.id,
          summary: `เพิ่มสาขา ${input.name} (${input.branchNumber})`,
        },
      });

      return { success: true, id: branch.id };
    }),

  update: orgProcedure
    .input(z.object({ id: z.string() }).merge(BranchInput.partial()))
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx.org.role);

      const existing = await prisma.branch.findFirst({
        where: { id: input.id, orgId: ctx.org.orgId },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบสาขา" });
      }

      if (input.branchNumber && input.branchNumber !== existing.branchNumber) {
        const clash = await prisma.branch.findUnique({
          where: {
            orgId_branchNumber: {
              orgId: ctx.org.orgId,
              branchNumber: input.branchNumber,
            },
          },
        });
        if (clash) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `มีสาขาเลข ${input.branchNumber} อยู่แล้ว`,
          });
        }
      }

      await prisma.branch.update({
        where: { id: input.id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.branchNumber !== undefined
            ? { branchNumber: input.branchNumber }
            : {}),
          ...(input.address !== undefined ? { address: input.address } : {}),
          ...(input.phone !== undefined ? { phone: input.phone || null } : {}),
        },
      });

      await prisma.auditLog.create({
        data: {
          orgId: ctx.org.orgId,
          userId: ctx.session.userId,
          action: "update",
          entityType: "branch",
          entityRef: input.id,
          summary: `แก้ไขสาขา ${existing.name}`,
        },
      });

      return { success: true };
    }),

  delete: orgProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx.org.role);

      const existing = await prisma.branch.findFirst({
        where: { id: input.id, orgId: ctx.org.orgId },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบสาขา" });
      }

      await prisma.branch.delete({ where: { id: input.id } });

      await prisma.auditLog.create({
        data: {
          orgId: ctx.org.orgId,
          userId: ctx.session.userId,
          action: "delete",
          entityType: "branch",
          entityRef: input.id,
          summary: `ลบสาขา ${existing.name}`,
        },
      });

      return { success: true };
    }),
});
