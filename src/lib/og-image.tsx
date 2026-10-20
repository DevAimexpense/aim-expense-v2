// Open Graph image 1200×630 — ใช้ตอนแชร์ลิงก์ใน LINE/Facebook · วาดด้วย next/og ตอน build
// ฟอนต์ Sarabun จาก public/fonts · โลโก้จาก public/aim-expense-logo.png
import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { COMPANY } from "@/lib/company";
import type { Lang } from "@/lib/site-lang";

export const OG_SIZE = { width: 1200, height: 630 };

const TEXT = {
  th: { badge: "บัญชีและภาษี SME ไทย บน LINE", title: "บัญชีและภาษีของ SME ไทย จบได้ในแชต LINE", sub: "ถ่ายใบเสร็จในแชต · ใบกำกับภาษี · หัก ณ ที่จ่าย 50 ทวิ · ภ.ง.ด.3/53 — ข้อมูลอยู่ใน Google Sheet ของคุณเอง" },
  en: { badge: "Thai SME accounting on LINE", title: "Thai SME accounting and tax, done inside LINE chat", sub: "Snap receipts in chat · tax invoices · withholding certificates · PND 3/53 — data stays in your own Google Sheet" },
} as const;

export async function renderOgImage(lang: Lang) {
  const root = process.cwd();
  const [bold, regular, logo] = await Promise.all([
    readFile(path.join(root, "public/fonts/Sarabun-Bold.ttf")),
    readFile(path.join(root, "public/fonts/Sarabun-Regular.ttf")),
    readFile(path.join(root, "public/aim-expense-logo.png")),
  ]);
  const t = TEXT[lang];
  const logoSrc = `data:image/png;base64,${logo.toString("base64")}`;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "64px 72px", background: "linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)", color: "#ffffff", fontFamily: "Sarabun" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoSrc} width={72} height={72} style={{ borderRadius: 18 }} alt="" />
          <div style={{ fontSize: 44, fontWeight: 700 }}>Aim Expense</div>
          <div style={{ marginLeft: 16, padding: "8px 18px", borderRadius: 999, background: "rgba(255,255,255,0.16)", fontSize: 24 }}>{t.badge}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 58, fontWeight: 700, lineHeight: 1.4, maxWidth: 1000 }}>{t.title}</div>
          <div style={{ fontSize: 28, lineHeight: 1.4, maxWidth: 1000, opacity: 0.92 }}>{t.sub}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 26 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 14, height: 14, borderRadius: 7, background: "#06C755" }} />
            <span>{COMPANY.siteUrl.replace("https://", "")}</span>
          </div>
          <span>LINE {COMPANY.lineOaId}</span>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts: [{ name: "Sarabun", data: bold, weight: 700, style: "normal" }, { name: "Sarabun", data: regular, weight: 400, style: "normal" }] }
  );
}
