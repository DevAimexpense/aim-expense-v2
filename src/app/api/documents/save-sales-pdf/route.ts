// ===========================================
// POST /api/documents/save-sales-pdf
// บันทึก PDF เอกสารขายลง Drive อัตโนมัติ (spec: เอกสารทุกใบต้องเก็บใน Drive ของธุรกิจ)
//   ใบเสนอราคา / ใบวางบิล / ใบกำกับภาษี / ใบเสร็จรับเงิน → Documents/{YYYY}/{MM}/{เลขที่}.pdf
//
// เอกสารพวกนี้ render เป็น HTML ในเบราว์เซอร์ → หน้าเอกสาร (หรือ iframe ?auto=1 จากหน้ารายละเอียด)
// สร้าง PDF แล้วส่งมาที่นี่ · มีไฟล์เดิม → ไฟล์เวอร์ชันใหม่ _v2… (CTRL-09 ห้ามทับ) เฉพาะเมื่อสิ่งที่พิมพ์เปลี่ยน
// (CTRL-10 ลายนิ้วมือใน PdfContentFor) · จด PdfFor = UpdatedAt ที่ใช้สร้าง
// (แก้เอกสารทีหลัง UpdatedAt เปลี่ยน → หน้ารายละเอียดสั่งบันทึกใหม่เอง)
//
// FormData: file (PDF), kind (quotation|billing|tax-invoice|receipt), id, version (UpdatedAt ที่ render)
// ===========================================

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getOrgContext } from "@/lib/auth/middleware";
import { getSheetsService, getDriveService, ensureTabsCached } from "@/server/lib/sheets-context";
import { SHEET_TABS } from "@/server/services/google-sheets.service";
import { safeAuditLog } from "@/server/lib/audit";
import { withLock } from "@/server/lib/lock";
import { invalidateTab } from "@/server/lib/cache";
import { hasFeature, PLAN_LABELS } from "@/lib/plans";
import { todayBangkok } from "@/lib/utils/date";
import { salesDocFingerprint } from "@/server/lib/sales-doc-fingerprint";

export const runtime = "nodejs";

type Kind = "quotation" | "billing" | "tax-invoice" | "receipt";

const KIND: Record<
  Kind,
  {
    tab: string;
    idCol: string;
    perm: "manageQuotations" | "manageBillings" | "manageTaxInvoices";
    urlCol: string;
    forCol: string;
    /** CTRL-10: คอลัมน์ลายนิ้วมือเนื้อหาที่พิมพ์ */
    fpCol: string;
    linesTab: string;
    label: string;
  }
> = {
  quotation: { tab: SHEET_TABS.QUOTATIONS, idCol: "QuotationID", perm: "manageQuotations", urlCol: "PdfUrl", forCol: "PdfFor", fpCol: "PdfContentFor", linesTab: SHEET_TABS.QUOTATION_LINES, label: "ใบเสนอราคา" },
  billing: { tab: SHEET_TABS.BILLINGS, idCol: "BillingID", perm: "manageBillings", urlCol: "PdfUrl", forCol: "PdfFor", fpCol: "PdfContentFor", linesTab: SHEET_TABS.BILLING_LINES, label: "ใบวางบิล" },
  "tax-invoice": { tab: SHEET_TABS.TAX_INVOICES, idCol: "TaxInvoiceID", perm: "manageTaxInvoices", urlCol: "PdfUrl", forCol: "PdfFor", fpCol: "PdfContentFor", linesTab: SHEET_TABS.TAX_INVOICE_LINES, label: "ใบกำกับภาษี" },
  receipt: { tab: SHEET_TABS.BILLINGS, idCol: "BillingID", perm: "manageBillings", urlCol: "ReceiptPdfUrl", forCol: "ReceiptPdfFor", fpCol: "ReceiptPdfContentFor", linesTab: SHEET_TABS.BILLING_LINES, label: "ใบเสร็จรับเงิน" },
};

