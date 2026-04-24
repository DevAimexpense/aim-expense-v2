// ===========================================
// LINE Webhook Event Handlers (Session 5 — updated)
// Flow: Image → OCR → Select Project → Confirm → Save expense
// ===========================================

import { prisma } from "@/lib/prisma";
import {
  replyMessage,
  pushMessage,
  text,
  getMessageContent,
  type LineMessage,
  type LineQuickReplyItem,
} from "@/lib/line/messaging";
import { parseReceipt, type OcrParsedReceipt } from "@/lib/ocr";
import { resolveLineContext } from "@/lib/line/user-org";
import { ensureLineDefaults } from "@/lib/line/defaults";
import {
  buildOcrConfirmFlex,
  buildSavedFlex,
} from "@/lib/line/flex/payment-confirm";
import {
  GoogleSheetsService,
  SHEET_TABS,
} from "@/server/services/google-sheets.service";
import { getSheetsService, getDriveService } from "@/server/lib/sheets-context";
import { calculatePayment } from "@/lib/calculations";

const APP_BASE_URL =
  process.env.APP_BASE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  "http://localhost:3000";

const DRAFT_TTL_HOURS = 24;

// ---------- LINE Event Types ----------
export interface LineWebhookEvent {
  type: string;
  replyToken?: string;
  source: { userId?: string; type: string };
  message?: {
    id: string;
    type: string;
    text?: string;
    fileName?: string;
    fileSize?: number;
  };
  postback?: {
    data: string;
  };
}

const SUPPORTED_FILE_EXTENSIONS = ["pdf", "jpg", "jpeg", "png", "webp"];

function mimeTypeFromFilename(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  switch (ext) {
    case "pdf": return "application/pdf";
    case "png": return "image/png";
    case "jpg": case "jpeg": return "image/jpeg";
    case "webp": return "image/webp";
    default: return "application/octet-stream";
  }
}

// =====================================================
// FOLLOW
// =====================================================
export async function handleFollow(event: LineWebhookEvent): Promise<void> {
  if (!event.replyToken) return;
  const ctx = event.source.userId
    ? await resolveLineContext(event.source.userId)
    : null;

  const messages: LineMessage[] = ctx
    ? [
        text(`สวัสดีค่ะ คุณ${ctx.user.lineDisplayName}\nยินดีต้อนรับสู่ Aim Expense`),
        text("ส่งรูปใบเสร็จ/ใบกำกับภาษีมาได้เลย\nระบบจะอ่านข้อมูลและให้คุณยืนยันก่อนบันทึกเข้าระบบค่ะ"),
      ]
    : [
        text("สวัสดีค่ะ ยินดีต้อนรับสู่ Aim Expense"),
        text(`กรุณาเข้าสู่ระบบที่เว็บก่อนใช้งานนะคะ\n${APP_BASE_URL}/login`),
      ];
  await replyMessage(event.replyToken, messages);
}

// =====================================================
// TEXT
// =====================================================
export async function handleText(event: LineWebhookEvent): Promise<void> {
  if (!event.replyToken) return;
  const msg = (event.message?.text || "").trim().toLowerCase();

  if (msg === "help" || msg === "ช่วย" || msg === "?") {
    await replyMessage(event.replyToken, [
      text(
        "วิธีใช้งาน\n\n" +
          "ส่งรูปใบเสร็จ/ใบกำกับภาษี\n" +
          "→ ระบบอ่านข้อมูล → เลือกโปรเจกต์ → กดยืนยัน → บันทึกเข้าระบบ\n\n" +
          "จัดการรายจ่ายเต็มรูปแบบ:\n" +
          `${APP_BASE_URL}/expenses`
      ),
    ]);
    return;
  }

  await replyMessage(event.replyToken, [
    text("ส่งรูปใบเสร็จมาได้เลยค่ะ\nหรือพิมพ์ \"help\" เพื่อดูวิธีใช้งาน"),
  ]);
}

