// ===========================================
// หน้าแรกของเว็บสาธารณะ (/ และ /en) — โครงเดียวกับ aim-hr: Hero น้ำเงินเข้ม + แชต LINE เล่นเป็นลำดับ
// → 3 เรื่องใหญ่สลับซ้าย-ขวา (มีรูป) → ข้อมูลของคุณ (Google Sheet จำลอง เติมแถวทีละแถว)
// → 3 ขั้นตอน (ไทม์ไลน์วาดเส้น) → ราคา (toggle) → FAQ ย่อ → CTA + QR → ฟุตเตอร์
// - server component: ข้อความทั้งหมดอยู่ใน HTML แรก (AEO + LINE OA verification)
// - animation เป็นของแถม: <Reveal> ซ่อนเฉพาะเมื่อ JS เติม js-reveal · reduced-motion ปิดทั้งหมด
// - สีแบรนด์: น้ำเงิน + เหลืองโลโก้ (accent) · เขียวเฉพาะ mock แชต LINE และปุ่มเพิ่มเพื่อน · ไม่มีตัวเลขปลอม
// ===========================================

import Link from "next/link";
import { ArrowRight, Check, ShieldCheck, Table } from "lucide-react";
import { SiteHeader } from "./site-header";
import { SiteFooter } from "./site-footer";
import { Button } from "./button";
import { Reveal } from "./reveal";
import { FeaturePhoto } from "./feature-photo";
import { PricingCards } from "./pricing-cards";
import { HOME, FAQ, faqJsonLd } from "./copy";
import { Logo } from "./logo";
import { COMPANY } from "@/lib/company";
import { withLang, type Lang } from "@/lib/site-lang";
import { JsonLd, websiteJsonLd } from "@/lib/site-jsonld";

const LINE_GREEN = "#06C755";
type Home = (typeof HOME)["th"];

export function Landing({ lang }: { lang: Lang }) {
  const h = HOME[lang] as Home;
  const faq = FAQ[lang].slice(0, 6);
  return (
    <div className="site-motion min-h-screen bg-white text-slate-900">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd(lang, faq)) }} />
      <JsonLd data={websiteJsonLd(lang)} />
      <SiteHeader lang={lang} path="/" />
      <main>
        <Hero h={h} lang={lang} />
        <Stories h={h} lang={lang} />
        <YourData h={h} lang={lang} />
        <HowSteps h={h} />
        <PricingSection h={h} />
        <FaqSection h={h} lang={lang} items={faq} />
        <CtaBand h={h} />
      </main>
      <SiteFooter lang={lang} />
    </div>
  );
}

// ===================== Hero =====================
function Hero({ h, lang }: { h: Home; lang: Lang }) {
  const t = h.hero;
  return (
    <section className="relative overflow-hidden bg-brand-900 text-white">
      <div aria-hidden className="pointer-events-none absolute -left-40 -top-40 h-[34rem] w-[34rem] rounded-full bg-brand-600/50 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-48 right-[-10rem] h-[30rem] w-[30rem] rounded-full bg-accent-500/15 blur-3xl" />
      <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 pb-20 pt-14 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:pb-28 lg:pt-20">
        <div>
          <h1 className="text-balance text-[2.5rem] font-bold leading-[1.12] tracking-tight sm:text-5xl lg:text-[3.3rem]">
            {t.title1}
            <span className="block text-accent-300">{t.title2}</span>
            <span className="block">{t.title3}</span>
          </h1>
          <p className="mt-6 max-w-xl text-pretty text-lg leading-relaxed text-brand-100">{t.sub}</p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Button href="/login" size="lg" variant="inverse" className="shadow-lg shadow-brand-900/40">
              {t.ctaStart}
            </Button>
            <Link href="/pricing" className="arrow-link inline-flex items-center justify-center gap-2 rounded-xl border border-white/30 px-6 py-3 text-base font-medium text-white transition hover:border-white/60 hover:bg-white/10">
              {t.ctaPricing}
              <ArrowRight size={18} aria-hidden />
            </Link>
          </div>
          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-brand-100">
            {t.facts.map((f) => (
              <li key={f} className="flex items-center gap-2">
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent-400" />
                {f}
              </li>
            ))}
          </ul>
        </div>

        {/* รูป hero เอียงเล็กน้อย + แชต LINE เล่นเป็นลำดับ (ซ้อนขอบซ้ายของรูปบนจอใหญ่, เรียงใต้รูปบนจอเล็ก) */}
        <div className="relative min-w-0 lg:flex lg:items-center">
          <div className="relative z-10 hidden lg:-mr-20 lg:block lg:w-72 lg:shrink-0">
            <ChatSequence t={t.chat} />
          </div>
          <div className="overflow-hidden rounded-3xl shadow-2xl shadow-brand-900/60 ring-1 ring-white/15 lg:min-w-0 lg:flex-1 lg:rotate-[1.5deg]">
            <FeaturePhoto kind="hero" lang={lang} priority />
          </div>
          <div className="mx-auto mt-5 w-full max-w-sm lg:hidden">
            <ChatSequence t={t.chat} />
          </div>
        </div>
      </div>
    </section>
  );
}

