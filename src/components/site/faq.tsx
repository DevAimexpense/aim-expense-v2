// หน้า /faq และ /en/faq — คำตอบจากพฤติกรรมจริงของระบบ · มี FAQPage JSON-LD ครบทุกข้อ
import Link from "next/link";
import { SiteHeader } from "./site-header";
import { SiteFooter } from "./site-footer";
import { FAQ, faqJsonLd } from "./copy";
import { pageMeta, withLang, type Lang } from "@/lib/site-lang";

const TEXT = {
  th: {
    title: "คำถามที่พบบ่อย",
    subPre: "ไม่พบคำตอบที่ต้องการ ติดต่อเราได้ที่",
    subLink: "หน้าติดต่อ",
    metaTitle: "คำถามที่พบบ่อย — Aim Expense",
    metaDesc: "คำถามที่พบบ่อยเกี่ยวกับ Aim Expense: ต้องติดตั้งแอปไหม ข้อมูลเก็บที่ไหน ธุรกิจไม่จด VAT ใช้ได้ไหม ออกใบกำกับภาษีและหัก ณ ที่จ่ายได้ไหม ฟรีแลนซ์ใช้ได้ไหม ราคาและการทดลองใช้",
  },
  en: {
    title: "Frequently asked questions",
    subPre: "Can't find your answer? Reach us on the",
    subLink: "contact page",
    metaTitle: "FAQ — Aim Expense",
    metaDesc: "Common questions about Aim Expense: whether you need an app, where data is stored, non-VAT businesses, tax invoices and withholding certificates, freelancers, pricing and the free trial.",
  },
} as const;

export function faqMeta(lang: Lang) {
  return pageMeta(lang, "/faq", { title: TEXT[lang].metaTitle, description: TEXT[lang].metaDesc });
}

export function FaqPage({ lang }: { lang: Lang }) {
  const t = TEXT[lang];
  const items = FAQ[lang];
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd(lang, items)) }} />
      <SiteHeader lang={lang} path="/faq" />
      <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-24">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t.title}</h1>
        <p className="mt-4 text-lg text-slate-700">
          {t.subPre}{" "}
          <Link href={withLang(lang, "/contact")} className="text-brand-700 hover:underline">{t.subLink}</Link>
        </p>
        <div className="mt-10 divide-y divide-slate-200 rounded-2xl border border-slate-200">
          {items.map((f) => (
            <details key={f.q} className="group px-5 py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
                {f.q}
                <span className="text-slate-400 transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-2 leading-relaxed text-slate-700">{f.a}</p>
            </details>
          ))}
        </div>
      </main>
      <SiteFooter lang={lang} />
    </div>
  );
}
