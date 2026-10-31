// ===========================================
// หน้า /pricing และ /en/pricing — การ์ดแพ็กเกจ (toggle รอบจ่าย) + ตารางเปรียบเทียบ + คำถามเรื่องการชำระเงิน + FAQPage JSON-LD
// - ราคา/โควตามาจาก src/lib/plans.ts เท่านั้น · ไม่มีแพ็กเกจฟรี เริ่มที่ Basic
// - คำตอบเรื่องการคิดเงินเขียนจากพฤติกรรมจริง: ทดลอง Pro 30 วันไม่ต้องใช้บัตร, Stripe รับบัตรเครดิต/เดบิต,
//   รอบรายเดือน/รายปี, จัดการ/ยกเลิกผ่าน Stripe Customer Portal, โค้ดแนะนำลด 20% ใบแรก (REFERRAL_DISCOUNT)
// - เอกสารรายรับ (ใบเสนอราคา/ใบวางบิล/ใบเสร็จ/ใบกำกับภาษี) เปิดเฉพาะ Pro ขึ้นไป (require-plan "revenueModule")
// ===========================================
import { Check, Minus } from "lucide-react";
import { SiteHeader } from "./site-header";
import { SiteFooter } from "./site-footer";
import { Reveal } from "./reveal";
import { PricingCards } from "./pricing-cards";
import { HOME, faqJsonLd } from "./copy";
import { PLAN_LABELS, PLAN_LIMITS, REFERRAL_DISCOUNT, TRIAL_DURATION_DAYS, hasFeature, type PlanTier } from "@/lib/plans";
import { COMPANY } from "@/lib/company";
import { JsonLd, breadcrumbJsonLd } from "@/lib/site-jsonld";
import { pageMeta, type Lang } from "@/lib/site-lang";

const TABLE_TIERS: PlanTier[] = ["basic", "pro", "business", "max", "enterprise"];

const TEXT = {
  th: {
    title: "ราคาและแพ็กเกจ",
    sub: `ทุกบัญชีได้ทดลอง Pro ครบทุกฟีเจอร์ ${TRIAL_DURATION_DAYS} วันโดยไม่ต้องใช้บัตร หมดช่วงทดลองค่อยเลือกแพ็กเกจที่พอดีกับทีม ยกเลิกได้ตลอดเวลา`,
    compare: "เปรียบเทียบทุกแพ็กเกจ",
    feature: "รายการ",
    quotas: [
      ["ผู้ใช้ในบริษัท", "users"],
      ["จำนวนบริษัท", "businesses"],
      ["โปรเจกต์ที่เปิดพร้อมกัน", "events"],
      ["OCR อ่านใบเสร็จ ต่อเดือน", "ocrPerMonth"],
      ["กลุ่ม LINE ที่ผูกได้", "lineGroups"],
    ] as const,
    allPlans: "ทุกแพ็กเกจ",
    allPlansItems: [
      "บันทึกค่าใช้จ่ายในแชต LINE ด้วย OCR และข้อความ",
      "ขั้นตอนอนุมัติ เตรียมจ่าย และเคลียร์",
      "หนังสือรับรองหัก ณ ที่จ่าย 50 ทวิ และ ภ.ง.ด.3 / ภ.ง.ด.53",
      "ใบรับรองแทนใบเสร็จรับเงิน",
      "รายงานภาพรวม รายโปรเจกต์ รายผู้รับเงิน และภาษี",
      "ข้อมูลใน Google Sheet และ Drive ของคุณ",
    ],
    revenue: "เอกสารรายรับ: ใบเสนอราคา ใบวางบิล ใบเสร็จรับเงิน ใบกำกับภาษี",
    unlimited: "ไม่จำกัด",
    none: "—",
    faqTitle: "คำถามเรื่องการชำระเงิน",
    footnote: `ราคาเป็นเงินบาท ชำระผ่าน Stripe ด้วยบัตรเครดิตหรือเดบิต มีคำถามเรื่องราคา ติดต่อ ${COMPANY.email}`,
    metaTitle: "ราคาและแพ็กเกจ — Aim Expense",
    metaDesc: `Aim Expense เริ่มต้น ฿189/เดือน (Basic) · Pro ฿399 · Business ฿699 · Max ฿1,499 รายปีคิด 10 เดือน ทดลอง Pro ฟรี ${TRIAL_DURATION_DAYS} วันไม่ต้องใช้บัตร ยกเลิกได้ตลอด`,
  },
  en: {
    title: "Pricing",
    sub: `Every account gets a full-featured ${TRIAL_DURATION_DAYS}-day Pro trial with no card. When it ends, pick the plan that fits your team. Cancel anytime.`,
    compare: "Compare every plan",
    feature: "Item",
    quotas: [
      ["Users per company", "users"],
      ["Companies", "businesses"],
      ["Open projects", "events"],
      ["OCR receipt scans per month", "ocrPerMonth"],
      ["Bound LINE groups", "lineGroups"],
    ] as const,
    allPlans: "Every plan",
    allPlansItems: [
      "Expense capture in LINE chat by OCR and text",
      "Approval, payment-prep and clearance flow",
      "50 Tawi withholding certificates and PND.3 / PND.53",
      "Substitute receipts",
      "Overview, per-project, per-payee and tax reports",
      "Data in your own Google Sheet and Drive",
    ],
    revenue: "Revenue documents: quotations, billing notes, receipts, tax invoices",
    unlimited: "Unlimited",
    none: "—",
    faqTitle: "Billing questions",
    footnote: `Prices in Thai baht, paid through Stripe by credit or debit card. Pricing questions: ${COMPANY.email}`,
    metaTitle: "Pricing — Aim Expense",
    metaDesc: `Aim Expense from ฿189/month (Basic), Pro ฿399, Business ฿699, Max ฿1,499; yearly costs 10 months. Free ${TRIAL_DURATION_DAYS}-day Pro trial, no card, cancel anytime.`,
  },
} as const;

