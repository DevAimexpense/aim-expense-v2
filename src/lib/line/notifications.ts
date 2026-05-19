// ===========================================
// Aim Expense — LINE system notifications (S27)
// Trial-expiry reminders + welcome message, pushed to the registered LINE
// account so customers can renew straight from LINE.
// ===========================================

import { pushMessage, type LineFlexMessage } from "./messaging";

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

function formatThaiDate(date: Date): string {
  return date.toLocaleDateString("th-TH", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// ===== Trial-expiring reminder =====

function buildTrialReminderFlex(params: {
  orgName: string;
  daysLeft: number;
  trialEndsAt: Date;
}): LineFlexMessage {
  const { orgName, daysLeft, trialEndsAt } = params;
  return {
    type: "flex",
    altText: `แพ็คเกจทดลอง Pro ของ ${orgName} เหลืออีก ${daysLeft} วัน`,
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          {
            type: "text",
            text: "⏳ แพ็คเกจทดลองกำลังจะหมด",
            weight: "bold",
            size: "md",
            color: "#b45309",
          },
          {
            type: "text",
            text: orgName,
            size: "sm",
            color: "#64748b",
            wrap: true,
          },
          {
            type: "box",
            layout: "baseline",
            contents: [
              {
                type: "text",
                text: "เหลืออีก",
                size: "sm",
                color: "#475569",
                flex: 0,
              },
              {
                type: "text",
                text: ` ${daysLeft} วัน`,
                weight: "bold",
                size: "xxl",
                color: "#2563eb",
              },
            ],
          },
          {
            type: "text",
            text: `Pro trial หมดวันที่ ${formatThaiDate(trialEndsAt)}`,
            size: "xs",
            color: "#94a3b8",
            wrap: true,
          },
          {
            type: "separator",
            margin: "md",
          },
          {
            type: "text",
            text: "หลังหมด trial บัญชีจะกลายเป็น Free (OCR 5 ครั้ง/เดือน) — อัปเกรดตอนนี้เพื่อใช้ฟีเจอร์ Pro ต่อเนื่อง",
            size: "xs",
            color: "#475569",
            wrap: true,
          },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "button",
            style: "primary",
            color: "#2563eb",
            action: {
              type: "uri",
              label: "อัปเกรดแพ็คเกจ",
              uri: `${appUrl()}/account/billing`,
            },
          },
        ],
      },
    },
  };
}

/**
 * Push a trial-expiring reminder to a LINE user.
 * Best-effort — never throws (LINE push fails for users who haven't followed
 * the OA; that should not break the cron).
 */
export async function sendTrialReminder(
  lineUserId: string,
  params: { orgName: string; daysLeft: number; trialEndsAt: Date },
): Promise<boolean> {
  try {
    await pushMessage(lineUserId, [buildTrialReminderFlex(params)]);
    return true;
  } catch (err) {
    console.warn(
      `[line-notify] trial reminder failed for ${lineUserId}:`,
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}

// ===== Welcome message =====

function buildWelcomeFlex(orgName: string): LineFlexMessage {
  return {
    type: "flex",
    altText: `ยินดีต้อนรับสู่ Aim Expense — ${orgName}`,
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          {
            type: "text",
            text: "🎉 ยินดีต้อนรับสู่ Aim Expense",
            weight: "bold",
            size: "md",
            color: "#1e3a8a",
            wrap: true,
          },
          {
            type: "text",
            text: orgName,
            size: "sm",
            color: "#64748b",
            wrap: true,
          },
          {
            type: "separator",
            margin: "md",
          },
          {
            type: "text",
            text: "บัญชีของคุณได้รับ Pro trial ฟรี 30 วัน — ใช้ OCR, ใบเสนอราคา, ใบกำกับภาษี และฟีเจอร์ Pro ได้ครบ",
            size: "xs",
            color: "#475569",
            wrap: true,
          },
          {
            type: "text",
            text: "เราจะแจ้งเตือนผ่าน LINE นี้ก่อน trial หมด เพื่อให้ต่ออายุได้สะดวก",
            size: "xs",
            color: "#94a3b8",
            wrap: true,
          },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "button",
            style: "primary",
            color: "#2563eb",
            action: {
              type: "uri",
              label: "เปิดแดชบอร์ด",
              uri: `${appUrl()}/dashboard`,
            },
          },
        ],
      },
    },
  };
}

/**
 * Push a welcome message after a business is created. Best-effort.
 */
export async function sendWelcome(
  lineUserId: string,
  orgName: string,
): Promise<boolean> {
  try {
    await pushMessage(lineUserId, [buildWelcomeFlex(orgName)]);
    return true;
  } catch (err) {
    console.warn(
      `[line-notify] welcome failed for ${lineUserId}:`,
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}
