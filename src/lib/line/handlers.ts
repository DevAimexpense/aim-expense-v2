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
  showLoadingAnimation,
  type LineMessage,
  type LineQuickReplyItem,
} from "@/lib/line/messaging";
import { parseReceipt, type OcrParsedReceipt } from "@/lib/ocr";
import { findBestMatch, similarity } from "@/lib/ocr/text-similarity";
import { resolveLineContext } from "@/lib/line/user-org";
import { ensureLineDefaults } from "@/lib/line/defaults";
import {
  buildOcrConfirmFlex,
  buildSavedFlex,
} from "@/lib/line/flex/payment-confirm";
import { buildProjectPickerCarousel } from "@/lib/line/flex/project-picker";
import { parseTextExpense } from "@/lib/line/parse-text-expense";
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
  if (!event.replyToken || !event.source.userId) return;
  const rawText = (event.message?.text || "").trim();
  const lower = rawText.toLowerCase();

  // Help command — explicit, must NOT trigger expense parsing.
  if (lower === "help" || lower === "ช่วย" || lower === "?") {
    await replyMessage(event.replyToken, [
      text(
        "วิธีใช้งาน\n\n" +
          "1) ส่งรูปใบเสร็จ/ใบกำกับภาษี\n" +
          "   → ระบบ OCR → เลือกโปรเจกต์ → ยืนยัน → บันทึก\n\n" +
          "2) บันทึกแบบรวดเร็วด้วยข้อความ\n" +
          "   พิมพ์เช่น \"ค่ากาแฟ 100 บาท\" หรือ \"แท็กซี่ 250\"\n" +
          "   → เลือกโปรเจกต์ → ยืนยัน → บันทึก (ไม่ต้องแนบไฟล์)\n\n" +
          "จัดการรายจ่ายเต็มรูปแบบ:\n" +
          `${APP_BASE_URL}/expenses`,
      ),
    ]);
    return;
  }

  // Quick text expense — message contains a number → treat as expense entry.
  const parsed = parseTextExpense(rawText);
  if (parsed) {
    const lineUserId = event.source.userId;

    // Resolve user + org (same gating as media handler).
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

    // Show typing-dots animation (auto-dismisses on next push).
    await showLoadingAnimation(lineUserId, 30);

    // IMPORTANT: must `await` here, not `void`. On Vercel serverless,
    // returning before the picker push completes causes the runtime to
    // freeze the function and the Flex Carousel never reaches the user.
    await processTextExpenseAsync(lineUserId, parsed, ctx).catch((err) => {
      console.error("[LINE webhook] text expense processing failed:", err);
      void pushMessage(lineUserId, [
        text("ไม่สามารถบันทึกรายการได้\n" + (err instanceof Error ? err.message : "เกิดข้อผิดพลาด")),
      ]).catch(() => {});
    });
    return;
  }

  // Default — no number, not help.
  await replyMessage(event.replyToken, [
    text(
      "ส่งรูปใบเสร็จมาได้เลยค่ะ\n" +
        "หรือพิมพ์รายการพร้อมจำนวนเงิน เช่น \"ค่ากาแฟ 100 บาท\"\n" +
        "พิมพ์ \"help\" เพื่อดูวิธีใช้งาน",
    ),
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

  // Acknowledge with the typing-dots loading animation (replaces the old
  // text "received, reading..." reply so it feels like a person is typing).
  // Animation auto-dismisses when our first push message arrives.
  await showLoadingAnimation(lineUserId, 60);

  // Process OCR → then ask to select project
  await processMediaAsync(lineUserId, messageId, mimeType, ctx).catch((err) => {
    console.error("[LINE webhook] media processing failed:", err);
    void pushMessage(lineUserId, [
      text("ไม่สามารถอ่าน" + displayKind + "ได้\n" + (err instanceof Error ? err.message : "เกิดข้อผิดพลาด")),
    ]).catch(() => {});
  });
}

export const handleImage = handleMedia;

/**
 * Auto-correct OCR-extracted buyer info using org-level Config sheet.
 *
 * Config keys (all optional):
 *   BUYER_NAME      — canonical company name (e.g. "บริษัท อาร์โด จำกัด")
 *   BUYER_TAX_ID    — 13-digit tax ID
 *   BUYER_BRANCH    — "สำนักงานใหญ่" or "สาขา 00001"
 *   BUYER_ADDRESS   — full address
 *
 * Match priority: tax ID exact → fuzzy name (≥0.7). On match, all 4 fields are
 * overridden with Config values (Config is source of truth for own company).
 * Mutates the OCR result in-place.
 */
async function applyBuyerAutoCorrect(
  ocr: OcrParsedReceipt,
  sheets: { getConfigMap: () => Promise<Record<string, string>> },
): Promise<void> {
  const config = await sheets.getConfigMap();
  const cfgName = config.BUYER_NAME?.trim();
  const cfgTaxId = config.BUYER_TAX_ID?.trim();
  if (!cfgName && !cfgTaxId) return; // org hasn't configured buyer info — skip

  const taxIdMatches = !!(cfgTaxId && ocr.buyerTaxId && ocr.buyerTaxId === cfgTaxId);
  const nameMatch = cfgName && ocr.buyerName ? similarity(ocr.buyerName, cfgName) : 0;
  const nameFuzzyMatches = nameMatch >= 0.7;

  if (!taxIdMatches && !nameFuzzyMatches) return;

  const before = ocr.buyerName;
  if (cfgName) ocr.buyerName = cfgName;
  if (cfgTaxId) ocr.buyerTaxId = cfgTaxId;
  if (config.BUYER_BRANCH) ocr.buyerBranch = config.BUYER_BRANCH.trim();
  if (config.BUYER_ADDRESS) ocr.buyerAddress = config.BUYER_ADDRESS.trim();

  console.log(
    `[LINE] Buyer auto-corrected: "${before}" → "${ocr.buyerName}"` +
      ` (taxId match: ${taxIdMatches}, name score: ${nameMatch.toFixed(2)})`,
  );
}

async function processMediaAsync(
  lineUserId: string,
  messageId: string,
  mimeType: string,
  ctx: {
    user: {
      id: string;
      email?: string | null;
      lineUserId?: string | null;
      lineDisplayName?: string | null;
    };
    orgId: string;
    orgName: string;
  },
): Promise<void> {
  // Download + OCR
  const buffer = await getMessageContent(messageId);
  const ocr = await parseReceipt(buffer, mimeType, "receipt");

  // Auto-correct buyer info from Config sheet (graceful — silently skips if no Config rows).
  // OCR mis-reads Thai chars on small fonts (ร↔ซ, ด↔อ); the Config-stored
  // buyer name/taxId is the source of truth for the org's own company.
  const sheets = await getSheetsService(ctx.orgId);
  try {
    await applyBuyerAutoCorrect(ocr, sheets);
  } catch (err) {
    console.warn("[LINE] Buyer auto-correct skipped:", err);
  }

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

  // Fetch projects + filter to ones the user is assigned to.
  // Carousel shows max 12 bubbles per LINE spec.
  // Pass full user object so getEventIdsAssignedToUser can match against any
  // identifier the org might have entered in the sheet (id/email/lineUserId/displayName).
  const [events, assignedEventIds] = await Promise.all([
    sheets.getEvents(),
    sheets.getEventIdsAssignedToUser(ctx.user),
  ]);
  // Trim both sides of the EventID match — sheet entries often have trailing
  // whitespace from copy-paste that breaks Set membership.
  const assignedSet = new Set(assignedEventIds.map((id) => id.trim()));

  const activeAssignedEvents = events
    .filter(
      (e) =>
        (e.Status || "").trim().toLowerCase() === "active" &&
        assignedSet.has((e.EventID || "").trim()),
    )
    .slice(0, 12);

  console.log(
    `[LINE] Project picker: ${activeAssignedEvents.length} assigned-active` +
      ` (of ${events.length} events, ${assignedEventIds.length} assignments)` +
      ` — statuses: ${[...new Set(events.map((e) => JSON.stringify(e.Status || "")))].join(", ")}`,
  );

  // Build summary text (sent BEFORE the carousel so the user sees what was read)
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
  ].filter(Boolean).join("\n");

  // No assigned-active projects → fallback to default + confirm flex
  if (activeAssignedEvents.length === 0) {
    const defaults = await ensureLineDefaults(sheets);
    await prisma.lineDraft.update({
      where: { id: draft.id },
      data: { eventId: defaults.eventId, eventName: "LINE (ไม่ระบุโปรเจกต์)" } as Record<string, unknown>,
    });
    await pushMessage(lineUserId, [
      { type: "text", text: summaryLines },
      buildOcrConfirmFlex(draft, ocr, {
        orgName: ctx.orgName,
        projectName: "LINE (ไม่ระบุโปรเจกต์)",
        appBaseUrl: APP_BASE_URL,
      }),
    ]);
    return;
  }

  // Show summary text first, then the carousel — NO Quick Reply (removes the
  // shortcut bar that confused users).
  await pushMessage(lineUserId, [
    { type: "text", text: summaryLines + "\n\nกรุณาเลือกโปรเจกต์:" },
    buildProjectPickerCarousel(
      draft.id,
      activeAssignedEvents.map((ev) => ({
        eventId: ev.EventID,
        eventName: ev.EventName || "ไม่ระบุ",
      })),
    ),
  ]);
}

