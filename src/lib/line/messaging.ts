// ===========================================
// Aim Expense — LINE Messaging API helper
// Docs: https://developers.line.biz/en/reference/messaging-api/
// ===========================================

import crypto from "crypto";

const LINE_PUSH_URL = "https://api.line.me/v2/bot/message/push";
const LINE_REPLY_URL = "https://api.line.me/v2/bot/message/reply";
const LINE_PROFILE_URL = "https://api.line.me/v2/bot/profile";
const LINE_CONTENT_URL = "https://api-data.line.me/v2/bot/message";
const LINE_LOADING_URL = "https://api.line.me/v2/bot/chat/loading/start";

export interface LineQuickReplyItem {
  type: "action";
  action: {
    type: "postback" | "message" | "uri";
    label: string;
    data?: string;
    text?: string;
    uri?: string;
    displayText?: string;
  };
}

export interface LineQuickReply {
  items: LineQuickReplyItem[];
}

export interface LineTextMessage {
  type: "text";
  text: string;
  quickReply?: LineQuickReply;
}

export interface LineFlexMessage {
  type: "flex";
  altText: string;
  contents: Record<string, unknown>;
  quickReply?: LineQuickReply;
}

export type LineMessage = LineTextMessage | LineFlexMessage;

/**
 * Get channel access token from env
 */
function getChannelAccessToken(): string {
  const token = process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN;
  if (!token) {
    throw new Error("LINE_MESSAGING_CHANNEL_ACCESS_TOKEN is not set");
  }
  return token;
}

/**
 * Push message to a specific LINE user
 * ใช้สำหรับ notification จากระบบไปหา user
 */
export async function pushMessage(
  to: string,
  messages: LineMessage[]
): Promise<void> {
  const token = getChannelAccessToken();

  const res = await fetch(LINE_PUSH_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ to, messages }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`LINE push message failed: ${res.status} ${errorText}`);
  }
}

/**
 * Reply to a specific message event (ใช้ replyToken ที่ได้จาก webhook)
 * ต้อง reply ภายใน 1 นาทีและใช้ได้ครั้งเดียว
 */
export async function replyMessage(
  replyToken: string,
  messages: LineMessage[]
): Promise<void> {
  const token = getChannelAccessToken();

  const res = await fetch(LINE_REPLY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ replyToken, messages }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`LINE reply message failed: ${res.status} ${errorText}`);
  }
}

/**
 * Show the "typing" loading animation (3 animated dots) in the user's chat.
 *
 * Behaviour (per LINE spec):
 * - Animation is visible for `loadingSeconds` (5..60, in 5s increments).
 * - Auto-dismissed when the bot sends the next message via push/reply, or
 *   when the timeout expires (whichever comes first).
 * - Best-effort: failures are logged but never thrown — UX nicety, not
 *   critical to flow correctness.
 */
export async function showLoadingAnimation(
  chatId: string,
  loadingSeconds: number = 30,
): Promise<void> {
  const token = getChannelAccessToken();

  // Clamp to LINE's 5..60 range and round up to the nearest 5s increment.
  const clamped = Math.min(60, Math.max(5, loadingSeconds));
  const rounded = Math.ceil(clamped / 5) * 5;

  try {
    const res = await fetch(LINE_LOADING_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ chatId, loadingSeconds: rounded }),
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      console.warn(
        `[LINE] Loading animation request failed: ${res.status} ${errorText}`,
      );
    }
  } catch (err) {
    console.warn("[LINE] Loading animation request threw:", err);
  }
}

/**
 * Get LINE user profile (from bot's perspective)
 * ใช้ตอน user follow LINE OA แล้ว
 */
export async function getBotUserProfile(userId: string): Promise<{
  userId: string;
  displayName: string;
  pictureUrl: string | null;
  statusMessage: string | null;
  language: string | null;
}> {
  const token = getChannelAccessToken();

  const res = await fetch(`${LINE_PROFILE_URL}/${userId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`LINE get profile failed: ${res.status} ${errorText}`);
  }

  const json = await res.json();
  return {
    userId: json.userId,
    displayName: json.displayName,
    pictureUrl: json.pictureUrl || null,
    statusMessage: json.statusMessage || null,
    language: json.language || null,
  };
}

/**
 * Download message content (image, video, file) from LINE
 * ใช้ตอนรับใบเสร็จจาก user
 */
export async function getMessageContent(messageId: string): Promise<Buffer> {
  const token = getChannelAccessToken();

  const res = await fetch(`${LINE_CONTENT_URL}/${messageId}/content`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`LINE get content failed: ${res.status} ${errorText}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Verify LINE webhook signature (X-Line-Signature header)
 * ต้องใช้เพื่อยืนยันว่า webhook มาจาก LINE จริงๆ
 */
export function verifyWebhookSignature(
  body: string,
  signature: string
): boolean {
  const channelSecret = process.env.LINE_MESSAGING_CHANNEL_SECRET;
  if (!channelSecret) {
    throw new Error("LINE_MESSAGING_CHANNEL_SECRET is not set");
  }

  const hash = crypto
    .createHmac("sha256", channelSecret)
    .update(body)
    .digest("base64");

  // Use timing-safe comparison to prevent timing attacks
  if (hash.length !== signature.length) return false;
  return crypto.timingSafeEqual(
    Buffer.from(hash),
    Buffer.from(signature)
  );
}

/**
 * Helper: Build a simple text message
 */
export function text(message: string): LineTextMessage {
  return { type: "text", text: message };
}
