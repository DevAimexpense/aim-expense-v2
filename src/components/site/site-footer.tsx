// ===========================================
// ฟุตเตอร์ของเว็บสาธารณะ — 4 คอลัมน์ ตามเกณฑ์ LINE OA verification
// ข้อมูลบริษัท/อีเมล/OA เป็นข้อความธรรมดาใน HTML แรกเสมอ (ไม่มี hook, ไม่รอ JS)
// ===========================================

import Link from "next/link";
import { Logo } from "./logo";
import { COMPANY } from "@/lib/company";
import { withLang, type Lang } from "@/lib/site-lang";

const LABEL = {
  th: {
    contact: "ติดต่อ", product: "ผลิตภัณฑ์", legal: "กฎหมาย",
    features: "ฟีเจอร์", pricing: "ราคา", faq: "คำถามที่พบบ่อย", about: "เกี่ยวกับเรา", contactPage: "ติดต่อเรา", login: "เข้าสู่ระบบ",
    privacy: "นโยบายความเป็นส่วนตัว", terms: "ข้อกำหนดการใช้งาน", addFriend: "เพิ่มเพื่อน", regNo: "เลขทะเบียนนิติบุคคล",
    sister: "ผลิตภัณฑ์พี่น้อง",
  },
  en: {
    contact: "Contact", product: "Product", legal: "Legal",
    features: "Features", pricing: "Pricing", faq: "FAQ", about: "About", contactPage: "Contact us", login: "Sign in",
    privacy: "Privacy Policy", terms: "Terms of Service", addFriend: "Add friend", regNo: "Registration No.",
    sister: "Sister product",
  },
} as const;

export function SiteFooter({ lang = "th" }: { lang?: Lang }) {
  const t = LABEL[lang];
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 text-sm sm:px-6 md:grid-cols-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Logo className="h-7 w-7" rounded="rounded-lg" />
            <span className="font-semibold text-slate-900">{COMPANY.productName}</span>
          </div>
          <p className="font-medium text-slate-800">{COMPANY.nameTh}</p>
          <p className="text-slate-600">{COMPANY.nameEn}</p>
          <address className="not-italic leading-relaxed text-slate-600">
            {lang === "en" ? COMPANY.addressEn : COMPANY.address}
          </address>
          <p className="text-xs text-slate-500">
            {t.regNo} {COMPANY.registrationNo}
          </p>
        </div>

        <div className="space-y-2">
          <p className="font-semibold text-slate-900">{t.contact}</p>
          <p>
            <a href={`mailto:${COMPANY.email}`} className="text-slate-700 hover:text-brand-700 hover:underline">{COMPANY.email}</a>
          </p>
          <p>
            <a href={`tel:${COMPANY.phoneIntl}`} className="text-slate-700 hover:text-brand-700 hover:underline">{COMPANY.phone}</a>
          </p>
          <p className="text-slate-700">
            LINE OA: <span className="font-medium">{COMPANY.lineOaId}</span>
          </p>
          <a
            href={COMPANY.lineOaUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center rounded-lg bg-[#06C755] px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90"
          >
            {t.addFriend} {COMPANY.lineOaId}
          </a>
        </div>

        <div className="space-y-2">
          <p className="font-semibold text-slate-900">{t.product}</p>
          <ul className="space-y-1.5 text-slate-600">
            <li><Link href={`${withLang(lang, "/")}#features`} className="hover:text-slate-900">{t.features}</Link></li>
            <li><Link href="/pricing" className="hover:text-slate-900">{t.pricing}</Link></li>
            <li><Link href={withLang(lang, "/faq")} className="hover:text-slate-900">{t.faq}</Link></li>
            <li><Link href={withLang(lang, "/about")} className="hover:text-slate-900">{t.about}</Link></li>
            <li><Link href={withLang(lang, "/contact")} className="hover:text-slate-900">{t.contactPage}</Link></li>
            <li><Link href="/login" className="hover:text-slate-900">{t.login}</Link></li>
          </ul>
        </div>

        <div className="space-y-2">
          <p className="font-semibold text-slate-900">{t.legal}</p>
          <ul className="space-y-1.5 text-slate-600">
            <li><Link href="/privacy" className="hover:text-slate-900">{t.privacy}</Link></li>
            <li><Link href="/terms" className="hover:text-slate-900">{t.terms}</Link></li>
          </ul>
          <p className="pt-3 font-semibold text-slate-900">{t.sister}</p>
          <p>
            <a href={COMPANY.sisterProduct.url} target="_blank" rel="noreferrer" className="text-slate-600 hover:text-slate-900">
              {COMPANY.sisterProduct.name}
            </a>
          </p>
        </div>
      </div>
      <div className="border-t border-slate-200">
        <p className="mx-auto max-w-6xl px-4 py-4 text-xs text-slate-500 sm:px-6">
          © {new Date().getFullYear()} {COMPANY.nameEn}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
