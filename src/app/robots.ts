// robots.txt — ให้เก็บเฉพาะเว็บสาธารณะ · หน้าใช้งานจริง/เอกสาร/API ไม่ต้อง index
// ระบุอนุญาตบอท AI ชัดเจน (AEO) — บอททุกตัวใช้กติกาเดียวกับ * คือเข้าหน้าสาธารณะได้ เข้าแอป/API ไม่ได้
import type { MetadataRoute } from "next";
import { COMPANY } from "@/lib/company";

const APP_PATHS = [
  "/api/", "/admin/", "/documents/", "/onboarding/", "/invite/", "/select-org", "/login", "/businesses/",
  "/dashboard", "/events", "/expenses", "/payments", "/payment-prep", "/approvals", "/billings", "/quotations",
  "/receipts", "/tax-invoices", "/customers", "/payees", "/banks", "/reports", "/settings", "/account", "/users",
  "/permissions", "/line-groups", "/affiliate",
];

/** บอทของผู้ให้บริการ AI ที่ต้องการให้อ่านและอ้างอิงเว็บได้ */
const AI_BOTS = [
  "GPTBot", "OAI-SearchBot", "ChatGPT-User",
  "ClaudeBot", "Claude-User",
  "PerplexityBot",
  "Google-Extended", "Applebot-Extended",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: APP_PATHS },
      ...AI_BOTS.map((userAgent) => ({ userAgent, allow: "/", disallow: APP_PATHS })),
    ],
    sitemap: `${COMPANY.siteUrl}/sitemap.xml`,
    host: COMPANY.siteUrl,
  };
}