// =====================================================
// MEDIA — Image/PDF → OCR → Quick Reply เลือกโปรเจกต์
// =====================================================
export async function handleMedia(event: LineWebhookEvent): Promise<void> {
  if (!event.replyToken || !event.source.userId || !event.message?.id) return;

  const lineUserId = event.source.userId;
  const messageId = event.message.id;
  const msgType = event.message.type;

  // Determine MIME type
  let mimeType: string;
  let displayKind: string;
  if (msgType === "image") {
    mimeType = "image/jpeg";
    displayKind = "รูป";
  } else if (msgType === "file") {
    const fileName = event.message.fileName || "";
    const ext = fileName.split(".").pop()?.toLowerCase() || "";
    if (!SUPPORTED_FILE_EXTENSIONS.includes(ext)) {
      await replyMessage(event.replyToken, [
        text(`ไม่รองรับไฟล์ .${ext}\nรองรับเฉพาะ: ${SUPPORTED_FILE_EXTENSIONS.join(", ")}`),
      ]);
      return;
    }
    mimeType = mimeTypeFromFilename(fileName);
    displayKind = ext === "pdf" ? "PDF" : "ไฟล์รูป";
  } else {
    return;
  }

  // Resolve user + org
  const ctx = await resolveLineContext(lineUserId);
  if (!ctx) {
    await replyMessage(event.replyToken, [
      text(`กรุณาสมัครและสร้างองค์กรในเว็บก่อนใช้งานค่ะ\n${APP_BASE_URL}/login`),
    ]);
    return;
  }
  if (ctx.user.onboardingStep !== "done") {
    await replyMessage(event.replyToken, [
      text(`กรุณาตั้งค่าบัญชีให้เสร็จก่อนใช้งานค่ะ\n${APP_BASE_URL}`),
    ]);
    return;
  }

  // Acknowledge
  await replyMessage(event.replyToken, [
    text(`${displayKind}ได้รับแล้วค่ะ กำลังอ่านข้อมูล...`),
  ]);

  // Process OCR → then ask to select project
  await processMediaAsync(lineUserId, messageId, mimeType, ctx).catch((err) => {
    console.error("[LINE webhook] media processing failed:", err);
    void pushMessage(lineUserId, [
      text("ไม่สามารถอ่านเอกสารได้\n" + (err instanceof Error ? err.message : "เกิดข้อผิดพลาด")),
    ]).catch(() => {});
  });
}

export const handleImage = handleMedia;

async function processMediaAsync(
  lineUserId: string,
  messageId: string,
  mimeType: string,
  ctx: { user: { id: string }; orgId: string; orgName: string }
): Promise<void> {
  // Download + OCR
  const buffer = await getMessageContent(messageId);
  const ocr = await parseReceipt(buffer, mimeType, "receipt");

  // Save draft
  const expiresAt = new Date(Date.now() + DRAFT_TTL_HOURS * 3600 * 1000);
  const draft = await prisma.lineDraft.create({
    data: {
      lineUserId,
      userId: ctx.user.id,
      orgId: ctx.orgId,
      imageMessageId: messageId,
      mimeType,
      ocrJson: ocr as unknown as object,
      expiresAt,
    },
  });

  // Fetch active projects for Quick Reply
  const sheets = await getSheetsService(ctx.orgId);
  const events = await sheets.getEvents();
  const activeEvents = events
    .filter((e) => e.Status === "active" || e.Status === "Active")
    .slice(0, 13); // LINE Quick Reply max 13 items

  if (activeEvents.length === 0) {
    // No projects — use default and go straight to confirm
    const defaults = await ensureLineDefaults(sheets);
    await prisma.lineDraft.update({
      where: { id: draft.id },
      data: { eventId: defaults.eventId, eventName: "LINE (ไม่ระบุโปรเจกต์)" } as Record<string, unknown>,
    });
    await pushMessage(lineUserId, [
      buildOcrConfirmFlex(draft, ocr, {
        orgName: ctx.orgName,
        projectName: "LINE (ไม่ระบุโปรเจกต์)",
        appBaseUrl: APP_BASE_URL,
      }),
    ]);
    return;
  }

  // Build Quick Reply items
  const quickReplyItems: LineQuickReplyItem[] = activeEvents.map((ev) => ({
    type: "action" as const,
    action: {
      type: "postback" as const,
      label: (ev.EventName || "ไม่ระบุ").slice(0, 20), // LINE label max 20 chars
      data: `action=select_project&id=${draft.id}&eventId=${ev.EventID}&eventName=${encodeURIComponent((ev.EventName || "").slice(0, 50))}`,
      displayText: `${ev.EventName || "ไม่ระบุ"}`,
    },
  }));

  const vendor = ocr.vendorName || "ไม่ระบุ";
  const total = ocr.totalAmount ?? ocr.subtotal ?? 0;
  const fmtTotal = total.toLocaleString("th-TH", { minimumFractionDigits: 2 });
  const docNo = ocr.invoiceNumber || "";
  const docDate = ocr.documentDate || "";
  const docTypeLabel = ocr.documentType === "tax_invoice" ? "ใบกำกับภาษี"
    : ocr.documentType === "receipt" ? "ใบเสร็จรับเงิน"
    : ocr.documentType === "invoice" ? "ใบแจ้งหนี้"
    : ocr.documentType === "quotation" ? "ใบเสนอราคา"
    : "เอกสาร";

  const summaryLines = [
    `อ่านเสร็จแล้ว`,
    ``,
    `${vendor}`,
    `฿${fmtTotal}`,
    docNo ? `${docTypeLabel}: ${docNo}` : docTypeLabel,
    docDate ? `วันที่: ${docDate}` : "",
    ocr.vendorTaxId ? `Tax ID: ${ocr.vendorTaxId}` : "",
    ocr.buyerName ? `ผู้ซื้อ: ${ocr.buyerName}` : "",
    ``,
    `กรุณาเลือกโปรเจกต์:`,
  ].filter(Boolean).join("\n");

  await pushMessage(lineUserId, [
    {
      type: "text",
      text: summaryLines,
      quickReply: { items: quickReplyItems },
    },
  ]);
}

