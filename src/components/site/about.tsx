// หน้า /about และ /en/about — ที่มาของระบบ + ข้อมูลนิติบุคคล (ตรงกับที่ยื่น LINE OA verification: ชื่อ ที่อยู่ เลขทะเบียน อีเมล LINE OA เป็นข้อความธรรมดา)
import Link from "next/link";
import { SiteHeader } from "./site-header";
import { SiteFooter } from "./site-footer";
import { Reveal } from "./reveal";
import { FeaturePhoto } from "./feature-photo";
import { COMPANY } from "@/lib/company";
import { JsonLd, breadcrumbJsonLd } from "@/lib/site-jsonld";
import { pageMeta, withLang, type Lang } from "@/lib/site-lang";

const TEXT = {
  th: {
    title: "เกี่ยวกับเรา",
    sub: "ระบบบัญชีค่าใช้จ่ายและเอกสารภาษีผ่าน LINE สำหรับ SME ไทย ที่ข้อมูลเป็นของบริษัทคุณเอง",
    paras: [
      "Aim Expense เกิดจากปัญหาที่เราเจอเองในธุรกิจขนาดเล็กของไทย ใบเสร็จกองอยู่ในกลุ่ม LINE ค่าใช้จ่ายถูกจดในสมุดหรือ Excel ที่ไม่มีใครอัปเดต และทุกสิ้นเดือนต้องไล่หาเอกสารเพื่อออกหนังสือรับรองหัก ณ ที่จ่ายและสรุป ภ.ง.ด. ให้นักบัญชี โปรแกรมบัญชีที่มีในตลาดส่วนใหญ่ซับซ้อนเกินความจำเป็นสำหรับทีมเล็ก และเก็บข้อมูลไว้กับผู้ให้บริการ",
      "เราจึงสร้าง Aim Expense ให้งานประจำวันเกิดขึ้นในแชต LINE ที่ทุกคนเปิดอยู่แล้ว และเก็บข้อมูลทั้งหมดใน Google Sheet และ Drive ของลูกค้าเอง บริษัทเป็นเจ้าของข้อมูลจริง เปิดดูได้ตลอด ย้ายออกได้ทุกเมื่อ เอกสารภาษีทุกใบอ้างอิงแบบฟอร์มของกรมสรรพากร ไม่ใช่เทมเพลตต่างประเทศที่ปรับมา",
    ],
    sisterPre: "Aim Expense เป็นผลิตภัณฑ์พี่น้องของ",
    sisterPost: "ระบบ HR และลงเวลาผ่าน LINE สำหรับ SME ไทย ที่ใช้แนวคิดเดียวกัน ทั้งสองระบบพัฒนาและดูแลโดยทีมเดียวกันภายใต้นิติบุคคลเดียวกัน",
    legal: "ข้อมูลนิติบุคคล", regNo: "เลขทะเบียนนิติบุคคล", contact: "ติดต่อ", contactLink: "หน้าติดต่อ",
    metaTitle: "เกี่ยวกับเรา — Aim Expense",
    metaDesc: `Aim Expense พัฒนาโดย ${COMPANY.nameTh} เพื่อ SME ไทย: ทำบัญชีและเอกสารภาษีผ่าน LINE โดยข้อมูลเป็นของบริษัทเอง ผลิตภัณฑ์พี่น้องของ Aim HR Expert`,
  },
  en: {
    title: "About us",
    sub: "LINE-based expense accounting and Thai tax documents for SMEs, with data that belongs to your company.",
    paras: [
      "Aim Expense grew out of problems we ran into ourselves in small Thai businesses. Receipts piled up in LINE groups, expenses were jotted in notebooks or an Excel file nobody updated, and every month-end meant hunting for paperwork to issue withholding certificates and PND summaries for the accountant. Most accounting software on the market is more complex than a small team needs, and keeps the data with the vendor.",
      "So we built Aim Expense to make daily work happen in LINE chat, which everyone already has open, and to keep every record in the customer's own Google Sheet and Drive. The company genuinely owns its data, can open it at any time, and can leave whenever it wants. Every tax document follows the Revenue Department's forms rather than an adapted foreign template.",
    ],
    sisterPre: "Aim Expense is the sister product of",
    sisterPost: "the LINE-based HR and attendance system for Thai SMEs built on the same idea. Both products are developed and supported by the same team under the same legal entity.",
    legal: "Company details", regNo: "Registration No.", contact: "Contact", contactLink: "contact page",
    metaTitle: "About — Aim Expense",
    metaDesc: `Aim Expense is built by ${COMPANY.nameEn} for Thai SMEs: accounting and tax documents through LINE with data the company owns. Sister product of Aim HR Expert.`,
  },
} as const;

