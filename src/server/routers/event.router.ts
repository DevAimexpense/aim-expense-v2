// ===========================================
// Aim Expense — Event Router (Full implementation)
// CRUD Events ใน Google Sheets ของ org owner
// ===========================================

import { z } from "zod";
import { router, orgProcedure, permissionProcedure } from "../trpc";
import { getSheetsService } from "../lib/sheets-context";
import { GoogleSheetsService, SHEET_TABS } from "../services/google-sheets.service";
import { prisma } from "@/lib/prisma";

const EventInputSchema = z.object({
  eventName: z.string().min(1, "กรุณากรอกชื่อโปรเจกต์").max(200),
  budget: z.number().min(0, "งบประมาณต้องไม่ติดลบ"),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  description: z.string().max(1000).optional(),
});

export const eventRouter = router({
  /**
   * List all events for current org
   */
  list: orgProcedure.query(async ({ ctx }) => {
    const sheets = await getSheetsService(ctx.org.orgId);
    const events = await sheets.getEvents();
    const payments = await sheets.getPayments();

    // Calculate spent per event
    return events.map((event) => {
      const eventPayments = payments.filter(
        (p) => p.EventID === event.EventID && p.Status !== "rejected"
      );
      const totalSpent = eventPayments.reduce(
        (sum, p) => sum + (parseFloat(p.GTTLAmount) || 0),
        0
      );
      const budget = parseFloat(event.Budget) || 0;
      const remaining = budget - totalSpent;
      const percentage = budget > 0 ? (totalSpent / budget) * 100 : 0;

      return {
        eventId: event.EventID,
        eventName: event.EventName,
        budget,
        totalSpent,
        remaining,
        percentage,
        isOverBudget: totalSpent > budget,
        startDate: event.StartDate,
        endDate: event.EndDate,
        status: event.Status || "active",
        description: event.Description || "",
        createdAt: event.CreatedAt,
        createdBy: event.CreatedBy,
        paymentCount: eventPayments.length,
      };
    });
  }),

  /**
   * Get single event by ID
   */
  getById: orgProcedure
    .input(z.object({ eventId: z.string() }))
    .query(async ({ ctx, input }) => {
      const sheets = await getSheetsService(ctx.org.orgId);
      const event = await sheets.getEventById(input.eventId);
      if (!event) return null;

      const payments = await sheets.getPaymentsByEvent(input.eventId);
      const totalSpent = payments
        .filter((p) => p.Status !== "rejected")
        .reduce((sum, p) => sum + (parseFloat(p.GTTLAmount) || 0), 0);
      const budget = parseFloat(event.Budget) || 0;

      return {
        eventId: event.EventID,
        eventName: event.EventName,
        budget,
        totalSpent,
        remaining: budget - totalSpent,
        percentage: budget > 0 ? (totalSpent / budget) * 100 : 0,
        isOverBudget: totalSpent > budget,
        startDate: event.StartDate,
        endDate: event.EndDate,
        status: event.Status || "active",
        description: event.Description || "",
        createdAt: event.CreatedAt,
        createdBy: event.CreatedBy,
        payments,
      };
    }),

  /**
   * Create new event
   */
  create: permissionProcedure("manageEvents")
    .input(EventInputSchema)
    .mutation(async ({ ctx, input }) => {
      const sheets = await getSheetsService(ctx.org.orgId);

      // Check plan limit
      const subscription = await prisma.subscription.findUnique({
        where: { orgId: ctx.org.orgId },
      });
      if (subscription) {
        const existing = await sheets.getEvents();
        const activeCount = existing.filter(
          (e) => e.Status !== "completed" && e.Status !== "cancelled"
        ).length;
        if (activeCount >= subscription.maxEvents) {
          throw new Error(
            `แพ็คเกจปัจจุบันรองรับโปรเจกต์ active สูงสุด ${subscription.maxEvents} โปรเจกต์`
          );
        }
      }

      const eventId = GoogleSheetsService.generateId("EVT");
      const now = new Date().toISOString();

      await sheets.appendRow(SHEET_TABS.EVENTS, [
        eventId,
        input.eventName,
        input.budget,
        input.startDate,
        input.endDate,
        "active",
        input.description || "",
        now,
        ctx.session.displayName,
      ]);

      // Audit log
      await prisma.auditLog.create({
        data: {
          orgId: ctx.org.orgId,
          userId: ctx.session.userId,
          action: "create",
          entityType: "event",
          entityRef: eventId,
          summary: `สร้างโปรเจกต์ "${input.eventName}" งบ ${input.budget.toLocaleString()} บาท`,
        },
      });

      return { success: true, eventId };
    }),

  /**
   * Update event
   */
  update: permissionProcedure("manageEvents")
    .input(
      z.object({
        eventId: z.string(),
        eventName: z.string().min(1).max(200).optional(),
        budget: z.number().min(0).optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        status: z.enum(["active", "completed", "cancelled"]).optional(),
        description: z.string().max(1000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const sheets = await getSheetsService(ctx.org.orgId);

      const updates: Record<string, string | number> = {};
      if (input.eventName !== undefined) updates.EventName = input.eventName;
      if (input.budget !== undefined) updates.Budget = input.budget;
      if (input.startDate !== undefined) updates.StartDate = input.startDate;
      if (input.endDate !== undefined) updates.EndDate = input.endDate;
      if (input.status !== undefined) updates.Status = input.status;
      if (input.description !== undefined) updates.Description = input.description;

      const ok = await sheets.updateById(
        SHEET_TABS.EVENTS,
        "EventID",
        input.eventId,
        updates
      );
      if (!ok) throw new Error("ไม่พบโปรเจกต์");

      await prisma.auditLog.create({
        data: {
          orgId: ctx.org.orgId,
          userId: ctx.session.userId,
          action: "update",
          entityType: "event",
          entityRef: input.eventId,
          summary: `แก้ไขโปรเจกต์`,
        },
      });

      return { success: true };
    }),

  /**
   * Delete event
   */
  delete: permissionProcedure("manageEvents")
    .input(z.object({ eventId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const sheets = await getSheetsService(ctx.org.orgId);

      // Check if event has payments
      const payments = await sheets.getPaymentsByEvent(input.eventId);
      if (payments.length > 0) {
        throw new Error(
          `ลบไม่ได้ — โปรเจกต์นี้มีรายจ่าย ${payments.length} รายการ ลองเปลี่ยน status เป็น "cancelled" แทน`
        );
      }

      const ok = await sheets.deleteById(
        SHEET_TABS.EVENTS,
        "EventID",
        input.eventId
      );
      if (!ok) throw new Error("ไม่พบโปรเจกต์");

      await prisma.auditLog.create({
        data: {
          orgId: ctx.org.orgId,
          userId: ctx.session.userId,
          action: "delete",
          entityType: "event",
          entityRef: input.eventId,
          summary: `ลบโปรเจกต์`,
        },
      });

      return { success: true };
    }),
});
