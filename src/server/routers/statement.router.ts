// ===========================================
// Aim Expense — Statement ธนาคารรายเดือน (ส่งสำนักงานบัญชี)
// ไฟล์อยู่ใน Drive: Reports/{YYYY}/{MM}/ · รายการอยู่ในแท็บ BankStatements ของชีตธุรกิจ (ZDR)
// อัปโหลดผ่าน POST /api/statements/upload (ไฟล์ใหญ่ — ไม่ผ่าน tRPC)
// ===========================================

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, orgProcedure } from "../trpc";
import { getSheetsService, getDriveService, ensureTabsCached } from "../lib/sheets-context";
import { SHEET_TABS } from "../services/google-sheets.service";
import { prisma } from "@/lib/prisma";
import { safeAuditLog } from "@/server/lib/audit";

function assertCanView(role: string, perms: { viewReports?: boolean }) {
  if (role !== "admin" && !perms.viewReports) {
    throw new TRPCError({ code: "FORBIDDEN", message: "ไม่มีสิทธิ์: viewReports" });
  }
}

export const statementRouter = router({
  /** statement ทั้งปี + บัญชีธนาคารของบริษัท (ใช้ทำตาราง ✓/✗ รายเดือน) */
  list: orgProcedure
    .input(z.object({ year: z.number().int().min(2000).max(2600) }))
    .query(async ({ ctx, input }) => {
      assertCanView(ctx.org.role, ctx.org.permissions);
      const sheets = await getSheetsService(ctx.org.orgId);
      await ensureTabsCached(sheets, ctx.org.orgId);
      const [rows, banks, org] = await Promise.all([
        sheets.getAll(SHEET_TABS.BANK_STATEMENTS),
        sheets.getAll(SHEET_TABS.COMPANY_BANKS),
        prisma.organization.findUnique({
          where: { id: ctx.org.orgId },
          select: { driveReportsFolderId: true, googleDriveFolderId: true },
        }),
      ]);
      const prefix = `${input.year}-`;
      const reportsFolderId = org?.driveReportsFolderId || org?.googleDriveFolderId || "";
      return {
        reportsFolderUrl: reportsFolderId ? `https://drive.google.com/drive/folders/${reportsFolderId}` : "",
        banks: banks
          .filter((b) => b.CompanyBankID)
          .map((b) => ({
            companyBankId: b.CompanyBankID,
            label: [b.BankName, b.AccountNumber].filter(Boolean).join(" · "),
            accountName: b.AccountName || "",
          })),
        statements: rows
          .filter((r) => r.StatementID && (r.Month || "").startsWith(prefix))
          .map((r) => ({
            statementId: r.StatementID,
            month: r.Month,
            companyBankId: r.CompanyBankID || "",
            bankLabel: r.BankLabel || "",
            fileName: r.FileName || "",
            fileUrl: r.FileUrl || "",
            monthFolderUrl: r.MonthFolderId ? `https://drive.google.com/drive/folders/${r.MonthFolderId}` : "",
            notes: r.Notes || "",
            uploadedBy: r.UploadedBy || "",
            uploadedByUserId: r.UploadedByUserId || "",
            uploadedAt: r.UploadedAt || "",
          }))
          .sort((a, b) => a.month.localeCompare(b.month) || a.uploadedAt.localeCompare(b.uploadedAt)),
      };
    }),

  /** ลบ statement (ผู้ดูแลหรือคนที่อัปโหลด) — ย้ายไฟล์ใน Drive ลงถังขยะ + ลบแถว */
  delete: orgProcedure
    .input(z.object({ statementId: z.string().min(1).max(80) }))
    .mutation(async ({ ctx, input }) => {
      assertCanView(ctx.org.role, ctx.org.permissions);
      const sheets = await getSheetsService(ctx.org.orgId);
      const row = await sheets.getById(SHEET_TABS.BANK_STATEMENTS, "StatementID", input.statementId);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบรายการ" });
      if (ctx.org.role !== "admin" && row.UploadedByUserId !== ctx.session.userId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "ลบได้เฉพาะผู้ดูแลหรือคนที่อัปโหลด" });
      }
      if (row.FileId) {
        try {
          const { drive } = await getDriveService(ctx.org.orgId);
          await drive.trashFile(row.FileId);
        } catch (err) {
          // ไฟล์ถูกลบ/ย้ายไปแล้ว — ลบแถวต่อได้
          console.warn("[statement.delete] trash failed", input.statementId, err);
        }
      }
      await sheets.deleteById(SHEET_TABS.BANK_STATEMENTS, "StatementID", input.statementId);
      await safeAuditLog({
        data: {
          orgId: ctx.org.orgId,
          userId: ctx.session.userId,
          action: "delete",
          entityType: "bank_statement",
          entityRef: input.statementId,
          summary: `ลบ statement ${row.Month} (${row.FileName || "-"})`,
        },
      });
      return { success: true };
    }),
});
