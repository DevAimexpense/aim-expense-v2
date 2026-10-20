// ===========================================
// หัวเว็บสาธารณะ — ใช้ร่วมกันทุกหน้า (หน้าแรก, ราคา, FAQ, ติดต่อ, เกี่ยวกับ, กฎหมาย) ไม่มี hook
// - เมนูมือถือเป็น <details> ไม่ต้องใช้ JS
// - สลับภาษาเป็นลิงก์จริงไป /en/... (ไม่ใช่ state) เพื่อให้ AI/ค้นหาเห็นทั้งสองภาษา
// ===========================================

import Link from "next/link";
import { Logo } from "./logo";
import { withLang, LANGS, type Lang } from "@/lib/site-lang";

const LABEL = {
  th: { features: "ฟีเจอร์", pricing: "ราคา", faq: "คำถามที่พบบ่อย", about: "เกี่ยวกับเรา", contact: "ติดต่อ", login: "เข้าสู่ระบบ", menu: "เมนู" },
  en: { features: "Features", pricing: "Pricing", faq: "FAQ", about: "About", contact: "Contact", login: "Sign in", menu: "Menu" },
} as const;

/** หน้าที่มีเฉพาะภาษาไทย — ลิงก์ EN ชี้ไปหน้าเดิม */
const TH_ONLY = new Set(["/pricing", "/privacy", "/terms"]);

export function SiteHeader({ lang = "th", path = "/" }: { lang?: Lang; path?: string }) {
  const t = LABEL[lang];
  const links = [
    { label: t.features, href: `${withLang(lang, "/")}#features` },
    { label: t.pricing, href: "/pricing" },
    { label: t.faq, href: withLang(lang, "/faq") },
    { label: t.about, href: withLang(lang, "/about") },
    { label: t.contact, href: withLang(lang, "/contact") },
  ];
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link href={withLang(lang, "/")} className="flex items-center gap-2.5">
          <Logo className="h-8 w-8" rounded="rounded-lg" />
          <span className="whitespace-nowrap text-base font-bold tracking-tight text-slate-900 sm:text-lg">Aim Expense</span>
        </Link>
        <nav className="hidden items-center gap-6 text-sm font-medium text-slate-600 md:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-slate-900">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-slate-200 p-0.5 text-xs font-semibold" aria-label="Language">
            {LANGS.map((l) => (
              <Link
                key={l}
                href={TH_ONLY.has(path) ? path : withLang(l, path)}
                hrefLang={l}
                aria-current={lang === l ? "page" : undefined}
                className={`rounded-md px-2 py-1 transition ${lang === l ? "bg-brand-600 text-white" : "text-slate-600 hover:text-slate-900"}`}
              >
                {l.toUpperCase()}
              </Link>
            ))}
          </div>
          <Link
            href="/login"
            className="hidden rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 sm:inline-flex"
          >
            {t.login}
          </Link>
          <details className="relative md:hidden">
            <summary
              aria-label={t.menu}
              className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-lg border border-slate-200 text-slate-700 [&::-webkit-details-marker]:hidden"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                <path d="M2 4h14M2 9h14M2 14h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </summary>
            <nav className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-2 text-sm font-medium shadow-lg">
              {links.map((l) => (
                <Link key={l.href} href={l.href} className="block rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-50">
                  {l.label}
                </Link>
              ))}
              <Link href="/login" className="mt-1 block rounded-lg bg-brand-600 px-3 py-2 text-center text-white">
                {t.login}
              </Link>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