const sanitize = (s: string) =>
  s.replace(/[^\w฀-๿-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const org = await getOrgContext(session.userId, session.activeOrgId);
  if (!org) return NextResponse.json({ error: "No organization" }, { status: 400 });

  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const kind = formData.get("kind") as Kind | null;
    const id = (formData.get("id") as string | null) || "";
    const version = (formData.get("version") as string | null) || "";

    if (!kind || !(kind in KIND)) return NextResponse.json({ error: "kind ไม่ถูกต้อง" }, { status: 400 });
    if (!/^[A-Za-z0-9._-]{1,80}$/.test(id)) return NextResponse.json({ error: "id ไม่ถูกต้อง" }, { status: 400 });
    if (!(file instanceof File) || file.type !== "application/pdf") {
      return NextResponse.json({ error: "ต้องเป็นไฟล์ PDF" }, { status: 400 });
    }
    if (file.size > 20 * 1024 * 1024) return NextResponse.json({ error: "ไฟล์ใหญ่เกิน 20 MB" }, { status: 400 });

    const cfg = KIND[kind];
    // สิทธิ์ + แพ็กเกจเหมือน tRPC ของเอกสารประเภทนั้น (admin ข้ามสิทธิ์ได้ ข้ามแพ็กเกจไม่ได้)
    if (org.role !== "admin" && !org.permissions[cfg.perm]) {
      return NextResponse.json({ error: `ไม่มีสิทธิ์: ${cfg.perm}` }, { status: 403 });
    }
    if (!hasFeature(org.plan, "revenueModule")) {
      return NextResponse.json({ error: `แพ็กเกจ ${PLAN_LABELS[org.plan]} ยังไม่รองรับฟีเจอร์นี้` }, { status: 403 });
    }

    const sheets = await getSheetsService(org.orgId);
    await ensureTabsCached(sheets, org.orgId); // คอลัมน์ PdfFor / ReceiptPdfUrl ในชีตเก่า
    const buffer = Buffer.from(await file.arrayBuffer());

    const result = await withLock(
      `salesdoc:${org.orgId}:${kind}:${id}`,
      async () => {
        if (org.googleSpreadsheetId) await invalidateTab(org.googleSpreadsheetId, cfg.tab);
        const row = await sheets.getById(cfg.tab, cfg.idCol, id);
        if (!row) return { status: 404 as const, body: { error: "ไม่พบเอกสาร" } };
        if ((row.Status || "draft") === "draft") {
          return { status: 200 as const, body: { success: false, skipped: "draft" } };
        }
        const isDirectReceipt = row.DocKind === "receipt";
        const docNumber =
          kind === "receipt" ? row.ReceiptNumber || (isDirectReceipt ? row.DocNumber : "") : row.DocNumber;
        if (!docNumber) return { status: 200 as const, body: { success: false, skipped: "no_number" } };

        const versionFor = version || row.UpdatedAt || "";
        // ไม่มีอะไรเปลี่ยนตั้งแต่บันทึกครั้งก่อน → ใช้ไฟล์เดิม
        if (row[cfg.urlCol] && row[cfg.forCol] && row[cfg.forCol] === versionFor) {
          return { status: 200 as const, body: { success: true, fileUrl: row[cfg.urlCol], deduped: true } };
        }
        // CTRL-10: UpdatedAt เปลี่ยนแต่สิ่งที่พิมพ์บนเอกสารเหมือนเดิม (แนบสลิป/ออกใบเสร็จจากใบวางบิล ฯลฯ)
        // → ใช้ไฟล์เดิม ไม่สร้าง _v2 · จด forCol ใหม่ให้หน้าเว็บเลิกสั่งบันทึก
        const lines = (await sheets.getAll(cfg.linesTab)).filter((l) => l[cfg.idCol] === id);
        const fingerprint = salesDocFingerprint(kind, row, lines);
        if (row[cfg.urlCol] && row[cfg.fpCol] === fingerprint) {
          await sheets.updateById(cfg.tab, cfg.idCol, id, { [cfg.forCol]: versionFor });
          return { status: 200 as const, body: { success: true, fileUrl: row[cfg.urlCol], deduped: true } };
        }

        const docDate =
          (kind === "receipt" ? row.ReceiptDate || row.PaidDate || row.DocDate : row.DocDate) || todayBangkok();
        const customer = sanitize(row.CustomerNameSnapshot || "");
        const fileName = `${sanitize(docNumber)}${customer ? `_${customer}` : ""}.pdf`;

        const { drive, documentsFolderId } = await getDriveService(org.orgId);
        const saved = await drive.uploadDocumentVersion({
          documentsFolderId,
          docDate,
          fileName,
          fileBuffer: buffer,
          existingUrl: row[cfg.urlCol] || undefined,
        });
        // ไม่แตะ UpdatedAt — ไม่งั้นเอกสารจะดูเหมือน "ถูกแก้" แล้วบันทึกวนไม่จบ
        await sheets.updateById(cfg.tab, cfg.idCol, id, {
          [cfg.urlCol]: saved.webViewLink,
          [cfg.forCol]: versionFor,
          [cfg.fpCol]: fingerprint,
        });
        await safeAuditLog({
          data: {
            orgId: org.orgId,
            userId: session.userId,
            action: "save_document",
            entityType: kind === "tax-invoice" ? "tax_invoice" : kind,
            entityRef: id,
            summary: `บันทึก${cfg.label} ${docNumber} PDF${saved.version > 1 ? ` (เวอร์ชัน ${saved.version} — ไฟล์เดิมเก็บไว้)` : ""} → ${saved.folderPath}/${saved.fileName}`,
          },
        });
        return { status: 200 as const, body: { success: true, fileUrl: saved.webViewLink, version: saved.version } };
      },
      { ttlMs: 60_000 },
    );
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    console.error("[save-sales-pdf]", err);
    const message = err instanceof Error ? err.message : "เกิดข้อผิดพลาด";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
