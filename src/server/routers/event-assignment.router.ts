// ===========================================
// Aim Expense — Event Assignment Router
// มอบหมายสมาชิกเข้าโปรเจกต์ (Google Sheets)
// ===========================================

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, orgProcedure, permissionProcedure } from "../trpc";
import { getSheetsService } from "../lib/sheets-context";
import { GoogleSheetsService, SHEET_TABS } from "../services/google-sheets.service";
import { prisma } from "@/lib/prisma";

export const eventAssignmentRouter = router({
  /**
   * List assignments for a specific event
   */
  listByEvent: orgProcedure
    .input(z.object({ eventId: z.string() }))
    .query(async ({ ctx, input }) => {
      const sheets = await getSheetsService(ctx.org.orgId);
      const assignments = await sheets.getEventAssignments(input.eventId);

      // Enrich with user info from DB
      const userIds = assignments.map((a: Record<string, string>) => a.UserID).filter(Boolean);
      const users = userIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: userIds } },
            select: {
              id: true,
              lineDisplayName: true,
              linePictureUrl: true,
              fullName: true,
              email: true,
              lineEmail: true,
            },
          })
        : [];

      const userMap = new Map(users.map((u) => [u.id, u]));

      return assignments.map((a: Record<string, string>) => {
        const user = userMap.get(a.UserID);
        return {
          assignmentId: a.AssignmentID,
          eventId: a.EventID,
          userId: a.UserID,
          displayName: user?.lineDisplayName || user?.fullName || "—",
          avatarUrl: user?.linePictureUrl || null,
          email: user?.email || user?.lineEmail || "",
          assignedBy: a.AssignedBy,
          assignedAt: a.AssignedAt,
        };
      });
    }),

  /**
   * List all org members (for the "assign" dropdown)
   * Returns members not yet assigned to the given event
   */
  availableMembers: orgProcedure
    .input(z.object({ eventId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Get all active org members
      const members = await prisma.orgMember.findMany({
        where: { orgId: ctx.org.orgId, status: "active" },
        include: {
          user: {
            select: {
              id: true,
              lineDisplayName: true,
              linePictureUrl: true,
              fullName: true,
              email: true,
              lineEmail: true,
            },
          },
        },
      });

      // Get already-assigned users for this event
      const sheets = await getSheetsService(ctx.org.orgId);
      const existing = await sheets.getEventAssignments(input.eventId);
      const assignedIds = new Set(
        existing.map((a: Record<string, string>) => a.UserID)
      );

      // Return only unassigned members
      return members
        .filter((m) => !assignedIds.has(m.userId))
        .map((m) => ({
          userId: m.userId,
          displayName: m.user.lineDisplayName || m.user.fullName || "—",
          avatarUrl: m.user.linePictureUrl || null,
          email: m.user.email || m.user.lineEmail || "",
          role: m.role,
        }));
    }),

  /**
   * Assign a member to an event
   */
  assign: permissionProcedure("assignEvents")
    .input(
      z.object({
        eventId: z.string(),
        userId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const sheets = await getSheetsService(ctx.org.orgId);

      // Verify event exists
      const event = await sheets.getEventById(input.eventId);
      if (!event) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "ไม่พบโปรเจกต์",
        });
      }

      // Verify user is an active org member
      const member = await prisma.orgMember.findFirst({
        where: {
          orgId: ctx.org.orgId,
          userId: input.userId,
          status: "active",
        },
        include: {
          user: { select: { lineDisplayName: true, fullName: true } },
        },
      });
      if (!member) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "ไม่พบสมาชิกในองค์กร",
        });
      }

      // Check if already assigned
      const existing = await sheets.getEventAssignments(input.eventId);
      const alreadyAssigned = existing.some(
        (a: Record<string, string>) => a.UserID === input.userId
      );
      if (alreadyAssigned) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "สมาชิกนี้ถูกมอบหมายอยู่แล้ว",
        });
      }

      const assignmentId = GoogleSheetsService.generateId("ASG");
      const now = new Date().toISOString();

      await sheets.appendRow(SHEET_TABS.EVENT_ASSIGNMENTS, [
        assignmentId,
        input.eventId,
        input.userId,
        ctx.session.displayName,
        now,
      ]);

      // Also update the member's eventScope in DB (for permission scoping)
      const currentScope = member.eventScope as string[] || [];
      if (!currentScope.includes(input.eventId)) {
        await prisma.orgMember.update({
          where: { id: member.id },
          data: { eventScope: [...currentScope, input.eventId] },
        });
      }

      // Audit log
      const memberName = member.user.lineDisplayName || member.user.fullName || "—";
      await prisma.auditLog.create({
        data: {
          orgId: ctx.org.orgId,
          userId: ctx.session.userId,
          action: "assign",
          entityType: "event_assignment",
          entityRef: assignmentId,
          summary: `มอบหมาย "${memberName}" เข้าโปรเจกต์ "${event.EventName}"`,
        },
      });

      return { success: true, assignmentId };
    }),

  /**
   * Remove assignment (unassign member from event)
   */
  remove: permissionProcedure("assignEvents")
    .input(
      z.object({
        assignmentId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const sheets = await getSheetsService(ctx.org.orgId);

      // Get the assignment details before deleting
      const assignment = await sheets.getById(
        SHEET_TABS.EVENT_ASSIGNMENTS,
        "AssignmentID",
        input.assignmentId
      );
      if (!assignment) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "ไม่พบการมอบหมาย",
        });
      }

      // Delete from sheet
      const ok = await sheets.deleteById(
        SHEET_TABS.EVENT_ASSIGNMENTS,
        "AssignmentID",
        input.assignmentId
      );
      if (!ok) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "ลบไม่สำเร็จ",
        });
      }

      // Remove event from member's eventScope in DB
      const userId = assignment.UserID as string;
      const eventId = assignment.EventID as string;
      if (userId && eventId) {
        const member = await prisma.orgMember.findFirst({
          where: { orgId: ctx.org.orgId, userId },
        });
        if (member) {
          const currentScope = (member.eventScope as string[]) || [];
          const newScope = currentScope.filter((id) => id !== eventId);
          await prisma.orgMember.update({
            where: { id: member.id },
            data: { eventScope: newScope },
          });
        }
      }

      // Audit log
      await prisma.auditLog.create({
        data: {
          orgId: ctx.org.orgId,
          userId: ctx.session.userId,
          action: "remove_assignment",
          entityType: "event_assignment",
          entityRef: input.assignmentId,
          summary: `ถอนการมอบหมายจากโปรเจกต์`,
        },
      });

      return { success: true };
    }),

  /**
   * Batch assign multiple members to an event
   */
  batchAssign: permissionProcedure("assignEvents")
    .input(
      z.object({
        eventId: z.string(),
        userIds: z.array(z.string()).min(1, "กรุณาเลือกสมาชิกอย่างน้อย 1 คน"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const sheets = await getSheetsService(ctx.org.orgId);

      // Verify event exists
      const event = await sheets.getEventById(input.eventId);
      if (!event) {
        throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบโปรเจกต์" });
      }

      // Get existing assignments
      const existing = await sheets.getEventAssignments(input.eventId);
      const assignedIds = new Set(
        existing.map((a: Record<string, string>) => a.UserID)
      );

      // Filter out already-assigned
      const newUserIds = input.userIds.filter((id) => !assignedIds.has(id));
      if (newUserIds.length === 0) {
        return { success: true, assignedCount: 0 };
      }

      // Verify all are active members
      const members = await prisma.orgMember.findMany({
        where: {
          orgId: ctx.org.orgId,
          userId: { in: newUserIds },
          status: "active",
        },
      });
      const validIds = new Set(members.map((m) => m.userId));

      const now = new Date().toISOString();
      let assignedCount = 0;

      for (const userId of newUserIds) {
        if (!validIds.has(userId)) continue;

        const assignmentId = GoogleSheetsService.generateId("ASG");
        await sheets.appendRow(SHEET_TABS.EVENT_ASSIGNMENTS, [
          assignmentId,
          input.eventId,
          userId,
          ctx.session.displayName,
          now,
        ]);

        // Update eventScope
        const member = members.find((m) => m.userId === userId);
        if (member) {
          const currentScope = (member.eventScope as string[]) || [];
          if (!currentScope.includes(input.eventId)) {
            await prisma.orgMember.update({
              where: { id: member.id },
              data: { eventScope: [...currentScope, input.eventId] },
            });
          }
        }

        assignedCount++;
      }

      // Audit log
      await prisma.auditLog.create({
        data: {
          orgId: ctx.org.orgId,
          userId: ctx.session.userId,
          action: "batch_assign",
          entityType: "event_assignment",
          entityRef: input.eventId,
          summary: `มอบหมาย ${assignedCount} คนเข้าโปรเจกต์ "${event.EventName}"`,
        },
      });

      return { success: true, assignedCount };
    }),
});