// =====================================================
// TEXT QUICK ENTRY — pipe through the same picker + confirm UX as OCR
// =====================================================
async function processTextExpenseAsync(
  lineUserId: string,
  parsed: { amount: number; description: string },
  ctx: {
    user: {
      id: string;
      email?: string | null;
      lineUserId?: string | null;
      lineDisplayName?: string | null;
    };
    orgId: string;
    orgName: string;
  },
): Promise<void> {
  // Build a minimal OcrParsedReceipt from the user's typed text. Vendor info
  // is intentionally left blank — user edits in web app if needed.
  const today = new Date().toISOString().slice(0, 10);
  const ocr: OcrParsedReceipt = {
    vendorName: null,
    vendorAddress: null,
    vendorTaxId: null,
    vendorBranch: null,
    vendorPhone: null,
    buyerName: null,
    buyerAddress: null,
    buyerTaxId: null,
    buyerBranch: null,
    invoiceNumber: null,
    documentType: "receipt",
    documentDate: today,
    dueDate: null,
    subtotal: parsed.amount,
    vatAmount: null,
    withholdingTax: null,
    totalAmount: parsed.amount,
    hasVat: false,
    items: [],
    confidence: 1, // user-typed → no OCR uncertainty
    rawText: parsed.description,
    provider: "manual",
  };

  // Save draft using a synthetic imageMessageId so the same LineDraft schema
  // can be reused. confirmDraftAsync detects the "text:" prefix and skips
  // the LINE content download + Drive upload.
  const expiresAt = new Date(Date.now() + DRAFT_TTL_HOURS * 3600 * 1000);
  const draft = await prisma.lineDraft.create({
    data: {
      lineUserId,
      userId: ctx.user.id,
      orgId: ctx.orgId,
      imageMessageId: `text:${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      mimeType: "text/plain",
      ocrJson: ocr as unknown as object,
      expiresAt,
    },
  });

  // Same picker logic as processMediaAsync.
  const sheets = await getSheetsService(ctx.orgId);
  const [events, assignedEventIds] = await Promise.all([
    sheets.getEvents(),
    sheets.getEventIdsAssignedToUser(ctx.user),
  ]);
  const assignedSet = new Set(assignedEventIds.map((id) => id.trim()));
  const activeAssignedEvents = events
    .filter(
      (e) =>
        (e.Status || "").trim().toLowerCase() === "active" &&
        assignedSet.has((e.EventID || "").trim()),
    )
    .slice(0, 12);

  console.log(
    `[LINE] (text) Project picker: ${activeAssignedEvents.length} assigned-active` +
      ` (of ${events.length} events, ${assignedEventIds.length} assignments)`,
  );

  const fmtTotal = parsed.amount.toLocaleString("th-TH", { minimumFractionDigits: 2 });
  const summaryLines = [
    `บันทึกรายการ`,
    ``,
    `${parsed.description}`,
    `฿${fmtTotal}`,
    `วันที่: ${today}`,
  ].join("\n");

  if (activeAssignedEvents.length === 0) {
    const defaults = await ensureLineDefaults(sheets);
    await prisma.lineDraft.update({
      where: { id: draft.id },
      data: { eventId: defaults.eventId, eventName: "LINE (ไม่ระบุโปรเจกต์)" } as Record<string, unknown>,
    });
    await pushMessage(lineUserId, [
      { type: "text", text: summaryLines },
      buildOcrConfirmFlex(draft, ocr, {
        orgName: ctx.orgName,
        projectName: "LINE (ไม่ระบุโปรเจกต์)",
        appBaseUrl: APP_BASE_URL,
      }),
    ]);
    return;
  }

  await pushMessage(lineUserId, [
    { type: "text", text: summaryLines + "\n\nกรุณาเลือกโปรเจกต์:" },
    buildProjectPickerCarousel(
      draft.id,
      activeAssignedEvents.map((ev) => ({
        eventId: ev.EventID,
        eventName: ev.EventName || "ไม่ระบุ",
      })),
    ),
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
    // Try to find existing payee — TaxID exact match wins, otherwise fuzzy on name.
    // Fuzzy match recovers from OCR misreads of Thai chars (ร↔ซ, ด↔อ, etc).
    const payees = await sheets.getPayees();
    const matchByTax = ocr.vendorTaxId
      ? payees.find((p) => p.TaxID === ocr.vendorTaxId)
      : null;

    let matched = matchByTax;
    let fuzzyScore = 0;
    if (!matched) {
      const fuzzy = findBestMatch(
        ocr.vendorName,
        payees,
        (p) => p.PayeeName,
        { threshold: 0.7 },
      );
      if (fuzzy) {
        matched = fuzzy.item;
        fuzzyScore = fuzzy.score;
        console.log(
          `[LINE] Vendor fuzzy match: "${ocr.vendorName}" → "${fuzzy.item.PayeeName}" (score ${fuzzyScore.toFixed(2)})`,
        );
        // Override vendorName on the OCR result so downstream code, the saved
        // draft and the Flex card all see the canonical name.
        ocr.vendorName = fuzzy.item.PayeeName;
      }
    }

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

  // ----- Receipt source: text entry vs image/pdf -----
  // Text entries skip Drive download/upload entirely — there's no file.
  const isTextEntry = draft.imageMessageId.startsWith("text:");

  const today = new Date().toISOString().slice(0, 10);
  const paymentId = GoogleSheetsService.generateId("PMT");

  let receiptUrl = "";
  if (!isTextEntry) {
    // Re-download content from LINE
    const buffer = await getMessageContent(draft.imageMessageId);

    // Upload to Google Drive
    const ext = draft.mimeType === "application/pdf" ? "pdf"
      : draft.mimeType === "image/png" ? "png"
      : draft.mimeType === "image/webp" ? "webp"
      : "jpg";

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
    receiptUrl = upload.webViewLink;

    // Persist Drive file refs back onto the draft (only when we uploaded one).
    await prisma.lineDraft.update({
      where: { id: draft.id },
      data: {
        driveFileId: upload.fileId,
        driveFileUrl: upload.webViewLink,
      },
    });
  } else {
    // Mark explicitly so audit/analytics can distinguish manual entries.
    console.log(`[LINE] Confirming text-entry draft ${draft.id} — skipping Drive upload`);
  }

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

  // Build Description — text entries put the user's typed message verbatim.
  const paymentDescription = isTextEntry
    ? `${ocr.rawText || "บันทึกจาก LINE"} (LINE - ข้อความ)`
    : ocr.vendorName
      ? `${ocr.vendorName}${ocr.invoiceNumber ? " - " + ocr.invoiceNumber : ""} (LINE)`
      : "บันทึกจาก LINE";

  const notes = isTextEntry
    ? `Manual text entry | LINE draft ${draft.id}`
    : `OCR confidence ${Math.round((ocr.confidence ?? 0) * 100)}% | LINE draft ${draft.id}`;

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
    Description: paymentDescription,
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
    ReceiptURL: receiptUrl,
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
    Notes: notes,
    CreatedAt: now,
    CreatedBy: "LINE OA",
    CreatedByUserId: draft.userId,
    UpdatedAt: now,
  });

  // Mark draft confirmed (drive fields already saved earlier for image flow).
  await prisma.lineDraft.update({
    where: { id: draft.id },
    data: { status: "confirmed" },
  });

  // Audit log — distinguish OCR vs manual text entry
  const auditPrefix = isTextEntry ? "LINE Text" : "LINE OCR";
  const auditLabel = isTextEntry
    ? (ocr.rawText?.slice(0, 60) || "")
    : (ocr.vendorName || "");

  await prisma.auditLog.create({
    data: {
      orgId: draft.orgId,
      userId: draft.userId,
      action: "create",
      entityType: "payment",
      entityRef: paymentId,
      summary: `${auditPrefix}: ${auditLabel} ฿${totalAmount} | ${eventName || "ไม่ระบุโปรเจกต์"}`,
    },
  });

  // Notify user — saved Flex card. For text entries, use the typed message
  // (truncated) as the "vendor" label so the user recognizes the entry.
  const savedLabel = isTextEntry
    ? (ocr.rawText?.slice(0, 40) || "บันทึกจาก LINE")
    : (ocr.vendorName || "บันทึกจาก LINE");

  await pushMessage(draft.lineUserId, [
    buildSavedFlex({
      paymentId,
      vendor: savedLabel,
      amount: totalAmount,
      projectName: eventName || "ไม่ระบุ",
      webUrl: `${APP_BASE_URL}/expenses`,
    }),
  ]);
}