// =====================================================
// POSTBACK — select_project / confirm / cancel
// =====================================================
export async function handlePostback(event: LineWebhookEvent): Promise<void> {
  if (!event.replyToken || !event.source.userId || !event.postback?.data) return;

  const params = new URLSearchParams(event.postback.data);
  const action = params.get("action");
  const draftId = params.get("id");
  if (!action || !draftId) return;

  const draft = await prisma.lineDraft.findUnique({ where: { id: draftId } });
  if (!draft || draft.lineUserId !== event.source.userId) {
    await replyMessage(event.replyToken, [text("ไม่พบรายการ หรือไม่ใช่รายการของคุณ")]);
    return;
  }
  if (draft.status !== "pending") {
    await replyMessage(event.replyToken, [
      text(`รายการนี้ ${draft.status === "confirmed" ? "บันทึกไปแล้ว" : "ถูกยกเลิกแล้ว"}`),
    ]);
    return;
  }
  if (draft.expiresAt < new Date()) {
    await prisma.lineDraft.update({ where: { id: draftId }, data: { status: "expired" } });
    await replyMessage(event.replyToken, [text("รายการหมดอายุแล้ว กรุณาส่งรูปใหม่")]);
    return;
  }

  // --- SELECT PROJECT ---
  if (action === "select_project") {
    const eventId = params.get("eventId") || "";
    const eventName = decodeURIComponent(params.get("eventName") || "");

    try {
      await prisma.lineDraft.update({
        where: { id: draftId },
        data: { eventId, eventName } as Record<string, unknown>,
      });

      const ocr = draft.ocrJson as unknown as OcrParsedReceipt;
      const ctx = await resolveLineContext(event.source.userId);

      const flexMsg = buildOcrConfirmFlex(
        { id: draftId },
        ocr,
        {
          orgName: ctx?.orgName || "",
          projectName: eventName,
          appBaseUrl: APP_BASE_URL,
        }
      );

      // Log Flex JSON size for debugging
      const jsonSize = JSON.stringify(flexMsg).length;
      console.log(`[LINE] Flex card size: ${jsonSize} bytes`);

      await replyMessage(event.replyToken, [flexMsg]);
    } catch (err) {
      console.error("[LINE] select_project error:", err);
      // Fallback: push plain text so user isn't left hanging
      await pushMessage(event.source.userId, [
        text(`เลือกโปรเจกต์แล้ว: ${eventName}\nกรุณากดยืนยันด้านล่าง`),
        {
          type: "text",
          text: `ยืนยันบันทึกรายจ่าย?`,
          quickReply: {
            items: [
              {
                type: "action",
                action: {
                  type: "postback",
                  label: "บันทึก",
                  data: `action=confirm&id=${draftId}`,
                  displayText: "บันทึกเป็นรายจ่าย",
                },
              },
              {
                type: "action",
                action: {
                  type: "postback",
                  label: "ยกเลิก",
                  data: `action=cancel&id=${draftId}`,
                  displayText: "ยกเลิก",
                },
              },
              {
                type: "action",
                action: {
                  type: "uri",
                  label: "แก้ไขในเว็บ",
                  uri: `${APP_BASE_URL}/expenses`,
                },
              },
            ],
          },
        },
      ]).catch(() => {});
    }
    return;
  }

  // --- CANCEL ---
  if (action === "cancel") {
    await prisma.lineDraft.update({ where: { id: draftId }, data: { status: "cancelled" } });
    await replyMessage(event.replyToken, [text("ยกเลิกแล้วค่ะ")]);
    return;
  }

  // --- CONFIRM ---
  if (action === "confirm") {
    await replyMessage(event.replyToken, [text("กำลังบันทึก...")]);
    await confirmDraftAsync(draft).catch(async (err) => {
      console.error("[LINE webhook] confirm failed:", err);
      await pushMessage(event.source.userId!, [
        text("บันทึกไม่สำเร็จ\n" + (err instanceof Error ? err.message : "เกิดข้อผิดพลาด")),
      ]).catch(() => {});
    });
  }
}

