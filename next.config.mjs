import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // ESLint เพิ่งถูกเพิ่มเข้าโปรเจกต์ (20/10/2569) — โค้ดแอปเดิมมี error ด้านสไตล์ (เช่น react/no-unescaped-entities)
  // ที่ยังไม่ได้ไล่แก้ จึงไม่ให้ lint ทำให้ build ล้ม · รัน `npm run lint` เองเพื่อดูรายการ
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    serverComponentsExternalPackages: ["pdf-parse", "pdfjs-dist", "unpdf", "sharp", "tesseract.js"],
    // ฟอร์ม 50 ทวิ + ฟอนต์ Sarabun ถูกอ่านด้วย fs ตอน runtime (src/lib/wht-cert/generate.ts)
    outputFileTracingIncludes: {
      "/api/documents/wht-cert/[paymentId]": ["./public/forms/**", "./public/fonts/**"],
      "/opengraph-image": ["./public/fonts/**", "./public/aim-expense-logo.png"],
      "/en/opengraph-image": ["./public/fonts/**", "./public/aim-expense-logo.png"],
    },
  },
};

// Sentry build-time integration. Source-maps + tunnel only enabled when
// SENTRY_AUTH_TOKEN + DSN env vars are present, so this is a no-op in
// uninstrumented environments (local dev without DSN, etc.).
const sentryEnabled = !!process.env.SENTRY_DSN || !!process.env.NEXT_PUBLIC_SENTRY_DSN;

export default sentryEnabled
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      silent: !process.env.CI,
      widenClientFileUpload: true,
      hideSourceMaps: true,
      disableLogger: true,
    })
  : nextConfig;