export function aboutMeta(lang: Lang) {
  return pageMeta(lang, "/about", { title: TEXT[lang].metaTitle, description: TEXT[lang].metaDesc });
}

export function AboutPage({ lang }: { lang: Lang }) {
  const t = TEXT[lang];
  return (
    <div className="site-motion min-h-screen bg-white text-slate-900">
      <JsonLd data={breadcrumbJsonLd(lang, [{ name: t.title, path: "/about" }])} />
      <SiteHeader lang={lang} path="/about" />
      <main>
        <section className="border-b border-brand-100 bg-brand-50">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
            <h1 className="max-w-3xl text-balance text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">{t.title}</h1>
            <p className="mt-4 max-w-2xl text-pretty text-lg text-slate-700">{t.sub}</p>
          </div>
        </section>

        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
          <Reveal className="grid items-center gap-10 lg:grid-cols-12 lg:gap-14">
            <div className="space-y-5 text-lg leading-relaxed text-slate-700 lg:col-span-7">
              {t.paras.map((p, i) => <p key={i}>{p}</p>)}
              <p>
                {t.sisterPre}{" "}
                <a href={COMPANY.sisterProduct.url} target="_blank" rel="noreferrer" className="font-semibold text-brand-700 hover:underline">{COMPANY.sisterProduct.name}</a>{" "}
                {t.sisterPost}
              </p>
            </div>
            <div className="lg:col-span-5">
              <div className="lift overflow-hidden rounded-3xl shadow-xl shadow-slate-900/10">
                <FeaturePhoto kind="team" lang={lang} />
              </div>
            </div>
          </Reveal>

          <Reveal as="section" className="mt-16 rounded-3xl border border-brand-100 bg-brand-50 p-6 sm:p-8" delay={0.1}>
            <h2 className="text-sm font-semibold text-brand-700">{t.legal}</h2>
            <p className="mt-3 text-lg font-semibold text-slate-900">{lang === "en" ? COMPANY.nameEn : COMPANY.nameTh}</p>
            <p className="text-slate-700">{lang === "en" ? COMPANY.nameTh : COMPANY.nameEn}</p>
            <address className="mt-2 not-italic leading-relaxed text-slate-700">{lang === "en" ? COMPANY.addressEn : COMPANY.address}</address>
            <p className="mt-1 text-sm text-slate-600">{t.regNo} {COMPANY.registrationNo}</p>
            <p className="mt-4 text-slate-700">
              {t.contact}{" "}
              <a href={`mailto:${COMPANY.email}`} className="font-medium text-brand-700 hover:underline">{COMPANY.email}</a>
              {" · "}LINE OA{" "}
              <a href={COMPANY.lineOaUrl} target="_blank" rel="noreferrer" className="font-medium text-brand-700 hover:underline">{COMPANY.lineOaId}</a>
              {" · "}
              <Link href={withLang(lang, "/contact")} className="font-medium text-brand-700 hover:underline">{t.contactLink}</Link>
            </p>
          </Reveal>
        </div>
      </main>
      <SiteFooter lang={lang} />
    </div>
  );
}
