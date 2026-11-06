import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // ESLint (next/core-web-vitals) บังคับตอน build ตั้งแต่ 06/11/2569 — lint error เก่า 15 จุดถูกแก้หมดแล้ว
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
