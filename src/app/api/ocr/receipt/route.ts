// ===========================================
// POST /api/ocr/receipt
// Parse uploaded invoice/receipt via OCR
// Returns extracted data for user review BEFORE saving
// ===========================================

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getOrgContext } from "@/lib/auth/middleware";
import { parseReceipt, type DocumentType } from "@/lib/ocr";
import { prisma } from "@/lib/prisma";
import { validateUploadedFile } from "@/lib/security/file-validation";

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

    // Check OCR scan quota
    const subscription = await prisma.subscription.findUnique({
      where: { orgId: org.orgId },
    });
    if (subscription) {
      const used = subscription.creditsUsed;
      const limit = subscription.scanCredits + subscription.bonusCredits;
      if (limit > 0 && used >= limit) {
        return NextResponse.json(
          {
            error: `OCR quota หมดแล้ว (${used}/${limit}) — upgrade plan หรือซื้อ credit pack`,
          },
          { status: 429 }
        );
      }
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

    // Increment usage (best effort, don't block response)
    if (subscription) {
      prisma.subscription
        .update({
          where: { orgId: org.orgId },
          data: { creditsUsed: { increment: 1 } },
        })
        .catch((err) => console.error("[ocr] failed to update credits:", err));
    }

    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    console.error("[ocr/receipt] ERROR:", err);
    if (err instanceof Error) {
      console.error("[ocr/receipt] Stack:", err.stack);
    }
    const message = err instanceof Error ? err.message : "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
