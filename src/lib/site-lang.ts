// ===========================================
// ภาษาของเว็บสาธารณะ — TH อยู่ที่ path ปกติ, EN อยู่ใต้ /en
//
// ทุกหน้าใช้ helper นี้สร้างลิงก์ข้ามภาษาและ metadata (canonical + hreflang + Open Graph)
// ให้ตรงกัน · หน้ากฎหมาย/ราคา มีเฉพาะไทย — ไม่ประกาศ hreflang en
// ===========================================

import type { Metadata } from "next";
import { COMPANY } from "@/lib/company";

export type Lang = "th" | "en";
export const LANGS: Lang[] = ["th", "en"];

/** path ของหน้าเดียวกันในภาษาที่ระบุ — withLang("en", "/faq") → "/en/faq" */
export function withLang(lang: Lang, path: string): string {
  if (lang !== "en") return path;
  return path === "/" ? "/en" : `/en${path}`;
}

export function pageMeta(
  lang: Lang,
  path: string,
  m: { title: string; description: string; thOnly?: boolean }
): Metadata {
  const url = `${COMPANY.siteUrl}${withLang(lang, path)}`;
  const languages: Record<string, string> = {
    th: `${COMPANY.siteUrl}${path}`,
    "x-default": `${COMPANY.siteUrl}${path}`,
  };
  if (!m.thOnly) languages.en = `${COMPANY.siteUrl}${withLang("en", path)}`;
  return {
    title: m.title,
    description: m.description,
    alternates: { canonical: url, languages },
    openGraph: {
      title: m.title,
      description: m.description,
      url,
      locale: lang === "en" ? "en_US" : "th_TH",
      type: "website",
      siteName: COMPANY.productName,
    },
  };
}
