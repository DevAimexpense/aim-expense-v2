// หน้า /contact และ /en/contact — ใช้ยื่น LINE OA verification: ข้อมูลทั้งหมด render จาก server
// อีเมล เบอร์ และ LINE OA เป็นข้อความธรรมดาใน HTML ไม่มีฟอร์ม
import { SiteHeader } from "./site-header";
import { SiteFooter } from "./site-footer";
import { COMPANY } from "@/lib/company";
import { pageMeta, type Lang } from "@/lib/site-lang";

const TEXT = {
  th: {
    title: "ติดต่อเรา",
    sub: "ยินดีตอบคำถามเรื่องการใช้งาน Aim Expense การตั้งค่าบริษัท และการสมัครใช้งาน",
    company: "บริษัท", regNo: "เลขทะเบียนนิติบุคคล", email: "อีเมล", phone: "โทรศัพท์", hours: "เวลาทำการ",
    hoursValue: "จันทร์–ศุกร์ 09:00–18:00 น. (ยกเว้นวันหยุดนักขัตฤกษ์)",
    lineSub: "เพิ่มเพื่อนเพื่อสอบถาม หรือเริ่มใช้งาน Aim Expense ผ่าน LINE",
    qrAlt: `QR code เพิ่มเพื่อน LINE Official Account ${COMPANY.lineOaId}`,
    addFriend: "เพิ่มเพื่อน",
    metaTitle: "ติดต่อเรา — Aim Expense",
    metaDesc: `ติดต่อ ${COMPANY.nameTh} ผู้ให้บริการ Aim Expense ระบบบัญชีค่าใช้จ่ายและภาษีผ่าน LINE สำหรับ SME ไทย · อีเมล ${COMPANY.email} · โทร ${COMPANY.phone} · LINE OA ${COMPANY.lineOaId}`,
  },
  en: {
    title: "Contact us",
    sub: "Happy to answer questions about using Aim Expense, setting up your company, or getting started.",
    company: "Company", regNo: "Registration No.", email: "Email", phone: "Phone", hours: "Business hours",
    hoursValue: "Monday–Friday 09:00–18:00 (Bangkok time, except public holidays)",
    lineSub: "Add us as a friend to ask questions or start using Aim Expense through LINE.",
    qrAlt: `QR code to add LINE Official Account ${COMPANY.lineOaId}`,
    addFriend: "Add friend",
    metaTitle: "Contact — Aim Expense",
    metaDesc: `Contact ${COMPANY.nameEn}, provider of Aim Expense, the LINE-based expense and tax system for Thai SMEs · Email ${COMPANY.email} · Phone ${COMPANY.phone} · LINE OA ${COMPANY.lineOaId}`,
  },
} as const;

export function contactMeta(lang: Lang) {
  return pageMeta(lang, "/contact", { title: TEXT[lang].metaTitle, description: TEXT[lang].metaDesc });
}

export function ContactPage({ lang }: { lang: Lang }) {
  const t = TEXT[lang];
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <SiteHeader lang={lang} path="/contact" />
      <main className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t.title}</h1>
        <p className="mt-3 text-slate-700">{t.sub}</p>
        <div className="mt-10 grid gap-8 md:grid-cols-2">
          <section className="space-y-5 rounded-2xl border border-slate-200 p-6">
            <div>
              <h2 className="text-sm font-semibold text-slate-600">{t.company}</h2>
              <p className="mt-2 font-medium text-slate-900">{lang === "en" ? COMPANY.nameEn : COMPANY.nameTh}</p>
              <p className="text-slate-700">{lang === "en" ? COMPANY.nameTh : COMPANY.nameEn}</p>
              <address className="mt-2 not-italic leading-relaxed text-slate-700">{lang === "en" ? COMPANY.addressEn : COMPANY.address}</address>
              <p className="mt-1 text-sm text-slate-600">{t.regNo} {COMPANY.registrationNo}</p>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-600">{t.email}</h2>
              <p className="mt-2">
                <a href={`mailto:${COMPANY.email}`} className="break-all text-lg font-medium text-brand-700 hover:underline">{COMPANY.email}</a>
              </p>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-600">{t.phone}</h2>
              <p className="mt-2">
                <a href={`tel:${COMPANY.phoneIntl}`} className="text-lg font-medium text-slate-900 hover:underline">{COMPANY.phone}</a>
              </p>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-600">{t.hours}</h2>
              <p className="mt-2 text-slate-800">{t.hoursValue}</p>
            </div>
          </section>
          <section className="flex flex-col items-center rounded-2xl border border-slate-200 p-6 text-center">
            <h2 className="text-sm font-semibold text-slate-600">LINE Official Account</h2>
            <p className="mt-2 text-2xl font-bold text-slate-900">{COMPANY.lineOaId}</p>
            <p className="mt-1 text-sm text-slate-700">{t.lineSub}</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={COMPANY.lineOaQr} alt={t.qrAlt} width={220} height={220} className="mt-5 h-[220px] w-[220px] rounded-xl border border-slate-200" />
            <a href={COMPANY.lineOaUrl} target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center rounded-xl bg-[#06C755] px-5 py-2.5 font-semibold text-white hover:opacity-90">
              {t.addFriend} {COMPANY.lineOaId}
            </a>
            <p className="mt-3 break-all text-xs text-slate-600">{COMPANY.lineOaUrl}</p>
          </section>
        </div>
      </main>
      <SiteFooter lang={lang} />
    </div>
  );
}