// =====================================================
// CONFIRM — Save expense (เหมือน browser upload receipt)
// =====================================================
async function confirmDraftAsync(draft: {
  id: string;
  lineUserId: string;
  userId: string;
  orgId: string;
  imageMessageId: string;
  mimeType: string;
  ocrJson: unknown;
}): Promise<void> {
  const ocr = draft.ocrJson as OcrParsedReceipt;

  // Read eventId/eventName from draft (cast needed because Prisma types not regenerated yet)
  const draftFull = await prisma.lineDraft.findUnique({ where: { id: draft.id } }) as Record<string, unknown> | null;
  const eventId = (draftFull?.eventId as string) || "";
  const eventName = (draftFull?.eventName as string) || "";

  // Get services
  const sheets = await getSheetsService(draft.orgId);
  await sheets.ensureAllTabsExist();
  const { drive, receiptsFolderId, orgName } = await getDriveService(draft.orgId);

  // Find or create payee
  const defaults = await ensureLineDefaults(sheets);
  let payeeId = defaults.payeeId;
  let vendorTaxIdSnapshot = "";
  let vendorBranchInfo = "";

  if (ocr.vendorName) {
    // Try to find existing payee by name or taxId
    const payees = await sheets.getPayees();
    const matchByTax = ocr.vendorTaxId
      ? payees.find((p) => p.TaxID === ocr.vendorTaxId)
      : null;
    const matchByName = payees.find(
      (p) => p.PayeeName?.toLowerCase().includes(ocr.vendorName!.toLowerCase())
    );
    const matched = matchByTax || matchByName;

    if (matched) {
      payeeId = matched.PayeeID;
      vendorTaxIdSnapshot = matched.TaxID || ocr.vendorTaxId || "";
      vendorBranchInfo = matched.BranchType === "Branch" && matched.BranchNumber
        ? `สาขา ${matched.BranchNumber}`
        : matched.BranchType === "HQ" ? "สำนักงานใหญ่" : "";
    } else {
      vendorTaxIdSnapshot = ocr.vendorTaxId || "";
      vendorBranchInfo = ocr.vendorBranch || "";
    }
  }

  // Use selected project or default
  const finalEventId = eventId || defaults.eventId;

  // Re-download content from LINE
  const buffer = await getMessageContent(draft.imageMessageId);

  // Upload to Google Drive
  const ext = draft.mimeType === "application/pdf" ? "pdf"
    : draft.mimeType === "image/png" ? "png"
    : draft.mimeType === "image/webp" ? "webp"
    : "jpg";
  const today = new Date().toISOString().slice(0, 10);

  // Generate paymentId ก่อน upload เพื่อให้ชื่อไฟล์ embed paymentId ได้ (unique key)
  const paymentId = GoogleSheetsService.generateId("PMT");
  const description = ocr.vendorName
    ? `${ocr.vendorName}${ocr.invoiceNumber ? "-" + ocr.invoiceNumber : ""}`
    : "LINE";

  const upload = await drive.uploadPaymentFile({
    receiptsFolderId,
    orgName,
    receiptDate: ocr.documentDate || today,
    paymentId,
    description,
    projectName: eventName || "LINE",
    payeeName: ocr.vendorName || "ไม่ระบุ",
    invoiceNumber: ocr.invoiceNumber || undefined,
    fileType: "receipt",
    fileName: `line-${draft.id}.${ext}`,
    mimeType: draft.mimeType,
    fileBuffer: buffer,
  });

  // Calculate amounts (เหมือน browser)
  const totalAmount = ocr.totalAmount ?? ocr.subtotal ?? 0;
  const costPerUnit = ocr.hasVat ? totalAmount / 1.07 : totalAmount;
  const pctWTH = 0; // default — user แก้ในเว็บได้

  const calc = calculatePayment({
    costPerUnit: Math.round(costPerUnit * 100) / 100,
    days: 1,
    numberOfPeople: 1,
    pctWTH,
    isVatPayee: !!ocr.hasVat,
  });

  // Create payment record (เหมือน browser payment.create mutation) — ใช้ paymentId ที่ generate ไว้แล้ว
  const now = new Date().toISOString();

  await sheets.appendRowByHeaders(SHEET_TABS.PAYMENTS, {
    PaymentID: paymentId,
    EventID: finalEventId,
    PayeeID: payeeId,
    ExpenseType: "general",
    CompanyBankID: "",
    InvoiceNumber: ocr.invoiceNumber || "",
    InvoiceFileURL: "",
    Description: ocr.vendorName
      ? `${ocr.vendorName}${ocr.invoiceNumber ? " - " + ocr.invoiceNumber : ""} (LINE)`
      : "บันทึกจาก LINE",
    CostPerUnit: Math.round(costPerUnit * 100) / 100,
    Days: 1,
    NoOfPPL: 1,
    TTLAmount: calc.ttlAmount,
    PctWTH: pctWTH,
    WTHAmount: calc.wthAmount,
    VATAmount: ocr.vatAmount ?? calc.vatAmount,
    GTTLAmount: calc.gttlAmount,
    Status: "pending",
    PaymentDate: "",
    DueDate: ocr.documentDate || today,
    ApprovedBy: "",
    ApprovedAt: "",
    PaidAt: "",
    BatchID: "",
    IsCleared: "FALSE",
    ClearedAt: "",
    ReceiptURL: upload.webViewLink,
    ReceiptNumber: ocr.invoiceNumber || "",
    ReceiptDate: ocr.documentDate || "",
    // Tax compliance — เหมือน browser
    DocumentType: ocr.documentType === "tax_invoice" ? "tax_invoice" : "receipt",
    ExpenseNature: "",
    CategoryMain: "",
    CategorySub: "",
    RequesterName: "LINE OA",
    VendorTaxIdSnapshot: vendorTaxIdSnapshot,
    VendorBranchInfo: vendorBranchInfo,
    Notes: `OCR confidence ${Math.round((ocr.confidence ?? 0) * 100)}% | LINE draft ${draft.id}`,
    CreatedAt: now,
    CreatedBy: "LINE OA",
    CreatedByUserId: draft.userId,
    UpdatedAt: now,
  });

  // Mark draft confirmed
  await prisma.lineDraft.update({
    where: { id: draft.id },
    data: {
      status: "confirmed",
      driveFileId: upload.fileId,
      driveFileUrl: upload.webViewLink,
    },
  });

  // Audit log
  await prisma.auditLog.create({
    data: {
      orgId: draft.orgId,
      userId: draft.userId,
      action: "create",
      entityType: "payment",
      entityRef: paymentId,
      summary: `LINE OCR: ${ocr.vendorName || ""} ฿${totalAmount} | ${eventName || "ไม่ระบุโปรเจกต์"}`,
    },
  });

  // Notify user
  await pushMessage(draft.lineUserId, [
    buildSavedFlex({
      paymentId,
      vendor: ocr.vendorName || "บันทึกจาก LINE",
      amount: totalAmount,
      projectName: eventName || "ไม่ระบุ",
      webUrl: `${APP_BASE_URL}/expenses`,
    }),
  ]);
}
