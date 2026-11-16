// ===========================================
// POST /api/statements/upload
// อัปโหลด statement ธนาคารรายเดือน → Drive: Reports/{YYYY}/{MM}/{YYYY-MM}_Statement_{ธนาคาร}_{4 ตัวท้าย}.pdf
// แล้วจดแถวในแท็บ BankStatements (ข้อมูลอยู่ในชีต/Drive ของธุรกิจ — Zero Data Retention)
//
// FormData: file (PDF/รูป), month (YYYY-MM), companyBankId (ว่าง = บัญชีอื่น), bankLabel (กรณีบัญชีอื่น), notes
// ===========================================

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getOrgContext } from "@/lib/auth/middleware";
import { getSheetsService, getDriveService, ensureTabsCached } from "@/server/lib/sheets-context";
import { GoogleSheetsService, SHEET_TABS } from "@/server/services/google-sheets.service";
import { validateUploadedFile } from "@/lib/security/file-validation";
import { safeAuditLog } from "@/server/lib/audit";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const sanitize = (s: string) =>
  s.replace(/[^\w฀-๿-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const org = await getOrgContext(session.userId, session.activeOrgId);
  if (!org) return NextResponse.json({ error: "No organization" }, { status: 400 });
  if (org.role !== "admin" && !org.permissions.viewReports) {
    return NextResponse.json({ error: "ไม่มีสิทธิ์: viewReports" }, { status: 403 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const month = String(formData.get("month") || "");
    const companyBankId = String(formData.get("companyBankId") || "");
    const otherLabel = String(formData.get("bankLabel") || "").trim().slice(0, 100);
    const notes = String(formData.get("notes") || "").trim().slice(0, 300);

    if (!(file instanceof File)) return NextResponse.json({ error: "ไม่พบไฟล์" }, { status: 400 });
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return NextResponse.json({ error: "เดือนไม่ถูกต้อง" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    try {
      validateUploadedFile({ type: file.type, size: file.size }, buffer);
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "ไฟล์ไม่ถูกต้อง" }, { status: 400 });
    }

    const sheets = await getSheetsService(org.orgId);
    await ensureTabsCached(sheets, org.orgId); // สร้างแท็บ BankStatements ในชีตเก่า

    // ชื่อบัญชี: จาก CompanyBanks (snapshot) หรือที่ผู้ใช้พิมพ์ (บัญชีอื่น)
    let bankLabel = otherLabel || "บัญชีอื่น";
    let bankShort = "อื่นๆ";
    if (companyBankId) {
      const bank = await sheets.getById(SHEET_TABS.COMPANY_BANKS, "CompanyBankID", companyBankId);
      if (!bank) return NextResponse.json({ error: "ไม่พบบัญชีธนาคารนี้" }, { status: 404 });
      const acct = String(bank.AccountNumber || "").replace(/\D/g, "");
      bankLabel = [bank.BankName, bank.AccountNumber].filter(Boolean).join(" · ");
      bankShort = `${bank.BankName || "bank"}_${acct.slice(-4) || "xxxx"}`;
    } else if (otherLabel) {
      bankShort = otherLabel;
    }

    // ไฟล์ที่ n ของบัญชีเดียวกันในเดือนเดียวกัน → ต่อท้าย _2, _3 …
    const existing = (await sheets.getAll(SHEET_TABS.BANK_STATEMENTS)).filter(
      (r) => r.Month === month && (r.CompanyBankID || "") === companyBankId && (companyBankId || r.BankLabel === bankLabel),
    );
    const ext = (file.name.split(".").pop() || "pdf").toLowerCase().replace(/[^a-z0-9]/g, "") || "pdf";
    const suffix = existing.length > 0 ? `_${existing.length + 1}` : "";
    const fileName = `${month}_Statement_${sanitize(bankShort)}${suffix}.${ext}`;

    const { drive, reportsFolderId } = await getDriveService(org.orgId);
    const [yyyy, mm] = month.split("-").map((v) => parseInt(v, 10));
    const monthFolderId = await drive.getOrCreateYearMonthFolder(reportsFolderId, yyyy, mm);
    const uploaded = await drive.uploadFile(monthFolderId, fileName, file.type, buffer);

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { fullName: true, lineDisplayName: true },
    });
    const statementId = GoogleSheetsService.generateId("STM");
    await sheets.appendRowByHeaders(SHEET_TABS.BANK_STATEMENTS, {
      StatementID: statementId,
      Month: month,
      CompanyBankID: companyBankId,
      BankLabel: bankLabel,
      FileName: fileName,
      FileUrl: uploaded.webViewLink,
      FileId: uploaded.fileId,
      MonthFolderId: monthFolderId,
      Notes: notes,
      UploadedBy: user?.fullName || user?.lineDisplayName || "",
      UploadedByUserId: session.userId,
      UploadedAt: new Date().toISOString(),
    });

    await safeAuditLog({
      data: {
        orgId: org.orgId,
        userId: session.userId,
        action: "upload",
        entityType: "bank_statement",
        entityRef: statementId,
        summary: `อัปโหลด statement ${month} → Reports/${yyyy}/${String(mm).padStart(2, "0")}/${fileName}`,
      },
    });

    return NextResponse.json({ success: true, statementId, fileUrl: uploaded.webViewLink, fileName });
  } catch (err) {
    console.error("[statements/upload]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "อัปโหลดไม่สำเร็จ" }, { status: 500 });
  }
}
