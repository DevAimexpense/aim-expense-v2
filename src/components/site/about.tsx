// หน้า /about และ /en/about — ที่มาของระบบ + ข้อมูลนิติบุคคล (ตรงกับที่ยื่น LINE OA verification)
import Link from "next/link";
import { SiteHeader } from "./site-header";
import { SiteFooter } from "./site-footer";
import { COMPANY } from "@/lib/company";
import { pageMeta, withLang, type Lang } from "@/lib/site-lang";

const TEXT = {
  th: {
    title: "เกี่ยวกับเรา",
    paras: [
      "Aim Expense เกิดจากปัญหาที่เราเจอเองในธุรกิจขนาดเล็กของไทย ใบเสร็จกองอยู่ในกลุ่ม LINE ค่าใช้จ่ายถูกจดในสมุดหรือ Excel ที่ไม่มีใครอัปเดต และทุกสิ้นเดือนต้องไล่หาเอกสารเพื่อออกหนังสือรับรองหัก ณ ที่จ่ายและสรุป ภ.ง.ด. ให้นักบัญชี โปรแกรมบัญชีที่มีในตลาดส่วนใหญ่ซับซ้อนเกินความจำเป็นสำหรับทีมเล็ก และเก็บข้อมูลไว้กับผู้ให้บริการ",
      "เราจึงสร้าง Aim Expense ให้งานประจำวันเกิดขึ้นในแชต LINE ที่ทุกคนเปิดอยู่แล้ว และเก็บข้อมูลทั้งหมดใน Google Sheet และ Drive ของลูกค้าเอง บริษัทเป็นเจ้าของข้อมูลจริง เปิดดูได้ตลอด ย้ายออกได้ทุกเมื่อ เอกสารภาษีทุกใบอ้างอิงแบบฟอร์มของกรมสรรพากร ไม่ใช่เทมเพลตต่างประเทศที่ปรับมา",
    ],
    sisterPre: "Aim Expense เป็นผลิตภัณฑ์พี่น้องของ",
    sisterPost: "ระบบ HR และลงเวลาผ่าน LINE สำหรับ SME ไทย ที่ใช้แนวคิดเดียวกัน ทั้งสองระบบพัฒนาและดูแลโดยทีมเดียวกันภายใต้นิติบุคคลเดียวกัน",
    legal: "ข้อมูลนิติบุคคล", regNo: "เลขทะเบียนนิติบุคคล", contact: "ติดต่อ", contactLink: "หน้าติดต่อ",
    metaTitle: "เกี่ยวกับเรา — Aim Expense",
    metaDesc: `Aim Expense พัฒนาโดย ${COMPANY.nameTh} จากปัญหาจริงของ SME ไทยที่ต้องการทำบัญชีและเอกสารภาษีผ่าน LINE โดยข้อมูลเป็นของบริษัทเอง ผลิตภัณฑ์พี่น้องของ Aim HR Expert`,
  },
  en: {
    title: "About us",
    paras: [
      "Aim Expense grew out of problems we ran into ourselves in small Thai businesses. Receipts piled up in LINE groups, expenses were jotted in notebooks or an Excel file nobody updated, and every month-end meant hunting for paperwork to issue withholding certificates and PND summaries for the accountant. Most accounting software on the market is more complex than a small team needs, and keeps the data with the vendor.",
      "So we built Aim Expense to make daily work happen in LINE chat, which everyone already has open, and to keep every record in the customer's own Google Sheet and Drive. The company genuinely owns its data, can open it at any time, and can leave whenever it wants. Every tax document follows the Revenue Department's forms rather than an adapted foreign template.",
    ],
    sisterPre: "Aim Expense is the sister product of",
    sisterPost: "the LINE-based HR and attendance system for Thai SMEs built on the same idea. Both products are developed and supported by the same team under the same legal entity.",
    legal: "Company details", regNo: "Registration No.", contact: "Contact", contactLink: "contact page",
    metaTitle: "About — Aim Expense",
    metaDesc: `Aim Expense is built by ${COMPANY.nameEn} from real problems of Thai SMEs that want accounting and tax documents through LINE with data they own. Sister product of Aim HR Expert.`,
  },
} as const;

export function aboutMeta(lang: Lang) {
  return pageMeta(lang, "/about", { title: TEXT[lang].metaTitle, description: TEXT[lang].metaDesc });
}

export function AboutPage({ lang }: { lang: Lang }) {
  const t = TEXT[lang];
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <SiteHeader lang={lang} path="/about" />
      <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-24">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t.title}</h1>
        <div className="mt-6 space-y-5 text-lg leading-relaxed text-slate-700">
          {t.paras.map((p, i) => <p key={i}>{p}</p>)}
          <p>
            {t.sisterPre}{" "}
            <a href={COMPANY.sisterProduct.url} target="_blank" rel="noreferrer" className="font-semibold text-brand-700 hover:underline">{COMPANY.sisterProduct.name}</a>{" "}
            {t.sisterPost}
          </p>
        </div>
        <section className="mt-12 rounded-2xl border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-600">{t.legal}</h2>
          <p className="mt-3 font-medium text-slate-900">{lang === "en" ? COMPANY.nameEn : COMPANY.nameTh}</p>
          <p className="text-slate-700">{lang === "en" ? COMPANY.nameTh : COMPANY.nameEn}</p>
          <address className="mt-2 not-italic leading-relaxed text-slate-700">{lang === "en" ? COMPANY.addressEn : COMPANY.address}</address>
          <p className="mt-1 text-sm text-slate-600">{t.regNo} {COMPANY.registrationNo}</p>
          <p className="mt-3 text-sm text-slate-700">
            {t.contact}{" "}
            <a href={`mailto:${COMPANY.email}`} className="text-brand-700 hover:underline">{COMPANY.email}</a>
            {" · "}LINE OA {COMPANY.lineOaId}{" · "}
            <Link href={withLang(lang, "/contact")} className="text-brand-700 hover:underline">{t.contactLink}</Link>
          </p>
        </section>
      </main>
      <SiteFooter lang={lang} />
    </div>
  );
}
