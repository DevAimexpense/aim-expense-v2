// ===========================================
// หน้า /features และ /en/features — ฟีเจอร์ทั้งหมด แต่ละหมวดมี id (anchor) + รูป + ย่อหน้าแบบ "ตอบก่อน"
// เนื้อหาเขียนจากสิ่งที่ระบบทำได้จริงเท่านั้น (ดู src/app/(app)/* และ src/lib/plans.ts) — ห้ามโฆษณาฟีเจอร์ที่ยังไม่มี
// anchor capture / documents / reports ถูกลิงก์มาจากหน้าแรก (copy.ts → stories[].anchor)
// ===========================================
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SiteHeader } from "./site-header";
import { SiteFooter } from "./site-footer";
import { Button } from "./button";
import { Reveal } from "./reveal";
import { FeaturePhoto, type PhotoKind } from "./feature-photo";
import { COMPANY } from "@/lib/company";
import { JsonLd, breadcrumbJsonLd } from "@/lib/site-jsonld";
import { pageMeta, withLang, type Lang } from "@/lib/site-lang";

type Feature = { id: string; photo: PhotoKind; title: string; lead: string; paras: string[] };

const FEATURES: Record<Lang, Feature[]> = {
  th: [
    {
      id: "capture",
      photo: "receipt",
      title: "บันทึกค่าใช้จ่ายในแชต LINE",
      lead: "ถ่ายใบเสร็จส่งในแชต หรือพิมพ์สั้น ๆ ว่าจ่ายอะไรเท่าไร ระบบบันทึกเป็นรายการให้ทันที",
      paras: [
        "ส่งรูปใบเสร็จถึง LINE Official Account ของ Aim Expense ระบบอ่านชื่อร้าน วันที่ ยอดรวม และภาษีมูลค่าเพิ่มด้วย OCR ที่ฝึกกับใบเสร็จไทย แล้วตอบกลับเป็นการ์ดให้ตรวจก่อนบันทึก ถ้าไม่มีใบเสร็จ พิมพ์ข้อความอย่าง \"ค่าแท็กซี่ไปหาลูกค้า 250\" ก็บันทึกได้",
        "ผูกกลุ่ม LINE ของทีมหรือของโปรเจกต์เข้ากับบริษัทได้ รายการที่ส่งในกลุ่มจะเข้าโปรเจกต์นั้นโดยอัตโนมัติ และแยกได้ว่าเป็นเบิกเงินสดหรือโอนจากบัญชีบริษัท ทุกรายการมีรูปใบเสร็จต้นฉบับเก็บไว้ใน Google Drive ของคุณ",
        "รายการที่ไม่มีใบเสร็จ เช่น ค่าจ้างรายวัน ออกใบรับรองแทนใบเสร็จรับเงินจากในระบบได้ ไม่ต้องทำเอกสารแยก",
      ],
    },
    {
      id: "approvals",
      photo: "team",
      title: "ขั้นตอนอนุมัติและเตรียมจ่าย",
      lead: "ทุกรายการไหลตามขั้นตอน รอตรวจ → อนุมัติ → จ่าย → เคลียร์ และผู้เกี่ยวข้องได้รับแจ้งใน LINE",
      paras: [
        "พนักงานตั้งเบิก ผู้มีสิทธิ์กดอนุมัติหรือปฏิเสธพร้อมเหตุผล ฝ่ายบัญชีเห็นรายการที่พร้อมจ่ายในหน้าเตรียมจ่าย และปิดรายการเมื่อเคลียร์เงินแล้ว สถานะทุกขั้นถูกบันทึกพร้อมเวลาและผู้ทำรายการ",
        "บทบาทในบริษัทมีผู้ดูแล ฝ่ายบัญชี ผู้จัดการโปรเจกต์ และพนักงาน ผู้จัดการโปรเจกต์เห็นและอนุมัติเฉพาะโปรเจกต์ที่ตัวเองดูแล สิทธิ์แต่ละเมนูปรับรายคนได้จากหน้าสิทธิ์การใช้งาน",
      ],
    },
    {
      id: "documents",
      photo: "documents",
      title: "เอกสารรายรับและเอกสารภาษี",
      lead: "ออกใบเสนอราคา ใบวางบิล ใบเสร็จรับเงิน ใบกำกับภาษี และหนังสือรับรองหัก ณ ที่จ่าย บนฟอร์มที่ถูกต้องของไทย",
      paras: [
        "เอกสารรายรับทุกประเภทมีเลขรันอัตโนมัติแบบ ปี-เดือน-ลำดับ ใส่หัวกระดาษและโลโก้บริษัท ดึงข้อมูลลูกค้าจากทะเบียนลูกค้า และเลือกได้ว่าคิดภาษีมูลค่าเพิ่มหรือไม่ ธุรกิจที่ยังไม่จดทะเบียน VAT จึงออกใบเสร็จรับเงินได้ตั้งแต่วันแรก",
        "เมื่อจ่ายเงินที่ต้องหัก ณ ที่จ่าย ระบบออกหนังสือรับรอง 50 ทวิ ลงบนแบบฟอร์มของกรมสรรพากรให้ตรงช่อง พิมพ์เป็นต้นฉบับและสำเนา และรวบรวมเป็น ภ.ง.ด.3 / ภ.ง.ด.53 พร้อมใบแนบรายเดือนสำหรับนำส่ง",
        "ไฟล์ PDF ของเอกสารทุกใบถูกเก็บในโฟลเดอร์ Google Drive ของบริษัทคุณ และรายการบันทึกลง Google Sheet เพื่อส่งต่อให้นักบัญชีได้ทันที",
      ],
    },
    {
      id: "reports",
      photo: "reports",
      title: "รายงานและงบรายโปรเจกต์",
      lead: "เห็นค่าใช้จ่ายและงบคงเหลือของแต่ละโปรเจกต์ได้ทันที โดยไม่ต้องรอปิดงวด",
      paras: [
        "หน้ารายงานมีภาพรวมทั้งบริษัท แยกตามโปรเจกต์ แยกตามผู้รับเงิน สรุปค่าใช้จ่ายตามหมวดและช่วงเวลา รายการที่รอเคลียร์ รายงานภาษีซื้อ และรายงานภาษีหัก ณ ที่จ่าย กรองตามสถานะและประเภทการจ่ายได้",
        "แต่ละโปรเจกต์ตั้งงบประมาณได้ ระบบคำนวณงบคงเหลือและเปอร์เซ็นต์ที่ใช้ไปจากรายการที่บันทึก และเตือนเมื่อเกินงบ ส่วนบัญชีบุคคลธรรมดาจะเห็นรายรับที่เข้าโปรเจกต์เทียบกับที่เบิกใช้",
      ],
    },
    {
      id: "data",
      photo: "hero",
      title: "ข้อมูลอยู่ใน Google Sheet และ Drive ของคุณ",
      lead: "ระบบสร้างไฟล์ในบัญชี Google ของบริษัทตอนเริ่มใช้ และเขียนทุกรายการลงที่นั่น ไม่เก็บสำเนาข้อมูลธุรกิจบนเซิร์ฟเวอร์ของเรา",
      paras: [
        "Google Sheet แยกแท็บตามประเภทข้อมูล เช่น โปรเจกต์ รายจ่าย เอกสารรายรับ ใบกำกับภาษี ลูกค้า และผู้รับเงิน เปิดดู กรอง ทำกราฟ หรือดึงไปใช้กับเครื่องมืออื่นได้เหมือนไฟล์ปกติ และแชร์ให้นักบัญชีได้ด้วยการแชร์ไฟล์",
        "เลิกใช้เมื่อไหร่ ไฟล์ก็ยังอยู่ในไดรฟ์ของคุณครบถ้วน ไม่ต้องขอส่งออก",
      ],
    },
    {
      id: "multi",
      photo: "multi",
      title: "หลายธุรกิจ และบุคคลธรรมดา",
      lead: "บัญชีเดียวดูแลได้หลายบริษัท และรองรับฟรีแลนซ์หรือบุคคลธรรมดาที่ยังไม่จดทะเบียน",
      paras: [
        "สร้างบริษัทได้หลายแห่งตามแพ็กเกจ แต่ละแห่งมี Google Sheet สมาชิก และเอกสารของตัวเอง สลับบริษัทได้จากเมนูโดยไม่ต้องออกจากระบบ",
        "เลือกประเภทบัญชีเป็นบุคคลธรรมดาได้ เมนูจะปรับเป็นการบันทึกรายรับ-รายจ่าย ออกใบเสร็จรับเงินแบบไม่มี VAT และเก็บหนังสือรับรองหัก ณ ที่จ่ายที่ได้รับ สำหรับใช้ยื่นภาษีเงินได้บุคคลธรรมดา",
      ],
    },
  ],
  en: [
    {
      id: "capture",
      photo: "receipt",
      title: "Log expenses in LINE chat",
      lead: "Send a receipt photo in chat, or type what you paid and how much, and it is recorded immediately.",
      paras: [
        "Send a receipt photo to the Aim Expense LINE Official Account. OCR trained on Thai receipts reads the vendor, date, total and VAT, then replies with a card to confirm before saving. No receipt? A short message such as \"Taxi to client 250\" is enough.",
        "Bind a team or project LINE group to your company and everything posted there lands in that project automatically, tagged as petty cash or a company-account transfer. The original receipt image is kept in your Google Drive for every entry.",
        "For payments without a receipt, such as daily wages, issue a substitute receipt from inside the system instead of preparing a separate document.",
      ],
    },
    {
      id: "approvals",
      photo: "team",
      title: "Approval and payment preparation",
      lead: "Every entry moves through review → approved → paid → cleared, with LINE notifications to the people involved.",
      paras: [
        "Staff submit a claim, an approver accepts or rejects it with a reason, accounting sees what is ready to pay on the payment-prep screen, and closes the entry once the money is cleared. Each step is logged with time and user.",
        "Company roles are admin, accountant, project manager and staff. A project manager sees and approves only their own projects, and per-menu permissions can be adjusted per person from the permissions page.",
      ],
    },
    {
      id: "documents",
      photo: "documents",
      title: "Revenue and tax documents",
      lead: "Issue quotations, billing notes, receipts, tax invoices and withholding certificates on correct Thai forms.",
      paras: [
        "All revenue documents are numbered automatically as year-month-sequence, carry your letterhead and logo, pull customer details from the customer register, and can be issued with or without VAT, so a business that is not yet VAT-registered can issue receipts from day one.",
        "When a payment requires withholding, the system produces the 50 Tawi certificate on the Revenue Department's own form, prints original and copy, and compiles monthly PND.3 / PND.53 returns with attachments ready to file.",
        "The PDF of every document is stored in your company's Google Drive folder and the record is written to your Google Sheet, ready to hand to your accountant.",
      ],
    },
    {
      id: "reports",
      photo: "reports",
      title: "Reports and project budgets",
      lead: "See expenses and the remaining budget per project immediately, without waiting for month-end.",
      paras: [
        "The reports page covers a company overview, breakdowns by project and by payee, expense summaries by category and period, items awaiting clearance, an input-VAT report and a withholding-tax report, all filterable by status and payment type.",
        "Each project can carry a budget. The system computes the remaining balance and percentage used from recorded entries and flags overspend. Individual accounts see income received into the project against what was drawn.",
      ],
    },
    {
      id: "data",
      photo: "hero",
      title: "Your data lives in your Google Sheet and Drive",
      lead: "The system creates the files in your company's Google account when you start and writes every record there. We keep no copy of your business data on our servers.",
      paras: [
        "The Google Sheet has a tab per data type, such as projects, expenses, revenue documents, tax invoices, customers and payees. Open, filter, chart or connect it to other tools like any file, and share it with your accountant by sharing the file.",
        "If you stop using the service, the files stay in your Drive in full. There is nothing to export.",
      ],
    },
    {
      id: "multi",
      photo: "multi",
      title: "Multiple businesses and individuals",
      lead: "One account manages several companies, and freelancers or unregistered individuals are supported too.",
      paras: [
        "Create as many companies as your plan allows, each with its own Google Sheet, members and documents, and switch between them from the menu without signing out.",
        "Choose the individual account type and the menus adapt to logging income and expenses, issuing non-VAT receipts, and keeping the withholding certificates you receive for your personal income tax return.",
      ],
    },
  ],
};

