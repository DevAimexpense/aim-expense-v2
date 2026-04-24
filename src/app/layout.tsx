import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aim Expense — ระบบจัดการค่าใช้จ่ายสำหรับ SME",
  description:
    "จัดการค่าใช้จ่าย แบ่งโปรเจกต์ ตั้งเบิก อนุมัติ เคลียร์งบ คำนวณภาษี — ข้อมูลอยู่ใน Google Sheets ของคุณเอง",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-slate-50 antialiased">{children}</body>
    </html>
  );
}