const BILLING_FAQ: Record<Lang, Array<{ q: string; a: string }>> = {
  th: [
    { q: `ทดลองใช้ฟรี ${TRIAL_DURATION_DAYS} วัน ต้องใส่บัตรไหม`, a: `ไม่ต้อง เข้าสู่ระบบด้วย LINE แล้วเชื่อม Google ก็เริ่มได้ทันที ระหว่างทดลองได้สิทธิ์เท่าแพ็กเกจ Pro ครบ ${TRIAL_DURATION_DAYS} วัน ถ้าจะใช้ต่อค่อยเลือกแพ็กเกจและชำระเงินตอนนั้น` },
    { q: "จ่ายด้วยอะไรได้บ้าง", a: "บัตรเครดิตหรือบัตรเดบิต ผ่านระบบชำระเงิน Stripe ข้อมูลบัตรอยู่กับ Stripe เท่านั้น ไม่ผ่านเซิร์ฟเวอร์ของเรา" },
    { q: "รายเดือนกับรายปีต่างกันอย่างไร", a: "ฟีเจอร์และโควตาเหมือนกัน รายปีคิดเท่ากับ 10 เดือน (ได้ใช้ฟรี 2 เดือน) เปลี่ยนรอบหรือแพ็กเกจได้จากหน้าจัดการการชำระเงิน" },
    { q: "ใช้เกินโควตาของแพ็กเกจจะเป็นอย่างไร", a: "ระบบจะแจ้งให้อัปเกรดก่อนเพิ่มผู้ใช้ บริษัท หรือโปรเจกต์ที่เกินจำนวน ส่วน OCR เมื่อครบจำนวนของเดือน รายการยังบันทึกด้วยการพิมพ์ข้อความได้ และโควตาเริ่มนับใหม่ทุกเดือน ข้อมูลเดิมไม่หาย" },
    { q: "เปลี่ยนแพ็กเกจหรือยกเลิกได้เมื่อไหร่", a: "ได้ตลอดเวลาจากเมนูแพ็กเกจในระบบ ซึ่งเปิดหน้าจัดการของ Stripe ให้เปลี่ยนบัตร เปลี่ยนแพ็กเกจ ดูใบแจ้งหนี้ย้อนหลัง หรือยกเลิก ยกเลิกแล้วใช้ได้ถึงวันสิ้นสุดรอบที่จ่ายไว้" },
    { q: "ขอใบเสร็จรับเงินได้ไหม", a: `ใบเสร็จและใบแจ้งหนี้ของทุกรอบดูและดาวน์โหลดได้จากหน้าจัดการการชำระเงิน หากต้องการใบกำกับภาษีเต็มรูปในนามบริษัท แจ้งข้อมูลนิติบุคคลมาที่ ${COMPANY.email}` },
    { q: "มีโค้ดแนะนำจากเพื่อนหรือพาร์ตเนอร์ ใช้อย่างไร", a: `เข้าระบบผ่านลิงก์ของผู้แนะนำ ส่วนลด ${REFERRAL_DISCOUNT.firstInvoicePercentOff}% สำหรับใบแจ้งหนี้ใบแรกจะถูกใส่ให้อัตโนมัติตอนชำระเงิน` },
    { q: "ยกเลิกแล้วข้อมูลหายไหม", a: "ไม่หาย ข้อมูลทั้งหมดอยู่ใน Google Sheet และ Drive ของบริษัทคุณ ยกเลิกแล้วยังเปิดดูและใช้ไฟล์ได้ตามปกติ" },
  ],
  en: [
    { q: `Does the ${TRIAL_DURATION_DAYS}-day free trial need a card?`, a: `No. Sign in with LINE, connect Google and you are in. During the trial you get the full Pro plan for ${TRIAL_DURATION_DAYS} days, and you choose a plan and pay only if you decide to continue.` },
    { q: "How can I pay?", a: "Credit or debit card through Stripe. Card details stay with Stripe and never touch our servers." },
    { q: "What is the difference between monthly and yearly?", a: "Features and quotas are identical. Yearly costs the same as 10 months (2 months free), and you can switch period or plan from the billing management page." },
    { q: "What happens if I exceed my plan's quota?", a: "The system asks you to upgrade before adding a user, company or project beyond the limit. When the month's OCR scans are used up you can still log entries by text, and the quota resets every month. Existing data is never lost." },
    { q: "When can I change plan or cancel?", a: "Anytime from the plan menu in the app, which opens Stripe's management page to change card, change plan, view past invoices or cancel. After cancelling you keep access until the end of the paid period." },
    { q: "Can I get a receipt?", a: `Receipts and invoices for every period can be viewed and downloaded from the billing management page. For a full tax invoice in your company's name, send your company details to ${COMPANY.email}` },
    { q: "I have a referral code from a friend or partner. How do I use it?", a: `Sign in through the referrer's link and the ${REFERRAL_DISCOUNT.firstInvoicePercentOff}% discount on your first invoice is applied automatically at checkout.` },
    { q: "Do I lose my data if I cancel?", a: "No. All data lives in your company's Google Sheet and Drive. After cancelling you can still open and use the files as usual." },
  ],
};

