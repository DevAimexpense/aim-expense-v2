// ===========================================
// Aim Expense — Customer Router (S23)
// CRUD ลูกค้า — parallel ของ Payees แต่ semantics ต่าง
// ===========================================

import { z } from "zod";
import { router, orgProcedure, permissionProcedure } from "../trpc";
import { getSheetsService } from "../lib/sheets-context";
import { GoogleSheetsService, SHEET_TABS } from "../services/google-sheets.service";
import { prisma } from "@/lib/prisma";

const CustomerInputSchema = z.object({
  customerName: z.string().min(1, "กรุณากรอกชื่อลูกค้า").max(200),
  taxId: z.string().max(13).optional(),
  branchType: z.enum(["HQ", "Branch"]).default("HQ"),
  branchNumber: z.string().max(10).optional(),
  isVAT: z.boolean().default(false), // info-only — design doc Q1
  contactPerson: z.string().max(100).optional(),
  phone: z.string().max(20).optional(),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().max(500).optional(),
  billingAddress: z.string().max(500).optional(),
  paymentTerms: z.string().max(50).default("NET 30"),
  defaultWHTPercent: z.number().min(0).max(15).default(0),
  notes: z.string().max(500).optional(),
});

export const customerRouter = router({
  list: orgProcedure.query(async ({ ctx }) => {
    const sheets = await getSheetsService(ctx.org.orgId);
    await sheets.ensureAllTabsExist(); // Auto-migrate Customers tab on first load
    const customers = await sheets.getCustomers();
    return customers
      .map((c) => ({
        customerId: c.CustomerID,
        customerName: c.CustomerName,
        taxId: c.TaxID || "",
        branchType: (c.BranchType === "Branch" ? "Branch" : "HQ") as
          | "HQ"
          | "Branch",
        branchNumber: c.BranchNumber || "",
        isVAT: c.IsVAT === "TRUE" || c.IsVAT === "true",
        contactPerson: c.ContactPerson || "",
        phone: c.Phone || "",
        email: c.Email || "",
        address: c.Address || "",
        billingAddress: c.BillingAddress || "",
        paymentTerms: c.PaymentTerms || "NET 30",
        defaultWHTPercent: parseFloat(c.DefaultWHTPercent) || 0,
        notes: c.Notes || "",
        createdAt: c.CreatedAt || "",
        createdBy: c.CreatedBy || "",
      }))
      .sort((a, b) => a.customerName.localeCompare(b.customerName, "th"));
  }),

  getById: orgProcedure
    .input(z.object({ customerId: z.string() }))
    .query(async ({ ctx, input }) => {
      const sheets = await getSheetsService(ctx.org.orgId);
      const c = await sheets.getCustomerById(input.customerId);
      if (!c) return null;
      return {
        customerId: c.CustomerID,
        customerName: c.CustomerName,
        taxId: c.TaxID || "",
        branchType: (c.BranchType === "Branch" ? "Branch" : "HQ") as
          | "HQ"
          | "Branch",
        branchNumber: c.BranchNumber || "",
        isVAT: c.IsVAT === "TRUE" || c.IsVAT === "true",
        contactPerson: c.ContactPerson || "",
        phone: c.Phone || "",
        email: c.Email || "",
        address: c.Address || "",
        billingAddress: c.BillingAddress || "",
        paymentTerms: c.PaymentTerms || "NET 30",
        defaultWHTPercent: parseFloat(c.DefaultWHTPercent) || 0,
        notes: c.Notes || "",
      };
    }),

  create: permissionProcedure("manageCustomers")
    .input(CustomerInputSchema)
    .mutation(async ({ ctx, input }) => {
      const sheets = await getSheetsService(ctx.org.orgId);
      await sheets.ensureAllTabsExist();
      const customerId = GoogleSheetsService.generateId("CUST");

      await sheets.appendRowByHeaders(SHEET_TABS.CUSTOMERS, {
        CustomerID: customerId,
        CustomerName: input.customerName,
        TaxID: input.taxId || "",
        BranchType: input.branchType,
        BranchNumber:
          input.branchType === "HQ"
            ? "00000"
            : input.branchNumber || "",
        IsVAT: input.isVAT ? "TRUE" : "FALSE",
        ContactPerson: input.contactPerson || "",
        Phone: input.phone || "",
        Email: input.email || "",
        Address: input.address || "",
        BillingAddress: input.billingAddress || input.address || "",
        PaymentTerms: input.paymentTerms,
        DefaultWHTPercent: input.defaultWHTPercent,
        Notes: input.notes || "",
        CreatedAt: new Date().toISOString(),
        CreatedBy: ctx.session.displayName || "",
      });

      await prisma.auditLog.create({
        data: {
          orgId: ctx.org.orgId,
          userId: ctx.session.userId,
          action: "create",
          entityType: "customer",
          entityRef: customerId,
          summary: `เพิ่มลูกค้า "${input.customerName}"`,
        },
      });

      return { success: true, customerId };
    }),

  update: permissionProcedure("manageCustomers")
    .input(
      z.object({ customerId: z.string() }).merge(CustomerInputSchema.partial())
    )
    .mutation(async ({ ctx, input }) => {
      const sheets = await getSheetsService(ctx.org.orgId);
      const updates: Record<string, string | number> = {};
      if (input.customerName !== undefined)
        updates.CustomerName = input.customerName;
      if (input.taxId !== undefined) updates.TaxID = input.taxId;
      if (input.branchType !== undefined) {
        updates.BranchType = input.branchType;
        if (input.branchType === "HQ") updates.BranchNumber = "00000";
      }
      if (input.branchNumber !== undefined && input.branchType !== "HQ") {
        updates.BranchNumber = input.branchNumber;
      }
      if (input.isVAT !== undefined) updates.IsVAT = input.isVAT ? "TRUE" : "FALSE";
      if (input.contactPerson !== undefined)
        updates.ContactPerson = input.contactPerson;
      if (input.phone !== undefined) updates.Phone = input.phone;
      if (input.email !== undefined) updates.Email = input.email;
      if (input.address !== undefined) updates.Address = input.address;
      if (input.billingAddress !== undefined)
        updates.BillingAddress = input.billingAddress;
      if (input.paymentTerms !== undefined)
        updates.PaymentTerms = input.paymentTerms;
      if (input.defaultWHTPercent !== undefined)
        updates.DefaultWHTPercent = input.defaultWHTPercent;
      if (input.notes !== undefined) updates.Notes = input.notes;

      const ok = await sheets.updateById(
        SHEET_TABS.CUSTOMERS,
        "CustomerID",
        input.customerId,
        updates
      );
      if (!ok) throw new Error("ไม่พบลูกค้า");

      await prisma.auditLog.create({
        data: {
          orgId: ctx.org.orgId,
          userId: ctx.session.userId,
          action: "update",
          entityType: "customer",
          entityRef: input.customerId,
          summary: `แก้ไขลูกค้า`,
        },
      });

      return { success: true };
    }),

  delete: permissionProcedure("manageCustomers")
    .input(z.object({ customerId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const sheets = await getSheetsService(ctx.org.orgId);

      // Guard: ห้ามลบถ้าใช้ใน Quotations (S24+: extend ไป Billings/TaxInvoices)
      const quotations = await sheets.getQuotations();
      const usedInQuotations = quotations.filter(
        (q) => q.CustomerID === input.customerId
      ).length;
      if (usedInQuotations > 0) {
        throw new Error(
          `ลบไม่ได้ — ลูกค้านี้มีใบเสนอราคา ${usedInQuotations} ใบในระบบ`
        );
      }

      const ok = await sheets.deleteById(
        SHEET_TABS.CUSTOMERS,
        "CustomerID",
        input.customerId
      );
      if (!ok) throw new Error("ไม่พบลูกค้า");

      await prisma.auditLog.create({
        data: {
          orgId: ctx.org.orgId,
          userId: ctx.session.userId,
          action: "delete",
          entityType: "customer",
          entityRef: input.customerId,
          summary: `ลบลูกค้า`,
        },
      });

      return { success: true };
    }),
});
