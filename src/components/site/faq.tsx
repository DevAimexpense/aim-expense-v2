// หน้า /faq และ /en/faq — คำถามแบบตอบก่อน จากพฤติกรรมจริงของระบบ · มี FAQPage JSON-LD ครบทุกข้อ
import Link from "next/link";
import { SiteHeader } from "./site-header";
import { SiteFooter } from "./site-footer";
import { Reveal } from "./reveal";
import { Button } from "./button";
import { FAQ, faqJsonLd } from "./copy";
import { COMPANY } from "@/lib/company";
import { JsonLd, breadcrumbJsonLd } from "@/lib/site-jsonld";
import { pageMeta, withLang, type Lang } from "@/lib/site-lang";

const TEXT = {
  th: {
    title: "คำถามที่พบบ่อย",
    sub: "คำตอบสั้น ๆ จากวิธีที่ระบบทำงานจริง ไม่ใช่จากโบรชัวร์",
    morePre: "ไม่พบคำตอบที่ต้องการ ติดต่อเราได้ที่",
    moreLink: "หน้าติดต่อ",
    orLine: "หรือทักมาที่ LINE OA",
    ctaTitle: "ลองใช้เองดีกว่าอ่าน",
    ctaSub: "ทดลอง Pro ฟรี 30 วัน ไม่ต้องใช้บัตรเครดิต",
    cta: "ทดลองใช้ฟรี 30 วัน",
    metaTitle: "คำถามที่พบบ่อย — Aim Expense",
    metaDesc: "คำตอบสั้น ๆ เรื่อง Aim Expense: ไม่ต้องติดตั้งแอป ข้อมูลอยู่ใน Google Sheet ของคุณ ไม่จด VAT ใช้ได้ ออกใบกำกับภาษีและ 50 ทวิได้ ฟรีแลนซ์ใช้ได้ ราคา",
  },
  en: {
    title: "Frequently asked questions",
    sub: "Short answers based on how the system actually works, not a brochure.",
    morePre: "Can't find your answer? Reach us on the",
    moreLink: "contact page",
    orLine: "or message our LINE OA",
    ctaTitle: "Trying it beats reading about it",
    ctaSub: "30-day Pro trial, no credit card.",
    cta: "Start 30-day free trial",
    metaTitle: "FAQ — Aim Expense",
    metaDesc: "Short answers about Aim Expense: no app to install, data in your Google Sheet, non-VAT businesses welcome, tax invoices and 50 Tawi, freelancers, pricing and trial.",
  },
} as const;

export function faqMeta(lang: Lang) {
  return pageMeta(lang, "/faq", { title: TEXT[lang].metaTitle, description: TEXT[lang].metaDesc });
}

export function FaqPage({ lang }: { lang: Lang }) {
  const t = TEXT[lang];
  const items = FAQ[lang];
  return (
    <div className="site-motion min-h-screen bg-white text-slate-900">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd(lang, items)) }} />
      <JsonLd data={breadcrumbJsonLd(lang, [{ name: t.title, path: "/faq" }])} />
      <SiteHeader lang={lang} path="/faq" />
      <main>
        <section className="border-b border-brand-100 bg-brand-50">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
            <h1 className="max-w-3xl text-balance text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">{t.title}</h1>
            <p className="mt-4 max-w-2xl text-pretty text-lg text-slate-700">{t.sub}</p>
          </div>
        </section>

        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:py-24">
          <Reveal className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
            {items.map((f) => (
              <details key={f.q} className="group px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <span className="text-slate-400 transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-2 leading-relaxed text-slate-700">{f.a}</p>
              </details>
            ))}
          </Reveal>
          <p className="mt-8 text-slate-700">
            {t.morePre}{" "}
            <Link href={withLang(lang, "/contact")} className="font-medium text-brand-700 hover:underline">{t.moreLink}</Link>{" "}
            {t.orLine}{" "}
            <a href={COMPANY.lineOaUrl} target="_blank" rel="noreferrer" className="font-semibold text-brand-700 hover:underline">{COMPANY.lineOaId}</a>
          </p>
        </div>

        <section className="border-t border-brand-100 bg-brand-50">
          <Reveal className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6">
            <h2 className="text-balance text-2xl font-bold tracking-tight sm:text-3xl">{t.ctaTitle}</h2>
            <p className="mt-3 text-slate-700">{t.ctaSub}</p>
            <div className="mt-6">
              <Button href="/login" size="lg">{t.cta}</Button>
            </div>
          </Reveal>
        </section>
      </main>
      <SiteFooter lang={lang} />
    </div>
  );
}