const TEXT = {
  th: {
    title: "ฟีเจอร์ทั้งหมดของ Aim Expense",
    sub: "งานประจำวันทำในแชต LINE ที่ทีมใช้อยู่แล้ว เอกสารภาษีออกบนฟอร์มไทยที่ถูกต้อง และข้อมูลทั้งหมดอยู่ใน Google Sheet ของบริษัทคุณเอง",
    navLabel: "หัวข้อฟีเจอร์",
    ctaTitle: "ลองส่งใบเสร็จใบแรกวันนี้",
    ctaSub: "ทดลอง Pro ฟรี 30 วัน ครบทุกฟีเจอร์ ไม่ต้องใช้บัตรเครดิต",
    ctaPrimary: "ทดลองใช้ฟรี 30 วัน",
    ctaSecondary: "ดูราคา",
    askPre: "มีคำถามเรื่องการใช้งาน ทักมาที่ LINE OA",
    metaTitle: "ฟีเจอร์ — Aim Expense",
    metaDesc: "Aim Expense ทำอะไรได้บ้าง: OCR ใบเสร็จใน LINE ขั้นตอนอนุมัติ ใบกำกับภาษี หัก ณ ที่จ่าย 50 ทวิ ภ.ง.ด.3/53 รายงานรายโปรเจกต์ ข้อมูลใน Google Sheet ของคุณ",
  },
  en: {
    title: "Everything in Aim Expense",
    sub: "Daily work happens in the LINE chat your team already uses, tax documents come out on correct Thai forms, and all data stays in your company's own Google Sheet.",
    navLabel: "Feature sections",
    ctaTitle: "Send your first receipt today",
    ctaSub: "30-day Pro trial with every feature, no credit card.",
    ctaPrimary: "Start 30-day free trial",
    ctaSecondary: "See pricing",
    askPre: "Questions about how it works? Message our LINE OA",
    metaTitle: "Features — Aim Expense",
    metaDesc: "What Aim Expense does: OCR expense capture in LINE, approvals, tax invoices, 50 Tawi withholding, PND.3/53, project reports, data in your Google Sheet.",
  },
} as const;

