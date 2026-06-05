import type { LineFlexMessage } from "@/lib/line/messaging";

/**
 * เมนูลิงก์ 3 หัวข้อ (ตรงกับ rich menu ฝั่ง 1-1) สำหรับให้กดในแชต/กลุ่ม
 * เปิดในเบราว์เซอร์ (ไม่ใส่ openExternalBrowser — param นั้นทำ login พัง)
 */
export function buildMenuFlex(appBaseUrl: string): LineFlexMessage {
  const linkButton = (label: string, path: string, color: string) => ({
    type: "button",
    style: "primary",
    color,
    height: "sm",
    margin: "sm",
    action: {
      type: "uri",
      label,
      uri: `${appBaseUrl}${path}`,
    },
  });

  return {
    type: "flex",
    altText: "เมนู Aim Expense",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          {
            type: "text",
            text: "เมนู Aim Expense",
            weight: "bold",
            size: "lg",
            color: "#4F46E5",
          },
          {
            type: "text",
            text: "เลือกหัวข้อที่ต้องการ",
            size: "xs",
            color: "#888888",
          },
          { type: "separator", margin: "md" },
          linkButton("🔐 เข้าสู่ระบบ", "/login", "#4F46E5"),
          linkButton("📋 จัดการโปรเจกต์", "/events", "#059669"),
          linkButton("💰 รายรับ", "/billings", "#d97706"),
        ],
      },
    },
  };
}
