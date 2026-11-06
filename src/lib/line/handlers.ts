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
import { parseReceipt, OcrFailedError, isTimeoutError, type OcrParsedReceipt } from "@/lib/ocr";
import { findBestMatch, similarity } from "@/lib/ocr/text-similarity";
import {
  resolveLineContext,
  resolveGroupContext,
  getUserActiveOrgs,
  type LineUserContext,
  type GroupResolveError,
} from "@/lib/line/user-org";
import { ensureLineDefaults } from "@/lib/line/defaults";
import {
  SAVING_PREFIX,
  SAVING_STALE_MS,
  savingStatus,
  isSavingStatus,
  isSavingStale,
  savingClaimedAt,
} from "@/lib/line/draft-status";
import {
  buildOcrConfirmFlex,
  buildSavedFlex,
} from "@/lib/line/flex/payment-confirm";
import { buildProjectPickerCarousel } from "@/lib/line/flex/project-picker";
import { buildMenuFlex } from "@/lib/line/flex/menu";
import {
  parseTextExpense,
  looksLikeIncome,
  hasDescriptionWord,
} from "@/lib/line/parse-text-expense";
import { checkQuotaOnly, incrementAndCheckQuota } from "@/server/lib/usage";
import { MAX_FILE_SIZES } from "@/lib/security/file-validation";
import { todayBangkok } from "@/lib/utils/date";
import {
  GoogleSheetsService,
  SHEET_TABS,
} from "@/server/services/google-sheets.service";
import { getSheetsService, getDriveService } from "@/server/lib/sheets-context";
import { calculatePayment } from "@/lib/calculations";
import { safeAuditLog } from "@/server/lib/audit";

const APP_BASE_URL =
  process.env.APP_BASE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  "http://localhost:3000";

const DRAFT_TTL_HOURS = 24;

/** ปัดทศนิยม 2 ตำแหน่ง (สูตรเดียวกับ calculations.ts ซึ่งไม่ได้ export) */
const roundTwo = (v: number): number => Math.round(v * 100) / 100;

const THAI_RE = /[\u0E00-\u0E7F]/;

/**
 * LINE-24: ข้อความ error ที่ push ให้ผู้ใช้ต้องเป็นภาษาไทยสั้น ๆ เสมอ
 * - OcrFailedError → message ภาษาไทยอยู่แล้ว ("อ่านใบเสร็จนานเกินไป…" / "อ่านใบเสร็จไม่สำเร็จ…")
 * - TimeoutError/AbortError อื่น (LINE content, Google API) → "ใช้เวลานานเกินไป…"
 * - error ของเราที่เป็นภาษาไทย (เช่น sheets-context "กรุณาเชื่อมต่อ Google ใหม่") → ส่งตามเดิม
 * - อย่างอื่น (ข้อความอังกฤษดิบจาก API/stack) → fallback; รายละเอียดอยู่ใน console.error ของผู้เรียกแล้ว
 */
function userFacingError(err: unknown, fallback = "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง"): string {
  if (err instanceof OcrFailedError) return err.message;
  if (isTimeoutError(err)) return "ใช้เวลานานเกินไป กรุณาลองใหม่อีกครั้ง";
  const msg = err instanceof Error ? err.message : "";
  return msg && THAI_RE.test(msg) ? msg : fallback;
}

// คำที่ถือเป็นคำสั่งเปิดเมนู (case-insensitive — รับ lower มาแล้ว)
const MENU_WORDS = new Set(["เมนู", "เมนูหลัก", "menu", "/menu", "/เมนู", "mainmenu"]);

/**
 * ตรวจว่าข้อความ (lowercased, trimmed) เป็นคำสั่งเปิดเมนูไหม
 * - ตรงเป๊ะ เช่น "menu", "เมนู"
 * - หรือกลุ่มที่ @mention บอท เช่น "@aim expense menu" → ดูเป็น token (ข้อความสั้น <=3 คำ
 *   ที่มีคำเมนูอยู่) เพื่อไม่ false-positive กับประโยคยาว เช่น "ค่า menu อาหาร 100"
 */
function isMenuTrigger(lower: string): boolean {
  if (MENU_WORDS.has(lower)) return true;
  const tokens = lower.split(/\s+/).filter(Boolean);
  return tokens.length <= 3 && tokens.some((t) => MENU_WORDS.has(t));
}

