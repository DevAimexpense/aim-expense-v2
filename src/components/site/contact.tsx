// หน้า /contact และ /en/contact — ใช้ยื่น LINE OA verification: ข้อมูลทั้งหมด render จาก server
// อีเมล เบอร์ และ LINE OA เป็นข้อความธรรมดาใน HTML ไม่มีฟอร์ม
import { Mail, Phone, Clock, Building2, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { SiteHeader } from "./site-header";
import { SiteFooter } from "./site-footer";
import { Reveal } from "./reveal";
import { Button } from "./button";
import { COMPANY } from "@/lib/company";
import { JsonLd, breadcrumbJsonLd } from "@/lib/site-jsonld";
import { pageMeta, type Lang } from "@/lib/site-lang";

const TEXT = {
  th: {
    title: "ติดต่อเรา",
    sub: "ยินดีตอบคำถามเรื่องการใช้งาน Aim Expense การตั้งค่าบริษัท และการสมัครใช้งาน",
    company: "บริษัท", regNo: "เลขทะเบียนนิติบุคคล", email: "อีเมล", phone: "โทรศัพท์", hours: "เวลาทำการ",
    hoursValue: "จันทร์–ศุกร์ 09:00–18:00 น. (ยกเว้นวันหยุดนักขัตฤกษ์)",
    lineSub: "เพิ่มเพื่อนเพื่อสอบถาม หรือเริ่มใช้งาน Aim Expense ผ่าน LINE ช่องทางที่ตอบเร็วที่สุด",
    qrAlt: `QR code เพิ่มเพื่อน LINE Official Account ${COMPANY.lineOaId}`,
    addFriend: "เพิ่มเพื่อน",
    metaTitle: "ติดต่อเรา — Aim Expense",
    metaDesc: `ติดต่อ ${COMPANY.nameTh} ผู้ให้บริการ Aim Expense: อีเมล ${COMPANY.email} โทร ${COMPANY.phone} LINE OA ${COMPANY.lineOaId} จันทร์–ศุกร์ 09:00–18:00`,
  },
  en: {
    title: "Contact us",
    sub: "Happy to answer questions about using Aim Expense, setting up your company, or getting started.",
    company: "Company", regNo: "Registration No.", email: "Email", phone: "Phone", hours: "Business hours",
    hoursValue: "Monday–Friday 09:00–18:00 (Bangkok time, except public holidays)",
    lineSub: "Add us as a friend to ask questions or start using Aim Expense through LINE. It is the fastest way to reach us.",
    qrAlt: `QR code to add LINE Official Account ${COMPANY.lineOaId}`,
    addFriend: "Add friend",
    metaTitle: "Contact — Aim Expense",
    metaDesc: `Contact ${COMPANY.nameEn}, provider of Aim Expense: email ${COMPANY.email}, phone ${COMPANY.phone}, LINE OA ${COMPANY.lineOaId}, Mon–Fri 09:00–18:00.`,
  },
} as const;

export function contactMeta(lang: Lang) {
  return pageMeta(lang, "/contact", { title: TEXT[lang].metaTitle, description: TEXT[lang].metaDesc });
}

function Row({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  return (
    <div className="flex gap-4">
      <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
        <Icon size={18} aria-hidden />
      </span>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-slate-600">{label}</h2>
        <div className="mt-1">{children}</div>
      </div>
    </div>
  );
}

export function ContactPage({ lang }: { lang: Lang }) {
  const t = TEXT[lang];
  return (
    <div className="site-motion min-h-screen bg-white text-slate-900">
      <JsonLd data={breadcrumbJsonLd(lang, [{ name: t.title, path: "/contact" }])} />
      <SiteHeader lang={lang} path="/contact" />
      <main>
        <section className="border-b border-brand-100 bg-brand-50">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
            <h1 className="max-w-3xl text-balance text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">{t.title}</h1>
            <p className="mt-4 max-w-2xl text-pretty text-lg text-slate-700">{t.sub}</p>
          </div>
        </section>

        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:py-24">
          <Reveal as="section" className="space-y-7 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <Row icon={Building2} label={t.company}>
              <p className="font-semibold text-slate-900">{lang === "en" ? COMPANY.nameEn : COMPANY.nameTh}</p>
              <p className="text-slate-700">{lang === "en" ? COMPANY.nameTh : COMPANY.nameEn}</p>
              <address className="mt-2 not-italic leading-relaxed text-slate-700">{lang === "en" ? COMPANY.addressEn : COMPANY.address}</address>
              <p className="mt-1 text-sm text-slate-600">{t.regNo} {COMPANY.registrationNo}</p>
            </Row>
            <Row icon={Mail} label={t.email}>
              <a href={`mailto:${COMPANY.email}`} className="break-all text-lg font-medium text-brand-700 hover:underline">{COMPANY.email}</a>
            </Row>
            <Row icon={Phone} label={t.phone}>
              <a href={`tel:${COMPANY.phoneIntl}`} className="text-lg font-medium text-slate-900 hover:underline">{COMPANY.phone}</a>
            </Row>
            <Row icon={Clock} label={t.hours}>
              <p className="text-slate-800">{t.hoursValue}</p>
            </Row>
          </Reveal>

          <Reveal as="section" className="flex flex-col items-center rounded-3xl border border-brand-100 bg-brand-50 p-6 text-center sm:p-8" delay={0.1}>
            <h2 className="text-sm font-semibold text-slate-600">LINE Official Account</h2>
            <p className="mt-2 text-2xl font-bold text-slate-900">{COMPANY.lineOaId}</p>
            <p className="mt-2 max-w-sm text-sm text-slate-700">{t.lineSub}</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={COMPANY.lineOaQr} alt={t.qrAlt} width={220} height={220} className="mt-6 h-[220px] w-[220px] rounded-2xl border border-white bg-white p-2 shadow-sm" />
            <div className="mt-6">
              <Button href={COMPANY.lineOaUrl} external variant="line" size="lg">
                {t.addFriend} {COMPANY.lineOaId}
              </Button>
            </div>
            <p className="mt-3 break-all text-xs text-slate-600">{COMPANY.lineOaUrl}</p>
          </Reveal>
        </div>
      </main>
      <SiteFooter lang={lang} />
    </div>
  );
}
