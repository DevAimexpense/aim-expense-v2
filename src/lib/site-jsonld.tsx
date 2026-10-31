// ===========================================
// JSON-LD ของเว็บสาธารณะ — สร้างจากข้อมูลชุดเดียวกับที่แสดงบนหน้า (ห้ามใส่ข้อมูลที่หน้าไม่ได้แสดง)
// - Organization / SoftwareApplication อยู่ใน src/app/layout.tsx (ทุกหน้า)
// - FAQPage อยู่ใน copy.ts (faqJsonLd) · ที่นี่มี WebSite (หน้าแรก) และ BreadcrumbList (หน้าย่อยทุกหน้า)
// ===========================================
import { COMPANY } from "@/lib/company";
import { withLang, type Lang } from "@/lib/site-lang";

const HOME_LABEL: Record<Lang, string> = { th: "หน้าแรก", en: "Home" };

export function websiteJsonLd(lang: Lang) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: COMPANY.productName,
    url: `${COMPANY.siteUrl}${withLang(lang, "/")}`,
    inLanguage: lang,
    publisher: { "@type": "Organization", name: COMPANY.nameEn, url: COMPANY.siteUrl },
  };
}

/** หน้าแรก → หน้าปัจจุบัน (path ไม่ต้องใส่ /en — ใส่ให้ตาม lang) */
export function breadcrumbJsonLd(lang: Lang, crumbs: Array<{ name: string; path: string }>) {
  const items = [{ name: HOME_LABEL[lang], path: "/" }, ...crumbs];
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: `${COMPANY.siteUrl}${withLang(lang, c.path)}`,
    })),
  };
}

export function JsonLd({ data }: { data: object }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />;
}
