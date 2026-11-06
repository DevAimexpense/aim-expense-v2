// ===========================================
// POST /api/ocr/receipt
// Parse uploaded invoice/receipt via OCR
// Returns extracted data for user review BEFORE saving
// ===========================================

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getOrgContext } from "@/lib/auth/middleware";
import { parseReceipt, OcrFailedError, type DocumentType } from "@/lib/ocr";
import { validateUploadedFile } from "@/lib/security/file-validation";
import { checkQuotaOnly, incrementAndCheckQuota } from "@/server/lib/usage";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const org = await getOrgContext(session.userId);
  if (!org) {
    return NextResponse.json({ error: "No organization" }, { status: 400 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const docType = (formData.get("documentType") as DocumentType) || "invoice";

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "ไม่พบไฟล์" }, { status: 400 });
    }

    // Check monthly OCR quota (read-only) — refuse early before expensive OCR
    const quota = await checkQuotaOnly(org.orgId, "ocr");
    if (!quota.ok) {
      return NextResponse.json(
        {
          error: `OCR quota หมดแล้วเดือนนี้ (${quota.current}/${quota.limit}) — อัปเกรดแพ็คเกจหรือซื้อ OCR เพิ่ม`,
          quota,
        },
        { status: 429 },
      );
    }

    // Parse
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Security: verify magic bytes + size + MIME
    try {
      validateUploadedFile({ type: file.type, size: file.size }, buffer);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "ไฟล์ไม่ถูกต้อง";
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    console.log(`[ocr] Starting OCR: ${file.name.replace(/[\r\n]/g, "")} (${file.type}, ${file.size} bytes)`);

    const result = await parseReceipt(buffer, file.type, docType);

    console.log(`[ocr] OCR success: confidence=${result.confidence}, vendor=${result.vendorName}`);

    // Count this scan against the monthly quota — only after a successful
    // parse, so a failed OCR never costs the user a credit.
    // LINE-23: การเพิ่มเป็น atomic (`count < limit`) — ถ้าสแกนพร้อมกันจนเต็มพอดี ok=false
    // ต้องไม่ส่งผล OCR กลับไปให้บันทึก (ค่า OCR ที่จ่ายไปแล้วยอมเสีย ดีกว่าให้ใช้เกินโควตา)
    const usage = await incrementAndCheckQuota(org.orgId, "ocr");
    if (!usage.ok) {
      console.warn(`[ocr/receipt] quota exhausted after scan org=${org.orgId} (${usage.current}/${usage.limit}) — result discarded`);
      return NextResponse.json(
        {
          error: `OCR quota หมดแล้วเดือนนี้ (${usage.current}/${usage.limit}) — อัปเกรดแพ็คเกจหรือซื้อ OCR เพิ่ม`,
          quota: usage,
        },
        { status: 429 },
      );
    }

    return NextResponse.json({
      success: true,
      data: result,
      quota: {
        used: usage.current,
        limit: usage.limit,
        remaining: usage.limit === -1 ? null : usage.remaining,
      },
    });
  } catch (err) {
    console.error("[ocr/receipt] ERROR:", err);
    if (err instanceof OcrFailedError) {
      // LINE-24: message เป็นภาษาไทยแล้ว — รายละเอียด provider อยู่ใน log เท่านั้น
      console.error("[ocr/receipt] provider errors:", err.providerErrors);
      return NextResponse.json({ error: err.message }, { status: err.timedOut ? 504 : 502 });
    }
    if (err instanceof Error) {
      console.error("[ocr/receipt] Stack:", err.stack);
    }
    const message = err instanceof Error ? err.message : "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
