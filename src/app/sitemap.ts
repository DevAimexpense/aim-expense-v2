// sitemap.xml — เฉพาะหน้าสาธารณะ · TH + EN คู่กันพร้อม hreflang · ราคา/กฎหมายมีเฉพาะไทย
import type { MetadataRoute } from "next";
import { COMPANY } from "@/lib/company";
import { withLang } from "@/lib/site-lang";

const BILINGUAL = ["/", "/features", "/pricing", "/security", "/faq", "/about", "/contact"];
const TH_ONLY = ["/privacy", "/terms"];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  const abs = (p: string) => `${COMPANY.siteUrl}${p}`;
  return [
    ...BILINGUAL.flatMap((p) => {
      const languages = { th: abs(p), en: abs(withLang("en", p)) };
      return [
        { url: abs(p), lastModified, changeFrequency: "monthly" as const, priority: p === "/" ? 1 : p === "/pricing" || p === "/features" ? 0.9 : 0.8, alternates: { languages } },
        { url: abs(withLang("en", p)), lastModified, changeFrequency: "monthly" as const, priority: p === "/" ? 0.9 : 0.6, alternates: { languages } },
      ];
    }),
    ...TH_ONLY.map((p) => ({ url: abs(p), lastModified, changeFrequency: "yearly" as const, priority: 0.3 })),
  ];
}