// ---------- LINE Event Types ----------
export interface LineWebhookEvent {
  type: string;
  /** Unique per event — LINE reuses it on redelivery (dedupe key, LINE-05). */
  webhookEventId?: string;
  deliveryContext?: { isRedelivery?: boolean };
  replyToken?: string;
  source: { userId?: string; type: string; groupId?: string; roomId?: string };
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
// ขนาดไฟล์สูงสุดที่รับจาก LINE — ใช้ค่าเดียวกับ upload ทางเว็บ (10 MB)
const MAX_LINE_FILE_SIZE = Math.max(...Object.values(MAX_FILE_SIZES));

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
// JOIN — OA ถูกเชิญเข้ากลุ่ม → ส่งลิงก์ผูกกลุ่มกับองค์กร
// =====================================================
export async function handleJoin(event: LineWebhookEvent): Promise<void> {
  if (!event.replyToken) return;
  const groupId = event.source.groupId || event.source.roomId;
  if (!groupId) return;

  // Already bound? — greet accordingly.
  const existing = await prisma.lineGroup.findUnique({
    where: { groupId },
    select: { orgId: true, org: { select: { name: true } } },
  });
  if (existing) {
    await replyMessage(event.replyToken, [
      text(
        `กลุ่มนี้เชื่อมกับ "${existing.org.name}" แล้วค่ะ\n` +
          `ส่งรูปใบเสร็จ/พิมพ์รายการในกลุ่มได้เลย ระบบจะบันทึกเข้าบริษัทนี้`,
      ),
    ]);
    return;
  }

  const bindUrl = `${APP_BASE_URL}/line-groups/bind?g=${encodeURIComponent(groupId)}`;
  await replyMessage(event.replyToken, [
    text(
      "สวัสดีค่ะ 👋 ขอบคุณที่เชิญ Aim Expense เข้ากลุ่ม\n\n" +
        "ผู้ดูแล (Admin) กรุณาเปิดลิงก์เพื่อเลือกบริษัทที่จะเชื่อมกับกลุ่มนี้:\n" +
        bindUrl +
        "\n\nหลังเชื่อมแล้ว สมาชิกในกลุ่มส่งรูปใบเสร็จ/พิมพ์รายการได้เลย ระบบจะบันทึกเข้าบริษัทที่เลือก",
    ),
  ]);
}

// =====================================================
// LEAVE — OA ถูกนำออกจากกลุ่ม → ยกเลิกการผูก
// =====================================================
export async function handleLeave(event: LineWebhookEvent): Promise<void> {
  const groupId = event.source.groupId || event.source.roomId;
  if (!groupId) return;
  await prisma.lineGroup.deleteMany({ where: { groupId } });
}

/**
 * Resolve the group's bound org; on failure reply with the right Thai note
 * (bind link, or "re-bind" when the binding admin left the org) and return null.
 */
async function resolveGroupOrReply(
  groupId: string | undefined,
  replyToken: string,
): Promise<LineUserContext | null> {
  const gctx = groupId
    ? await resolveGroupContext(groupId)
    : ({ error: "unbound" } as GroupResolveError);
  if (!("error" in gctx)) return gctx;
  if (gctx.error === "binder_inactive") {
    await replyMessage(replyToken, [
      text(
        "ผู้ดูแลที่เชื่อมกลุ่มนี้ไม่ได้เป็นสมาชิกบริษัทแล้ว\n" +
          "ผู้ดูแล (Admin) คนปัจจุบันกรุณาเชื่อมกลุ่มใหม่ที่:\n" +
          `${APP_BASE_URL}/line-groups`,
      ),
    ]);
    return null;
  }
  const bindUrl = `${APP_BASE_URL}/line-groups/bind?g=${encodeURIComponent(groupId || "")}`;
  await replyMessage(replyToken, [
    text("กลุ่มนี้ยังไม่ได้เชื่อมกับบริษัท\nผู้ดูแล (Admin) เปิดลิงก์เพื่อเชื่อม:\n" + bindUrl),
  ]);
  return null;
}

// =====================================================
// TEXT
// =====================================================
export async function handleText(event: LineWebhookEvent): Promise<void> {
  if (!event.replyToken) return;
  const isGroup = event.source.type === "group" || event.source.type === "room";
  const groupId = event.source.groupId || event.source.roomId;
  if (!isGroup && !event.source.userId) return;
  const rawText = (event.message?.text || "").trim();
  const lower = rawText.toLowerCase();

  // Menu trigger — works in both group and 1-1: show the 3 rich-menu links.
  // ต้องเช็คก่อน group early-return เพื่อให้พิมพ์ในกลุ่มแล้วเมนูเด้ง
  // case-insensitive (lower) + รองรับ @mention บอทในกลุ่ม (เช่น "@Aim Expense menu")
  // โดยดูเป็น token: ข้อความสั้น (<=3 คำ) ที่มีคำว่า menu/เมนู → ถือเป็น trigger
  if (isMenuTrigger(lower)) {
    await replyMessage(event.replyToken, [buildMenuFlex(APP_BASE_URL)]);
    return;
  }

  // GROUP: only react to expense-like text (with a number) — stay silent on
  // ordinary group chatter so the bot doesn't spam the conversation.
  if (isGroup) {
    // strict: ยอดต้องมีหน่วย (บาท/฿) หรือเป็นเลขท้ายข้อความ + ต้องมีคำอธิบาย
    // อย่างน้อย 1 คำ — กัน "ประชุม 3 โมง" / "302" ถูกบันทึกเป็นรายจ่ายเงียบ ๆ (LINE-02)
    const parsedGroup = parseTextExpense(rawText, { strict: true });
    if (!parsedGroup || !hasDescriptionWord(rawText)) return;
    // Income-looking text must not be booked as an expense.
    if (looksLikeIncome(rawText)) {
      await replyMessage(event.replyToken, [
        text(
          "ดูเหมือนเป็นรายรับนะคะ 💰\n" +
            "การบันทึกรายรับทำผ่านเว็บ: " +
            APP_BASE_URL +
            "/billings\n(แชทกลุ่มบันทึกได้เฉพาะรายจ่าย)"
        ),
      ]);
      return;
    }
    const gctx = await resolveGroupOrReply(groupId, event.replyToken);
    if (!gctx) return;
    await processTextExpenseAsync(groupId!, parsedGroup, gctx, {
      autoSave: true,
      eventId: gctx.groupEventId,
      eventName: gctx.groupEventName,
    }).catch((err) => {
      console.error("[LINE webhook] group text failed:", err);
      void pushMessage(groupId!, [
        text("ไม่สามารถบันทึกรายการได้\n" + userFacingError(err)),
      ]).catch(() => {});
    });
    return;
  }

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

  // Income-looking message must not be booked as an expense (chat records
  // expenses only). Point the user at the income flow instead.
  if (looksLikeIncome(rawText)) {
    await replyMessage(event.replyToken, [
      text(
        'ดูเหมือนเป็น "รายรับ" นะคะ 💰\n' +
          "บันทึกรายรับได้ที่เมนูด้านล่าง หรือผ่านเว็บ:\n" +
          APP_BASE_URL +
          "/billings\n\n" +
          '(แชทบันทึกได้เฉพาะรายจ่าย เช่น "ค่ากาแฟ 100")'
      ),
    ]);
    return;
  }

  // Quick text expense — message contains a number → treat as expense entry.
  const parsed = parseTextExpense(rawText);
  if (parsed) {
    const lineUserId = event.source.userId;
    if (!lineUserId) return;

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
        text("ไม่สามารถบันทึกรายการได้\n" + userFacingError(err)),
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
  if (!event.replyToken || !event.message?.id) return;

  const isGroup = event.source.type === "group" || event.source.type === "room";
  const groupId = event.source.groupId || event.source.roomId;
  const lineUserId = event.source.userId;
  if (!isGroup && !lineUserId) return;
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

  // ไฟล์ใหญ่เกินไป → ไม่โหลดเข้า OCR/หน่วยความจำ (LINE ส่ง fileSize มาเฉพาะ message type=file)
  if ((event.message.fileSize ?? 0) > MAX_LINE_FILE_SIZE) {
    await replyMessage(event.replyToken, [
      text(`ไฟล์ใหญ่เกิน ${Math.round(MAX_LINE_FILE_SIZE / 1024 / 1024)} MB กรุณาส่งไฟล์ที่เล็กกว่านี้ค่ะ`),
    ]);
    return;
  }

  // ----- GROUP: resolve bound org → auto-save (no picker) -----
  if (isGroup) {
    const gctx = await resolveGroupOrReply(groupId, event.replyToken);
    if (!gctx) return;
    await processMediaAsync(groupId!, messageId, mimeType, gctx, {
      autoSave: true,
      eventId: gctx.groupEventId,
      eventName: gctx.groupEventName,
    }).catch((err) => {
      console.error("[LINE webhook] group media failed:", err);
      void pushMessage(groupId!, [
        text("ไม่สามารถอ่าน" + displayKind + "ได้\n" + userFacingError(err)),
      ]).catch(() => {});
    });
    return;
  }

  // ----- 1-1: resolve user + org -----
  const ctx = await resolveLineContext(lineUserId!);
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
  await showLoadingAnimation(lineUserId!, 60);

  // Process OCR → then ask to select project
  await processMediaAsync(lineUserId!, messageId, mimeType, ctx).catch((err) => {
    console.error("[LINE webhook] media processing failed:", err);
    void pushMessage(lineUserId!, [
      text("ไม่สามารถอ่าน" + displayKind + "ได้\n" + userFacingError(err)),
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

type LineUserLike = {
  id: string;
  email?: string | null;
  lineUserId?: string | null;
  lineDisplayName?: string | null;
};

/** Build the human-readable summary shown before the picker (OCR or text entry). */
function buildSummaryFromOcr(ocr: OcrParsedReceipt): string {
  const total = ocr.totalAmount ?? ocr.subtotal ?? 0;
  const fmtTotal = total.toLocaleString("th-TH", { minimumFractionDigits: 2 });
  const docDate = ocr.documentDate || "";
  if (ocr.provider === "manual") {
    return [`บันทึกรายการ`, ``, ocr.rawText || "", `฿${fmtTotal}`, docDate ? `วันที่: ${docDate}` : ""]
      .filter(Boolean)
      .join("\n");
  }
  const vendor = ocr.vendorName || "ไม่ระบุ";
  const docNo = ocr.invoiceNumber || "";
  const docTypeLabel =
    ocr.documentType === "tax_invoice" ? "ใบกำกับภาษี"
    : ocr.documentType === "receipt" ? "ใบเสร็จรับเงิน"
    : ocr.documentType === "invoice" ? "ใบแจ้งหนี้"
    : ocr.documentType === "quotation" ? "ใบเสนอราคา"
    : "เอกสาร";
  return [
    `อ่านเสร็จแล้ว`,
    ``,
    vendor,
    `฿${fmtTotal}`,
    docNo ? `${docTypeLabel}: ${docNo}` : docTypeLabel,
    docDate ? `วันที่: ${docDate}` : "",
    ocr.vendorTaxId ? `Tax ID: ${ocr.vendorTaxId}` : "",
    ocr.buyerName ? `ผู้ซื้อ: ${ocr.buyerName}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Quick-reply message asking which company to book the expense into (multi-org users). */
function buildOrgPickerMessage(
  draftId: string,
  orgs: { orgId: string; orgName: string }[],
  summaryText: string,
): LineMessage {
  return {
    type: "text",
    text: summaryText + "\n\nบันทึกเข้าบริษัทไหน?",
    quickReply: {
      items: orgs.slice(0, 13).map((o) => ({
        type: "action",
        action: {
          type: "postback",
          label: o.orgName.slice(0, 20),
          data: `action=select_org&id=${draftId}&orgId=${o.orgId}`,
          displayText: `บันทึกเข้า ${o.orgName}`,
        },
      })),
    },
  };
}

/**
 * Push the project picker (or auto-default + confirm card if the user has no
 * assigned active projects) for a given org. Shared by media/text entry + the
 * post-company-selection step.
 */
async function pushProjectPicker(
  pushTarget: string,
  draftId: string,
  org: { orgId: string; orgName: string },
  user: LineUserLike,
  ocr: OcrParsedReceipt,
  summaryText: string,
): Promise<void> {
  const sheets = await getSheetsService(org.orgId);
  const events = await sheets.getEvents();

  // Only project-scoped roles (project_manager) are limited to events they're
  // explicitly assigned to — admin/owner/manager/accountant/staff see every
  // active project, matching the web app's scopedEventIds() behaviour. The
  // picker used to filter by assignment for ALL roles, so a freshly-created
  // project (which has no EventAssignments row yet) never showed up in 1-1
  // chat — not even for the owner who created it.
  const pickerUserId = typeof user === "string" ? null : user.id || null;
  const membership = pickerUserId
    ? await prisma.orgMember.findUnique({
        where: { orgId_userId: { orgId: org.orgId, userId: pickerUserId } },
        select: { role: true },
      })
    : null;
  const isProjectScoped = membership?.role === "project_manager";

  // "active" = anything not explicitly completed/cancelled (blank counts as
  // active, same as the dashboard / bind page).
  let pickable = events.filter((e) => {
    const s = (e.Status || "active").trim().toLowerCase();
    return s !== "completed" && s !== "cancelled";
  });
  if (isProjectScoped) {
    const assignedEventIds = await sheets.getEventIdsAssignedToUser(user);
    const assignedSet = new Set(assignedEventIds.map((id) => id.trim()));
    pickable = pickable.filter((e) =>
      assignedSet.has((e.EventID || "").trim()),
    );
  }
  const activeAssignedEvents = pickable.slice(0, 12);

  if (activeAssignedEvents.length === 0) {
    const defaults = await ensureLineDefaults(sheets, org.orgId);
    await prisma.lineDraft.update({
      where: { id: draftId },
      data: { eventId: defaults.eventId, eventName: "LINE (ไม่ระบุโปรเจกต์)" } as Record<string, unknown>,
    });
    await pushMessage(pushTarget, [
      { type: "text", text: summaryText },
      buildOcrConfirmFlex({ id: draftId }, ocr, {
        orgName: org.orgName,
        projectName: "LINE (ไม่ระบุโปรเจกต์)",
        appBaseUrl: APP_BASE_URL,
      }),
    ]);
    return;
  }

  await pushMessage(pushTarget, [
    { type: "text", text: summaryText + "\n\nกรุณาเลือกโปรเจกต์:" },
    buildProjectPickerCarousel(
      draftId,
      activeAssignedEvents.map((ev) => ({
        eventId: ev.EventID,
        eventName: ev.EventName || "ไม่ระบุ",
      })),
    ),
  ]);
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
  opts?: { autoSave?: boolean; eventId?: string | null; eventName?: string | null },
): Promise<void> {
  // โควตา OCR รายเดือน — เช็กก่อนดาวน์โหลด (ลำดับเดียวกับ /api/ocr/receipt) (LINE-01)
  const quota = await checkQuotaOnly(ctx.orgId, "ocr");
  if (!quota.ok) {
    await pushMessage(lineUserId, [
      text(
        `โควตา OCR เดือนนี้หมดแล้ว (${quota.current}/${quota.limit}) — อัปเกรดได้ที่ ${APP_BASE_URL}/account/billing`,
      ),
    ]);
    return;
  }

  // Download + OCR
  const buffer = await getMessageContent(messageId);
  const ocr = await parseReceipt(buffer, mimeType, "receipt");

  // ตัดเครดิตหลัง OCR สำเร็จเท่านั้น (OCR ล้มเหลวไม่เสียเครดิต)
  // LINE-23: การเพิ่มเป็น atomic (`count < limit`) — สแกนพร้อมกันหลายใบจนเต็มพอดี → ok=false
  // ต้องไม่สร้าง draft/แถว (ค่า OCR ที่จ่ายไปแล้วยอมเสีย ดีกว่าให้ใช้เกินโควตา)
  const usage = await incrementAndCheckQuota(ctx.orgId, "ocr");
  if (!usage.ok) {
    console.warn(
      `[LINE] OCR quota exhausted after scan org=${ctx.orgId} (${usage.current}/${usage.limit}) — draft not created (LINE-23)`,
    );
    await pushMessage(lineUserId, [
      text(
        `โควตา OCR เดือนนี้หมดแล้ว (${usage.current}/${usage.limit}) — ยังไม่ได้บันทึกรายการค่ะ\nอัปเกรดได้ที่ ${APP_BASE_URL}/account/billing`,
      ),
    ]);
    return;
  }

  // กลุ่ม: บันทึกอัตโนมัติเฉพาะใบเสร็จที่อ่านได้ชัด (มีร้าน + ยอด > 0) —
  // รูปอื่น ๆ (มีม/รูปอาหาร) ต้องไม่กลายเป็นแถวรายจ่าย (LINE-02)
  if (opts?.autoSave) {
    const groupTotal = ocr.totalAmount ?? ocr.subtotal ?? 0;
    if (!ocr.vendorName || !(groupTotal > 0)) {
      await pushMessage(lineUserId, [
        text("อ่านใบเสร็จไม่ได้ (ไม่พบชื่อร้านหรือยอดเงิน) — ยังไม่ได้บันทึกรายการค่ะ"),
      ]);
      return;
    }
  }

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

  // Group flow: no interactive picker (groups are noisy + multi-user). Auto-save
  // into the group's bound project (or the default LINE project if none set),
  // then push the saved card to the group.
  if (opts?.autoSave) {
    let eventId = opts.eventId || "";
    let eventName = opts.eventName || "LINE (กลุ่ม)";
    if (!eventId) {
      const defaults = await ensureLineDefaults(sheets, ctx.orgId);
      eventId = defaults.eventId;
      eventName = "LINE (กลุ่ม)";
    }
    await prisma.lineDraft.update({
      where: { id: draft.id },
      data: { eventId, eventName } as Record<string, unknown>,
    });
    await confirmDraftAsync({
      id: draft.id,
      lineUserId,
      userId: ctx.user.id,
      orgId: ctx.orgId,
      imageMessageId: messageId,
      mimeType,
      ocrJson: ocr,
    });
    return;
  }

  // Multi-org: ask which company to book into first (choice remembered as the
  // default). Single org → straight to the project picker (unchanged behaviour).
  const summaryText = buildSummaryFromOcr(ocr);
  const orgs = await getUserActiveOrgs(ctx.user.id);
  if (orgs.length > 1) {
    await pushMessage(lineUserId, [buildOrgPickerMessage(draft.id, orgs, summaryText)]);
    return;
  }
  await pushProjectPicker(
    lineUserId,
    draft.id,
    { orgId: ctx.orgId, orgName: ctx.orgName },
    ctx.user,
    ocr,
    summaryText,
  );
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
  opts?: { autoSave?: boolean; eventId?: string | null; eventName?: string | null },
): Promise<void> {
  // Build a minimal OcrParsedReceipt from the user's typed text. Vendor info
  // is intentionally left blank — user edits in web app if needed.
  const today = todayBangkok();
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

  // Group flow: auto-save into the group's bound project (or default), push to group.
  if (opts?.autoSave) {
    let eventId = opts.eventId || "";
    let eventName = opts.eventName || "LINE (กลุ่ม)";
    if (!eventId) {
      const sheetsForDefault = await getSheetsService(ctx.orgId);
      const defaults = await ensureLineDefaults(sheetsForDefault, ctx.orgId);
      eventId = defaults.eventId;
      eventName = "LINE (กลุ่ม)";
    }
    await prisma.lineDraft.update({
      where: { id: draft.id },
      data: { eventId, eventName } as Record<string, unknown>,
    });
    await confirmDraftAsync({
      id: draft.id,
      lineUserId,
      userId: ctx.user.id,
      orgId: ctx.orgId,
      imageMessageId: draft.imageMessageId,
      mimeType: "text/plain",
      ocrJson: ocr,
    });
    return;
  }

  // Multi-org: ask which company first; single org → project picker.
  const summaryText = buildSummaryFromOcr(ocr);
  const orgs = await getUserActiveOrgs(ctx.user.id);
  if (orgs.length > 1) {
    await pushMessage(lineUserId, [buildOrgPickerMessage(draft.id, orgs, summaryText)]);
    return;
  }
  await pushProjectPicker(
    lineUserId,
    draft.id,
    { orgId: ctx.orgId, orgName: ctx.orgName },
    ctx.user,
    ocr,
    summaryText,
  );
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
  if (!draft) {
    // บันทึก/ยกเลิก/หมดอายุ = ลบแถวทิ้ง (LINE-06) → ปุ่มบนการ์ดเก่ามาถึงตรงนี้ ไม่ใช่ "ไม่พบรายการ" (LINE-22)
    await replyMessage(event.replyToken, [text("รายการนี้บันทึกหรือยกเลิกไปแล้ว หรือหมดอายุ")]);
    return;
  }
  if (draft.lineUserId !== event.source.userId) {
    await replyMessage(event.replyToken, [text("ไม่ใช่รายการของคุณ")]);
    return;
  }
  if (isSavingStatus(draft.status)) {
    // LINE-25: function ตายกลางทาง → draft ค้าง saving ตลอดไป ผู้ใช้กดอะไรไม่ได้จนหมดอายุ
    // เวลาที่ claim ฝังอยู่ใน status ("saving:<ms>", แถวเก่าใช้ createdAt — ดู draft-status.ts)
    // ค้างเกิน 3 นาที → คืนเป็น pending แล้วทำ action ต่อ (บันทึกจริงใช้ < 30 วิ จึงไม่ชน LINE-04)
    if (!isSavingStale(draft, SAVING_STALE_MS)) {
      await replyMessage(event.replyToken, [text("รายการนี้กำลังบันทึกอยู่ กรุณารอสักครู่")]);
      return;
    }
    // guard ด้วยค่า status ที่เห็น — สอง request ที่เจอ draft ค้างพร้อมกัน มีแค่คนเดียวที่ reset ได้
    const reset = await prisma.lineDraft.updateMany({
      where: { id: draftId, status: draft.status },
      data: { status: "pending" },
    });
    if (reset.count === 0) {
      await replyMessage(event.replyToken, [text("รายการนี้กำลังบันทึกอยู่ กรุณารอสักครู่")]);
      return;
    }
    console.warn(
      `[LINE] draft ${draftId} stuck in saving since ${new Date(savingClaimedAt(draft)).toISOString()} — reset to pending (LINE-25)`,
    );
    draft.status = "pending";
  } else if (draft.status !== "pending") {
    // ไม่มี confirmed/cancelled แล้ว (ลบแถวแทน) — ค่าอื่นถือว่าจบไปแล้ว
    await replyMessage(event.replyToken, [text("รายการนี้บันทึกหรือยกเลิกไปแล้ว หรือหมดอายุ")]);
    return;
  }
  if (draft.expiresAt < new Date()) {
    // ลบทิ้งเลย — draft เก็บ ocrJson ไว้ชั่วคราวเท่านั้น (LINE-06)
    await prisma.lineDraft.deleteMany({ where: { id: draftId } });
    await replyMessage(event.replyToken, [text("รายการหมดอายุแล้ว กรุณาส่งรูปใหม่")]);
    return;
  }

  // --- SELECT COMPANY (multi-org users) → then show project picker ---
  if (action === "select_org") {
    const orgId = params.get("orgId") || "";
    const member = await prisma.orgMember.findFirst({
      where: { userId: draft.userId, orgId, status: "active" },
      include: { org: { select: { name: true } } },
    });
    if (!member) {
      await replyMessage(event.replyToken, [
        text("ไม่พบบริษัท หรือคุณไม่ได้เป็นสมาชิก"),
      ]);
      return;
    }
    // Point the draft at the chosen org + remember it as the user's default.
    await prisma.lineDraft.update({ where: { id: draftId }, data: { orgId } });
    await prisma.user.update({
      where: { id: draft.userId },
      data: { activeOrgId: orgId },
    });

    const user = await prisma.user.findUnique({
      where: { id: draft.userId },
      select: { id: true, email: true, lineUserId: true, lineDisplayName: true },
    });
    const ocrSel = draft.ocrJson as unknown as OcrParsedReceipt;
    const summaryText = buildSummaryFromOcr(ocrSel);
    await replyMessage(event.replyToken, [text(`บันทึกเข้า: ${member.org.name}`)]);
    if (user) {
      await pushProjectPicker(
        event.source.userId!,
        draftId,
        { orgId, orgName: member.org.name },
        user,
        ocrSel,
        summaryText,
      );
    }
    return;
  }

  // --- SELECT PROJECT ---
  if (action === "select_project") {
    const eventId = params.get("eventId") || "";
    // URLSearchParams ถอด encode ให้แล้ว — ถอดซ้ำทำให้ชื่อที่มี "%" พัง (LINE-07)
    const eventName = params.get("eventName") || "";

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
    // ยกเลิก = ไม่ต้องเก็บ draft ต่อ (LINE-06)
    await prisma.lineDraft.deleteMany({ where: { id: draftId, status: "pending" } });
    await replyMessage(event.replyToken, [text("ยกเลิกแล้วค่ะ")]);
    return;
  }

  // --- CONFIRM ---
  if (action === "confirm") {
    await replyMessage(event.replyToken, [text("กำลังบันทึก...")]);
    try {
      const claimed = await confirmDraftAsync(draft);
      if (!claimed) {
        // กดซ้ำ — อีก request กำลังบันทึก/บันทึกไปแล้ว (LINE-04)
        await pushMessage(event.source.userId, [text("รายการนี้กำลังบันทึก/บันทึกแล้ว")]).catch(() => {});
      }
    } catch (err) {
      console.error("[LINE webhook] confirm failed:", err);
      await pushMessage(event.source.userId, [
        text("บันทึกไม่สำเร็จ\n" + userFacingError(err)),
      ]).catch(() => {});
    }
  }
}

// =====================================================
// CONFIRM — Save expense (เหมือน browser upload receipt)
// =====================================================
/**
 * Claims the draft (pending → saving) before any Sheets/Drive write so a
 * double "บันทึก" cannot append twice (LINE-04). Returns false when the draft
 * was already claimed/confirmed. On success the draft row is deleted (LINE-06);
 * on failure it is reverted to pending so the user can retry.
 */
async function confirmDraftAsync(draft: {
  id: string;
  lineUserId: string;
  userId: string;
  orgId: string;
  imageMessageId: string;
  mimeType: string;
  ocrJson: unknown;
}): Promise<boolean> {
  // Read eventId/eventName before claiming (the row is deleted at the end).
  const draftFull = await prisma.lineDraft.findUnique({ where: { id: draft.id } });
  const eventId = draftFull?.eventId || "";
  const eventName = draftFull?.eventName || "";
  // LINE-33: driveFileId ถูกตั้งเฉพาะใน writeDraftToSheets หลังอัปโหลดสำเร็จ → มีค่า = รอบก่อนอัปโหลดแล้ว
  // (แต่ตายก่อนลบ draft) → รอบนี้ใช้ไฟล์เดิม ไม่อัปโหลดซ้ำ
  const priorUpload =
    draftFull?.driveFileId && draftFull.driveFileUrl
      ? { fileId: draftFull.driveFileId, webViewLink: draftFull.driveFileUrl }
      : null;

  // LINE-25: ฝังเวลาที่ claim ไว้ใน status ("saving:<ms>") เพื่อให้ตรวจ "ค้าง saving" ได้ (ดู draft-status.ts)
  const claim = await prisma.lineDraft.updateMany({
    where: { id: draft.id, status: "pending" },
    data: { status: savingStatus() },
  });
  if (claim.count === 0) return false;

  try {
    await writeDraftToSheets(draft, eventId, eventName, priorUpload);
  } catch (err) {
    // คืนเป็น pending ให้กดบันทึกใหม่ได้ (ถ้าแถวยังอยู่ — แถวถูกลบแล้วเมื่อ append สำเร็จ ดู LINE-21)
    await prisma.lineDraft
      .updateMany({ where: { id: draft.id, status: { startsWith: SAVING_PREFIX } }, data: { status: "pending" } })
      .catch(() => {});
    throw err;
  }
  return true;
}

async function writeDraftToSheets(
  draft: {
    id: string;
    lineUserId: string;
    userId: string;
    orgId: string;
    imageMessageId: string;
    mimeType: string;
    ocrJson: unknown;
  },
  eventId: string,
  eventName: string,
  /** LINE-33: ไฟล์ Drive ที่รอบก่อนอัปโหลดไว้แล้ว (จาก draft.driveFileId/driveFileUrl) */
  priorUpload: { fileId: string; webViewLink: string } | null = null,
): Promise<void> {
  const ocr = draft.ocrJson as OcrParsedReceipt;

  // ----- Receipt source: text entry vs image/pdf -----
  // Text entries skip Drive download/upload entirely — there's no file.
  const isTextEntry = draft.imageMessageId.startsWith("text:");

  // Saved-card label — text entries use the typed message (truncated) so the user recognizes the entry.
  const savedLabel = isTextEntry
    ? (ocr.rawText?.slice(0, 40) || "บันทึกจาก LINE")
    : (ocr.vendorName || "บันทึกจาก LINE");

  // Get services
  const sheets = await getSheetsService(draft.orgId);

  // LINE-33: รอบก่อนอาจ append แถวลง Sheet แล้วแต่ function ตายก่อนลบ draft → status ถูกคืนเป็น pending
  // (LINE-25) แล้วผู้ใช้กดบันทึกซ้ำ → ต้องไม่ append อีกแถว: ทุกแถวที่ LINE สร้างมี Notes "LINE draft <id>"
  // → หาแถวนั้นก่อน (getPayments ติด cache 60 วิ แต่ retry เกิดหลัง claim ≥ 3 นาที จึงเห็นแถวจริงเสมอ)
  // เจอ = บันทึกไปแล้ว → ลบ draft + ส่งการ์ดเดิม แล้วจบ โดยไม่แตะ Drive/Sheet อีก
  const draftTag = `LINE draft ${draft.id}`;
  const existingRow = await findPaymentRowByDraftTag(sheets, draftTag);
  if (existingRow) {
    const existingId = existingRow.PaymentID || "";
    console.warn(`[LINE] draft ${draft.id} already saved as ${existingId} — skipping append (LINE-33)`);
    await deleteDraftAfterSave(draft.id, existingId);
    const existingAmount = Number(existingRow.GTTLAmount);
    await notifySaved(draft.lineUserId, {
      paymentId: existingId,
      vendor: savedLabel,
      amount: Number.isFinite(existingAmount) ? existingAmount : 0,
      projectName: eventName || "ไม่ระบุ",
    });
    return;
  }

  const { drive, receiptsFolderId, orgName } = await getDriveService(draft.orgId);

  // Find or create payee
  const defaults = await ensureLineDefaults(sheets, draft.orgId);
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

  const today = todayBangkok();
  const paymentId = GoogleSheetsService.generateId("PMT");

  let receiptUrl = "";
  if (!isTextEntry && priorUpload) {
    // LINE-33: ไฟล์ขึ้น Drive ไปแล้วรอบก่อน (แถวยังไม่ลง Sheet) → ใช้ลิงก์เดิม ไม่ดาวน์โหลด/อัปโหลดซ้ำ
    receiptUrl = priorUpload.webViewLink;
    console.log(`[LINE] draft ${draft.id} reusing Drive file ${priorUpload.fileId} from earlier attempt (LINE-33)`);
  } else if (!isTextEntry) {
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

  // Calculate amounts (เหมือน browser) — ต้องให้ TTL + VAT == GTTL เสมอ (LINE-07):
  // ใบเสร็จที่ OCR ได้ทั้ง subtotal และ VAT → ใช้ subtotal เป็นฐาน + VAT ตามใบ
  // ไม่ครบ → แยกจากยอดรวม (total/1.07) แล้วให้ VAT = total - ฐาน
  const totalAmount = ocr.totalAmount ?? ocr.subtotal ?? 0;
  const isVatPayee = !!ocr.hasVat || (ocr.vatAmount ?? 0) > 0;
  let costPerUnit: number;
  let vatAmount: number;
  if (!isVatPayee) {
    costPerUnit = roundTwo(totalAmount);
    vatAmount = 0;
  } else if (ocr.vatAmount != null && ocr.subtotal != null && ocr.subtotal > 0) {
    costPerUnit = roundTwo(ocr.subtotal);
    vatAmount = roundTwo(ocr.vatAmount);
  } else {
    costPerUnit = roundTwo(totalAmount / 1.07);
    vatAmount = roundTwo(totalAmount - costPerUnit);
  }
  const pctWTH = 0; // default — user แก้ในเว็บได้

  const calc = calculatePayment({
    costPerUnit,
    days: 1,
    numberOfPeople: 1,
    pctWTH,
    isVatPayee,
  });
  // GTTL จาก VAT จริงของใบเสร็จ (calc.vatAmount คือ 7% ของฐาน ซึ่งอาจไม่ตรงใบ)
  const gttlAmount = roundTwo(calc.ttlAmount - calc.wthAmount + vatAmount);

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
    ExpenseType: "team",
    CompanyBankID: "",
    InvoiceNumber: ocr.invoiceNumber || "",
    InvoiceFileURL: "",
    Description: paymentDescription,
    CostPerUnit: costPerUnit,
    Days: 1,
    NoOfPPL: 1,
    TTLAmount: calc.ttlAmount,
    PctWTH: pctWTH,
    WTHAmount: calc.wthAmount,
    VATAmount: vatAmount,
    GTTLAmount: gttlAmount,
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

  // บันทึกแล้ว → ลบ draft — ข้อมูลที่ต้องใช้ต่อ (ocr, eventName) อยู่ในหน่วยความจำแล้ว
  // LINE-21: แถวลง Sheet แล้ว — ตั้งแต่จุดนี้ห้าม throw (ผู้เรียกจะบอก "บันทึกไม่สำเร็จ" ทั้งที่ลงแล้ว
  // และ revert status หาแถว draft ที่ไม่มีแล้ว) → ทุกอย่างหลัง append = best-effort, log แทน
  await deleteDraftAfterSave(draft.id, paymentId);

  // Audit log — distinguish OCR vs manual text entry
  const auditPrefix = isTextEntry ? "LINE Text" : "LINE OCR";
  const auditLabel = isTextEntry
    ? (ocr.rawText?.slice(0, 60) || "")
    : (ocr.vendorName || "");

  try {
    await safeAuditLog({
      data: {
        orgId: draft.orgId,
        userId: draft.userId,
        action: "create",
        entityType: "payment",
        entityRef: paymentId,
        summary: `${auditPrefix}: ${auditLabel} ฿${gttlAmount} | ${eventName || "ไม่ระบุโปรเจกต์"}`,
      },
    });
  } catch (err) {
    console.error(`[LINE] audit log failed for ${paymentId} (row already saved):`, err);
  }

  // Notify user — saved Flex card (savedLabel computed at the top of this function).
  await notifySaved(draft.lineUserId, {
    paymentId,
    vendor: savedLabel,
    amount: gttlAmount,
    projectName: eventName || "ไม่ระบุ",
  });
}

/**
 * LINE-33: หาแถว Payments ที่ draft นี้เคย append ไปแล้ว (Notes มี "LINE draft <id>")
 * อ่านไม่ได้ (quota/เครือข่าย) → คืน null แล้วให้ flow ปกติเดินต่อ — การตรวจซ้ำต้องไม่ทำให้การบันทึกปกติล้ม
 */
async function findPaymentRowByDraftTag(
  sheets: GoogleSheetsService,
  draftTag: string,
): Promise<Record<string, string> | null> {
  try {
    const rows = await sheets.getPayments();
    return rows.find((r) => (r.Notes || "").includes(draftTag)) ?? null;
  } catch (err) {
    console.error(`[LINE] duplicate check (${draftTag}) read failed — proceeding with append:`, err);
    return null;
  }
}

/**
 * แถวลง Sheet แล้ว → ลบ draft (ocrJson มีเลขภาษี/ยอด — เก็บไว้แค่ชั่วคราวตาม Zero Data Retention)
 * LINE-21: ตั้งแต่จุดนี้ห้าม throw → best-effort, log แทน
 * LINE-32: ลบไม่ได้ → ต้องไม่ปล่อยให้ค้าง "saving" (จะถูกรีเซ็ตเป็น pending แล้วกดบันทึกซ้ำได้)
 *          ตั้งเป็น confirmed (สถานะสิ้นสุด) → ปุ่มเก่าตอบ "บันทึกไปแล้ว", cron ลบทิ้งให้ (LINE-06)
 */
async function deleteDraftAfterSave(draftId: string, paymentId: string): Promise<void> {
  await prisma.lineDraft.deleteMany({ where: { id: draftId } }).catch(async (err) => {
    console.error(`[LINE] draft ${draftId} saved as ${paymentId} but delete failed (marking confirmed):`, err);
    await prisma.lineDraft.updateMany({ where: { id: draftId }, data: { status: "confirmed" } }).catch(() => {});
  });
}

/** ส่งการ์ด "บันทึกแล้ว" — การ์ดไม่ถึง → ส่งข้อความสั้นแทน (best-effort, แถวอยู่ใน Sheet แล้ว ห้าม throw) */
async function notifySaved(
  lineUserId: string,
  args: { paymentId: string; vendor: string; amount: number; projectName: string },
): Promise<void> {
  try {
    await pushMessage(lineUserId, [
      buildSavedFlex({ ...args, webUrl: `${APP_BASE_URL}/expenses` }),
    ]);
  } catch (err) {
    console.error(`[LINE] saved-card push failed for ${args.paymentId} (row already saved):`, err);
    await pushMessage(lineUserId, [
      text(`บันทึกแล้ว ฿${args.amount} (${args.vendor}) — ดูได้ที่ ${APP_BASE_URL}/expenses`),
    ]).catch(() => {});
  }
}
