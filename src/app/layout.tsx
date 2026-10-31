import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { COMPANY } from "@/lib/company";
import { PLAN_LABELS, PLAN_PRICING_THB, SELF_SERVE_PLANS } from "@/lib/plans";
import "./globals.css";

// JSON-LD — ให้ Google/LINE/AI อ่านตัวตนบริษัท ช่องทางติดต่อ และตัวสินค้าได้จาก HTML โดยตรง (ทุกหน้า)
const ORGANIZATION_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: COMPANY.nameEn,
  alternateName: [COMPANY.nameTh, COMPANY.productName],
  url: COMPANY.siteUrl,
  logo: `${COMPANY.siteUrl}/aim-expense-logo.png`,
  email: COMPANY.email,
  telephone: COMPANY.phoneIntl,
  address: {
    "@type": "PostalAddress",
    streetAddress: "725 อาคารเอส เมโทร ห้องเลขที่ 47 ชั้นที่ 20 ถนนสุขุมวิท",
    addressLocality: "แขวงคลองตันเหนือ เขตวัฒนา",
    addressRegion: "กรุงเทพมหานคร",
    postalCode: "10110",
    addressCountry: "TH",
  },
  sameAs: [COMPANY.lineOaUrl, COMPANY.sisterProduct.url],
  contactPoint: [
    {
      "@type": "ContactPoint",
      contactType: "customer support",
      email: COMPANY.email,
      telephone: COMPANY.phoneIntl,
      availableLanguage: ["th", "en"],
    },
  ],
};

const SOFTWARE_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: COMPANY.productName,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web, LINE",
  url: COMPANY.siteUrl,
  inLanguage: ["th", "en"],
  description:
    "ระบบบัญชีค่าใช้จ่าย รายรับ และเอกสารภาษีสำหรับ SME ไทย ใช้งานผ่าน LINE และเว็บ ออกใบเสนอราคา ใบวางบิล ใบเสร็จรับเงิน ใบกำกับภาษี และหนังสือรับรองหัก ณ ที่จ่าย ข้อมูลเก็บใน Google Sheet ของผู้ใช้เอง",
  featureList: [
    "บันทึกค่าใช้จ่ายผ่าน LINE ด้วย OCR อ่านใบเสร็จ",
    "ใบเสนอราคา ใบวางบิล ใบเสร็จรับเงิน ใบกำกับภาษี",
    "หนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ) บนฟอร์มกรมสรรพากร",
    "สรุป ภ.ง.ด.3 / ภ.ง.ด.53 รายเดือน",
    "ขั้นตอนอนุมัติและงบรายโปรเจกต์",
    "ข้อมูลเก็บใน Google Sheet และ Google Drive ของผู้ใช้",
  ],
  // ราคาจาก src/lib/plans.ts ชุดเดียวกับหน้า /pricing — รายเดือน (P1M) และรายปี (P1Y)
  offers: SELF_SERVE_PLANS.flatMap((tier) => {
    const p = PLAN_PRICING_THB[tier]!;
    return [
      { "@type": "Offer", name: `${PLAN_LABELS[tier]} (monthly)`, price: String(p.monthly), priceCurrency: "THB", billingIncrement: "P1M", url: `${COMPANY.siteUrl}/pricing` },
      { "@type": "Offer", name: `${PLAN_LABELS[tier]} (yearly)`, price: String(p.yearly), priceCurrency: "THB", billingIncrement: "P1Y", url: `${COMPANY.siteUrl}/pricing` },
    ];
  }),
  provider: { "@type": "Organization", name: COMPANY.nameEn, url: COMPANY.siteUrl },
};

const SITE_TITLE = "Aim Expense — บัญชีและภาษีของ SME ไทย จบได้ในแชต LINE";
const SITE_DESCRIPTION =
  "ถ่ายใบเสร็จส่งใน LINE ระบบบันทึกค่าใช้จ่ายให้ทันที ออกใบกำกับภาษีและหนังสือรับรองหัก ณ ที่จ่ายบนฟอร์มกรมสรรพากร ข้อมูลทั้งหมดอยู่ใน Google Sheet ของคุณเอง";

// metadataBase ทำให้ og:image / canonical เป็น URL เต็ม · รูป OG มาจาก src/app/opengraph-image.tsx (และ /en)
export const metadata: Metadata = {
  metadataBase: new URL(COMPANY.siteUrl),
  title: { default: SITE_TITLE, template: "%s" },
  description: SITE_DESCRIPTION,
  applicationName: COMPANY.productName,
  openGraph: { type: "website", siteName: COMPANY.productName, locale: "th_TH", title: SITE_TITLE, description: SITE_DESCRIPTION },
  twitter: { card: "summary_large_image", title: SITE_TITLE, description: SITE_DESCRIPTION },
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-slate-50 antialiased">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ORGANIZATION_JSON_LD) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(SOFTWARE_JSON_LD) }} />
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
