// robots.txt — ให้เก็บเฉพาะเว็บสาธารณะ · หน้าใช้งานจริง/เอกสาร/API ไม่ต้อง index
import type { MetadataRoute } from "next";
import { COMPANY } from "@/lib/company";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/", "/admin/", "/documents/", "/onboarding/", "/invite/", "/select-org", "/login", "/businesses/",
          "/dashboard", "/events", "/expenses", "/payments", "/payment-prep", "/approvals", "/billings", "/quotations",
          "/receipts", "/tax-invoices", "/customers", "/payees", "/banks", "/reports", "/settings", "/account", "/users",
          "/permissions", "/line-groups", "/affiliate",
        ],
      },
    ],
    sitemap: `${COMPANY.siteUrl}/sitemap.xml`,
  };
}