export function featuresMeta(lang: Lang) {
  return pageMeta(lang, "/features", { title: TEXT[lang].metaTitle, description: TEXT[lang].metaDesc });
}

export function FeaturesPage({ lang }: { lang: Lang }) {
  const t = TEXT[lang];
  const items = FEATURES[lang];
  return (
    <div className="site-motion min-h-screen bg-white text-slate-900">
      <JsonLd data={breadcrumbJsonLd(lang, [{ name: t.title, path: "/features" }])} />
      <SiteHeader lang={lang} path="/features" />
      <main>
        <section className="border-b border-brand-100 bg-brand-50">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
            <h1 className="max-w-3xl text-balance text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">{t.title}</h1>
            <p className="mt-4 max-w-2xl text-pretty text-lg text-slate-700">{t.sub}</p>
            <nav aria-label={t.navLabel} className="mt-8 flex flex-wrap gap-2 text-sm">
              {items.map((f) => (
                <a key={f.id} href={`#${f.id}`} className="rounded-full border border-brand-200 bg-white px-3.5 py-1.5 font-medium text-slate-700 transition hover:border-brand-400 hover:text-brand-700">
                  {f.title}
                </a>
              ))}
            </nav>
          </div>
        </section>

        <div className="mx-auto max-w-6xl space-y-20 px-4 py-16 sm:px-6 lg:space-y-28 lg:py-24">
          {items.map((f, i) => {
            const flip = i % 2 === 1;
            return (
              <Reveal as="section" key={f.id} className="scroll-mt-24 grid items-center gap-8 lg:grid-cols-12 lg:gap-14">
                <div id={f.id} className={`lg:col-span-5 ${flip ? "lg:order-2" : ""}`}>
                  <h2 className="text-balance text-2xl font-bold tracking-tight sm:text-3xl">{f.title}</h2>
                  <p className="mt-3 text-pretty text-lg font-medium leading-relaxed text-brand-800">{f.lead}</p>
                  {f.paras.map((p, j) => (
                    <p key={j} className="mt-4 leading-relaxed text-slate-700">{p}</p>
                  ))}
                </div>
                <div className={`lg:col-span-7 ${flip ? "lg:order-1" : ""}`}>
                  <div className="lift overflow-hidden rounded-3xl shadow-xl shadow-slate-900/10">
                    <FeaturePhoto kind={f.photo} lang={lang} />
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>

        <section className="border-t border-brand-100 bg-brand-50">
          <Reveal className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 sm:py-20">
            <h2 className="text-balance text-2xl font-bold tracking-tight sm:text-3xl">{t.ctaTitle}</h2>
            <p className="mt-3 text-slate-700">{t.ctaSub}</p>
            <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
              <Button href="/login" size="lg">{t.ctaPrimary}</Button>
              <Link href={withLang(lang, "/pricing")} className="arrow-link inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-6 py-3 text-base font-medium text-slate-700 transition hover:bg-slate-50">
                {t.ctaSecondary}
                <ArrowRight size={18} aria-hidden />
              </Link>
            </div>
            <p className="mt-5 text-sm text-slate-600">
              {t.askPre}{" "}
              <a href={COMPANY.lineOaUrl} target="_blank" rel="noreferrer" className="font-semibold text-brand-700 hover:underline">{COMPANY.lineOaId}</a>
            </p>
          </Reveal>
        </section>
      </main>
      <SiteFooter lang={lang} />
    </div>
  );
}