/** แชต LINE: รูปใบเสร็จ → กำลังพิมพ์ → การ์ด OCR → บันทึกแล้ว → พิมพ์ข้อความ → บันทึกแล้ว
 *  โชว์ทั้ง 2 วิธีที่ระบบรับได้ (อ่านจากรูป / พิมพ์ข้อความ) · เล่นครั้งเดียวตอนโหลด, ไม่มี JS ก็เห็นครบ */
function ChatSequence({ t }: { t: Home["hero"]["chat"] }) {
  const d = (s: number) => ({ "--delay": `${s}s` }) as React.CSSProperties;
  return (
    <div className="overflow-hidden rounded-2xl bg-white text-slate-900 shadow-xl shadow-brand-900/40">
      <div className="flex items-center gap-2 px-3 py-2 text-white" style={{ background: LINE_GREEN }}>
        <Logo className="h-6 w-6" rounded="rounded-md" />
        <span className="text-xs font-semibold">{t.from}</span>
        <span className="ml-auto text-[11px] tabular-nums text-white/85">{t.time}</span>
      </div>
      <div className="space-y-2 bg-slate-50 p-3 text-xs">
        {/* 1) ผู้ใช้ส่งรูปใบเสร็จ (วาดเป็นกระดาษใบเสร็จย่อ ไม่ใช่ชื่อไฟล์) */}
        <div className="home-chat-card ml-auto w-fit rounded-2xl rounded-tr-sm bg-brand-600 p-1.5" style={d(0.3)}>
          <div role="img" aria-label={t.imageAlt} className="flex h-24 w-20 items-center justify-center rounded-xl bg-slate-100">
            <div className="w-12 space-y-1.5 rounded-sm bg-white px-1.5 py-2 shadow-sm [clip-path:polygon(0_0,100%_0,100%_94%,88%_100%,75%_94%,62%_100%,50%_94%,38%_100%,25%_94%,12%_100%,0_94%)]">
              <div className="mx-auto h-1 w-6 rounded bg-slate-400" />
              <div className="h-0.5 w-full rounded bg-slate-200" />
              <div className="h-0.5 w-5/6 rounded bg-slate-200" />
              <div className="h-0.5 w-full rounded bg-slate-200" />
              <div className="h-0.5 w-4/6 rounded bg-slate-200" />
              <div className="mt-1 h-1 w-7 rounded bg-slate-500" />
            </div>
          </div>
        </div>
        {/* 2) กำลังอ่าน */}
        <div className="home-typing w-fit rounded-2xl rounded-tl-sm bg-white px-3 py-2 text-slate-600 shadow-sm" style={{ "--delay": "0.9s", "--hide": "2.3s" } as React.CSSProperties}>
          <span className="sr-only">{t.typing}</span>
          <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-slate-400" style={{ "--i": 0 } as React.CSSProperties} />{" "}
          <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-slate-400" style={{ "--i": 1 } as React.CSSProperties} />{" "}
          <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-slate-400" style={{ "--i": 2 } as React.CSSProperties} />
        </div>
        {/* 3) การ์ดผล OCR */}
        <div className="home-chat-card w-[90%] rounded-2xl rounded-tl-sm border border-slate-200 bg-white p-3 shadow-sm" style={d(2.4)}>
          <div className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-bold" style={{ background: `${LINE_GREEN}1f`, color: "#03873d" }}>
            <Check size={12} strokeWidth={3} aria-hidden /> {t.cardTitle}
          </div>
          <dl className="mt-2 space-y-1">
            {t.rows.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3">
                <dt className="text-slate-600">{k}</dt>
                <dd className="font-semibold tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="home-chat-card w-fit max-w-[90%] rounded-2xl rounded-tl-sm bg-white px-3 py-2 shadow-sm" style={d(3.4)}>
          <div className="font-semibold text-slate-900">{t.done}</div>
          <div className="text-[11px] text-slate-600">{t.doneSub}</div>
        </div>
        {/* 4) วิธีที่สอง: พิมพ์ข้อความสั้น ๆ */}
        <div className="home-chat-card ml-auto w-fit max-w-[85%] rounded-2xl rounded-tr-sm bg-brand-600 px-3 py-2 text-white" style={d(4.4)}>
          {t.textMsg}
        </div>
        <div className="home-chat-card w-fit max-w-[90%] rounded-2xl rounded-tl-sm bg-white px-3 py-2 shadow-sm" style={d(5.2)}>
          <div className="font-semibold text-slate-900">{t.textDone}</div>
          <div className="text-[11px] text-slate-600">{t.textDoneSub}</div>
        </div>
      </div>
    </div>
  );
}

// ===================== Stories =====================
function Stories({ h, lang }: { h: Home; lang: Lang }) {
  const t = h.stories;
  return (
    <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6 lg:py-28">
      <Reveal className="max-w-3xl">
        <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">{t.title}</h2>
        <p className="mt-4 text-lg text-slate-700">{t.sub}</p>
      </Reveal>
      <div className="mt-16 space-y-20 lg:mt-24 lg:space-y-28">
        {t.items.map((s, i) => {
          const flip = i % 2 === 1;
          return (
            <Reveal as="article" key={s.anchor} className="grid items-center gap-10 lg:grid-cols-12 lg:gap-14">
              <div className={`lg:col-span-7 ${flip ? "lg:order-2" : ""}`}>
                <div className="lift overflow-hidden rounded-3xl shadow-xl shadow-slate-900/10">
                  <FeaturePhoto kind={s.photo} lang={lang} />
                </div>
              </div>
              <div className={`lg:col-span-5 ${flip ? "lg:order-1" : ""}`}>
                <p className="text-sm font-semibold text-brand-700">{s.kicker}</p>
                <h3 className="mt-2 text-balance text-2xl font-bold tracking-tight sm:text-3xl">{s.title}</h3>
                <p className="mt-4 leading-relaxed text-slate-700">{s.desc}</p>
                <ul className="mt-5 space-y-2 text-slate-800">
                  {s.points.map((p) => (
                    <li key={p} className="flex items-start gap-2.5">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                        <Check size={13} strokeWidth={3} aria-hidden />
                      </span>
                      {p}
                    </li>
                  ))}
                </ul>
                <Link href={`${withLang(lang, "/features")}#${s.anchor}`} className="arrow-link mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline">
                  {t.more}
                  <ArrowRight size={16} aria-hidden />
                </Link>
              </div>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}

// ===================== YourData =====================
const STATUS_TONE: Record<string, string> = {
  "จ่ายแล้ว": "bg-brand-600 text-white",
  "อนุมัติแล้ว": "bg-brand-100 text-brand-800",
  "รออนุมัติ": "bg-amber-100 text-amber-800",
  Paid: "bg-brand-600 text-white",
  Approved: "bg-brand-100 text-brand-800",
  Pending: "bg-amber-100 text-amber-800",
};

function YourData({ h, lang }: { h: Home; lang: Lang }) {
  const t = h.data;
  return (
    <section id="data" className="border-y border-brand-100 bg-brand-50">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16 lg:py-28">
        <Reveal>
          <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">{t.title}</h2>
          <p className="mt-4 text-pretty leading-relaxed text-slate-700 sm:text-lg">{t.desc}</p>
          <ul className="mt-6 space-y-3 text-slate-800">
            {t.points.map((p) => (
              <li key={p} className="flex items-start gap-3">
                <ShieldCheck size={20} className="mt-0.5 shrink-0 text-brand-700" aria-hidden />
                {p}
              </li>
            ))}
          </ul>
        </Reveal>
        <Reveal as="figure" className="min-w-0" delay={0.15}>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-brand-900/10">
            <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-2.5 text-sm">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#0f9d58] text-white"><Table size={14} aria-hidden /></span>
              <span className="font-medium text-slate-800">{t.sheetFile}</span>
              <span className="ml-auto hidden text-xs text-slate-500 sm:block">{t.sheetHint}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] text-sm">
                <thead>
                  <tr className="bg-slate-50 text-xs text-slate-500">
                    <th className="w-8 border-b border-r border-slate-200 py-1.5" />
                    {["A", "B", "C", "D", "E"].map((c) => (
                      <th key={c} className="border-b border-r border-slate-200 py-1.5 font-medium">{c}</th>
                    ))}
                  </tr>
                  <tr className="bg-brand-50 text-left text-xs font-semibold text-slate-700">
                    <td className="border-b border-r border-slate-200 bg-slate-50 py-1.5 text-center text-slate-500">1</td>
                    {t.sheetHead.map((c) => (
                      <td key={c} className="whitespace-nowrap border-b border-r border-slate-200 px-3 py-1.5">{c}</td>
                    ))}
                  </tr>
                </thead>
                <tbody className="sheet-rows">
                  {t.sheetRows.map((r, i) => (
                    <tr key={r[1]} className="sheet-row border-b border-slate-100" style={{ "--delay": `${0.2 + i * 0.22}s` } as React.CSSProperties}>
                      <td className="border-r border-slate-200 bg-slate-50 py-1.5 text-center text-xs text-slate-500">{i + 2}</td>
                      {r.map((c, j) => (
                        <td key={j} className={`whitespace-nowrap border-r border-slate-100 px-3 py-1.5 ${j === 3 ? "text-right tabular-nums" : ""}`}>
                          {j === 4 ? (
                            <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_TONE[c] ?? "bg-slate-100 text-slate-700"}`}>{c}</span>
                          ) : c}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-1 overflow-x-auto border-t border-slate-200 bg-slate-50 px-2 pt-1 text-xs">
              {t.sheetTabs.map((tab, i) => (
                <span key={tab} className={`rounded-t-md px-3 py-1.5 ${i === 1 ? "border-b-2 border-brand-600 bg-white font-semibold text-brand-700" : "text-slate-600"}`}>{tab}</span>
              ))}
            </div>
          </div>
          <figcaption className="mt-3 text-center text-xs text-slate-600">{t.sheetCaption}</figcaption>
        </Reveal>
      </div>
      {/* lang ไว้ให้ STATUS_TONE ใช้ในอนาคต */}
      <span hidden>{lang}</span>
    </section>
  );
}

// ===================== HowSteps =====================
function HowSteps({ h }: { h: Home }) {
  const t = h.how;
  return (
    <section id="how" className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
      <Reveal className="mx-auto max-w-2xl text-center">
        <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">{t.title}</h2>
        <p className="mt-3 text-slate-700">{t.sub}</p>
      </Reveal>
      <Reveal className="relative mt-14">
        <div aria-hidden className="how-line absolute left-6 top-6 hidden h-0.5 w-[calc(100%-3rem)] bg-brand-200 md:block" />
        <ol className="grid gap-10 md:grid-cols-3 md:gap-8">
          {t.steps.map((s, i) => (
            <li key={s.title} className="relative">
              <span className="how-dot relative z-10 flex h-12 w-12 items-center justify-center rounded-full bg-brand-600 text-lg font-bold text-white ring-8 ring-white" style={{ "--delay": `${0.4 + i * 0.3}s` } as React.CSSProperties}>
                {i + 1}
              </span>
              <h3 className="mt-5 text-xl font-semibold">{s.title}</h3>
              <p className="mt-2 leading-relaxed text-slate-700">{s.desc}</p>
            </li>
          ))}
        </ol>
      </Reveal>
    </section>
  );
}

// ===================== Pricing =====================
function PricingSection({ h }: { h: Home }) {
  const t = h.pricing;
  return (
    <section id="pricing" className="border-y border-brand-100 bg-brand-50/60">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">{t.eyebrow}</p>
          <h2 className="mt-2 text-balance text-3xl font-bold tracking-tight sm:text-4xl">{t.title}</h2>
          <p className="mt-3 text-slate-700">{t.desc}</p>
        </Reveal>
        <Reveal className="mt-10" delay={0.1}>
          <PricingCards t={t} />
        </Reveal>
        <div className="mt-8 text-center">
          <Link href="/pricing" className="arrow-link inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline">
            {t.cta}
            <ArrowRight size={16} aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}

// ===================== FAQ =====================
function FaqSection({ h, lang, items }: { h: Home; lang: Lang; items: Array<{ q: string; a: string }> }) {
  const t = h.faq;
  return (
    <section className="mx-auto max-w-3xl px-4 py-20 sm:px-6 lg:py-28">
      <Reveal>
        <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">{t.title}</h2>
      </Reveal>
      <Reveal className="mt-8 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white" delay={0.1}>
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
      <Link href={withLang(lang, "/faq")} className="arrow-link mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline">
        {t.more}
        <ArrowRight size={16} aria-hidden />
      </Link>
    </section>
  );
}

// ===================== CTA band =====================
function CtaBand({ h }: { h: Home }) {
  const t = h.cta;
  return (
    <section className="px-4 pb-20 pt-6 sm:px-6">
      <Reveal className="relative mx-auto grid max-w-6xl items-center gap-10 overflow-hidden rounded-3xl bg-brand-600 px-6 py-12 text-white sm:px-12 lg:grid-cols-[1fr_auto] lg:py-14">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-accent-500/25 blur-3xl" />
        <div className="relative">
          <h2 className="text-balance text-2xl font-bold tracking-tight sm:text-3xl">{t.title}</h2>
          <p className="mt-3 max-w-xl text-pretty text-brand-100">{t.desc}</p>
          <div className="mt-6">
            <Button href="/login" size="lg" variant="inverse">{t.btn}</Button>
          </div>
        </div>
        <div className="relative flex items-center gap-4 rounded-2xl bg-white p-4 text-slate-900 shadow-lg lg:flex-col lg:text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={COMPANY.lineOaQr} alt={`QR code LINE Official Account ${COMPANY.lineOaId}`} width={132} height={132} className="h-[132px] w-[132px] shrink-0 rounded-lg" />
          <div>
            <div className="text-sm font-semibold">{t.qrLabel}</div>
            <a href={COMPANY.lineOaUrl} target="_blank" rel="noreferrer" className="text-lg font-bold text-brand-700 hover:underline">{COMPANY.lineOaId}</a>
            <div className="text-xs text-slate-600">{t.qrSub}</div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