export function pricingMeta(lang: Lang) {
  return pageMeta(lang, "/pricing", { title: TEXT[lang].metaTitle, description: TEXT[lang].metaDesc });
}

export function PricingPage({ lang }: { lang: Lang }) {
  const t = TEXT[lang];
  const faq = BILLING_FAQ[lang];
  const cell = (n: number) => (n === -1 ? t.unlimited : n === 0 ? t.none : n.toLocaleString("en-US"));
  return (
    <div className="site-motion min-h-screen bg-white text-slate-900">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd(lang, faq)) }} />
      <JsonLd data={breadcrumbJsonLd(lang, [{ name: t.title, path: "/pricing" }])} />
      <SiteHeader lang={lang} path="/pricing" />
      <main>
        <section className="border-b border-brand-100 bg-brand-50">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
            <div className="mx-auto max-w-2xl text-center">
              <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">{t.title}</h1>
              <p className="mt-4 text-pretty text-lg text-slate-700">{t.sub}</p>
            </div>
            <div className="mt-10">
              <PricingCards t={HOME[lang].pricing} lang={lang} full />
            </div>
          </div>
        </section>

        <Reveal as="section" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
          <h2 className="text-balance text-2xl font-bold tracking-tight sm:text-3xl">{t.compare}</h2>
          <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full min-w-[40rem] text-sm">
              <thead>
                <tr className="bg-brand-50 text-left">
                  <th className="px-4 py-3 font-semibold text-slate-700">{t.feature}</th>
                  {TABLE_TIERS.map((tier) => (
                    <th key={tier} className={`px-4 py-3 text-center font-semibold ${tier === "pro" ? "text-brand-700" : "text-slate-700"}`}>{PLAN_LABELS[tier]}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {t.quotas.map(([label, key]) => (
                  <tr key={key}>
                    <td className="px-4 py-2.5 text-slate-800">{label}</td>
                    {TABLE_TIERS.map((tier) => (
                      <td key={tier} className="px-4 py-2.5 text-center tabular-nums text-slate-800">{cell(PLAN_LIMITS[tier][key])}</td>
                    ))}
                  </tr>
                ))}
                <tr>
                  <td className="px-4 py-2.5 text-slate-800">{t.revenue}</td>
                  {TABLE_TIERS.map((tier) => (
                    <td key={tier} className="px-4 py-2.5 text-center">
                      {hasFeature(tier, "revenueModule") ? (
                        <Check size={18} className="inline text-brand-600" aria-label="✓" />
                      ) : (
                        <Minus size={18} className="inline text-slate-300" aria-label="—" />
                      )}
                    </td>
                  ))}
                </tr>
                {t.allPlansItems.map((label) => (
                  <tr key={label}>
                    <td className="px-4 py-2.5 text-slate-800">{label}</td>
                    <td colSpan={TABLE_TIERS.length} className="px-4 py-2.5 text-center text-slate-600">
                      <span className="inline-flex items-center gap-1.5"><Check size={16} className="text-brand-600" aria-hidden />{t.allPlans}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-sm text-slate-600">{t.footnote}</p>
        </Reveal>

        <section className="border-t border-brand-100 bg-brand-50">
          <Reveal className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:py-24">
            <h2 className="text-balance text-2xl font-bold tracking-tight sm:text-3xl">{t.faqTitle}</h2>
            <div className="mt-6 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
              {faq.map((f) => (
                <details key={f.q} className="group px-5 py-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
                    {f.q}
                    <span className="text-slate-400 transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-2 leading-relaxed text-slate-700">{f.a}</p>
                </details>
              ))}
            </div>
          </Reveal>
        </section>
      </main>
      <SiteFooter lang={lang} />
    </div>
  );
}
