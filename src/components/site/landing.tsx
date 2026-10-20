// ===========================================
// หน้าแรกของเว็บสาธารณะ (/ และ /en) — server component: ข้อความทั้งหมดอยู่ใน HTML แรก
// ให้ AI/ค้นหาอ่านได้โดยไม่ต้องรอ JS · ไม่มีตัวเลขผู้ใช้/รีวิวปลอม · มี FAQ + JSON-LD
// สีแบรนด์เดิม (น้ำเงิน + เขียว LINE สำหรับปุ่มเริ่มใช้) · ฟอนต์ IBM Plex Sans Thai เดิม
// ===========================================

import Link from "next/link";
import { SiteHeader } from "./site-header";
import { SiteFooter } from "./site-footer";
import { HOME, FAQ, faqJsonLd } from "./copy";
import { COMPANY } from "@/lib/company";
import { withLang, type Lang } from "@/lib/site-lang";

const GREEN = "#06C755";

export function Landing({ lang }: { lang: Lang }) {
  const faq = FAQ[lang].slice(0, 6);
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd(lang, faq)) }} />
      <SiteHeader lang={lang} path="/" />
      <main>
        <Hero lang={lang} />
        <Stories lang={lang} />
        <DataOwnership lang={lang} />
        <HowItWorks lang={lang} />
        <PricingTeaser lang={lang} />
        <FaqSection lang={lang} items={faq} />
        <CtaBand lang={lang} />
      </main>
      <SiteFooter lang={lang} />
    </div>
  );
}

// ---------- hero ----------
function Hero({ lang }: { lang: Lang }) {
  const t = HOME[lang].hero;
  const m = HOME[lang].mock;
  return (
    <section className="bg-brand-900 text-white">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-14 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:py-24">
        <div>
          <h1 className="text-balance text-4xl font-extrabold leading-[1.12] tracking-tight sm:text-5xl lg:text-[3.4rem]">
            {t.h1a}
            <br />
            <span className="text-brand-200">{t.h1b}</span>
          </h1>
          <p className="mt-6 max-w-xl text-pretty text-base leading-relaxed text-brand-100 sm:text-lg">{t.sub}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-full px-6 py-3 text-base font-semibold text-slate-900 shadow-lg transition-transform hover:scale-[1.02] active:scale-95"
              style={{ background: GREEN }}
            >
              {t.ctaStart}
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center justify-center rounded-full border border-white/25 bg-white/10 px-6 py-3 text-base font-semibold text-white hover:bg-white/15"
            >
              {t.ctaPricing}
            </Link>
          </div>
          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-brand-100">
            {t.facts.map((f) => (
              <li key={f} className="flex items-center gap-2">
                <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: GREEN }} />
                {f}
              </li>
            ))}
          </ul>
        </div>

        {/* product mock: LINE chat + เอกสารที่ออกได้ */}
        <div className="relative mx-auto w-full max-w-md lg:max-w-none">
          <div className="relative z-10 overflow-hidden rounded-3xl border border-white/10 bg-white text-slate-900 shadow-2xl">
            <div className="flex items-center gap-2.5 px-4 py-3 text-white" style={{ background: GREEN }}>
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/25 text-xs font-bold">A</div>
              <div className="text-sm font-semibold leading-tight">
                Aim Expense
                <div className="text-[11px] font-normal text-white/90">● {m.online}</div>
              </div>
            </div>
            <div className="space-y-3 bg-slate-50 px-4 py-4">
              <div className="ml-auto w-[62%] rounded-2xl rounded-tr-sm bg-white p-3 shadow-sm">
                <div className="flex justify-between text-[10px] font-bold tracking-wide text-slate-500">RECEIPT<span>☕</span></div>
                <div className="mt-1.5 space-y-1.5">
                  <div className="h-1.5 w-full rounded bg-slate-200" />
                  <div className="h-1.5 w-3/4 rounded bg-slate-200" />
                </div>
                <div className="mt-2 flex justify-between border-t border-dashed border-slate-200 pt-1.5 text-[10px] text-slate-600">
                  <span>TOTAL</span>
                  <span className="font-bold text-slate-900">฿120</span>
                </div>
              </div>
              <div className="w-[88%] rounded-2xl rounded-tl-sm border border-slate-200 bg-white p-3.5 shadow-sm">
                <div className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-bold" style={{ background: `${GREEN}1f`, color: "#03873d" }}>
                  ✓ {m.receiptRead}
                </div>
                <div className="mt-2 space-y-1 text-xs">
                  <div className="flex justify-between"><span className="text-slate-600">{m.total}</span><span className="font-semibold">฿120.00</span></div>
                  <div className="flex justify-between"><span className="text-slate-600">{m.vat}</span><span className="font-medium text-slate-800">฿7.85</span></div>
                  <div className="flex justify-between"><span className="text-slate-600">{m.project}</span><span className="rounded bg-brand-50 px-1.5 font-semibold text-brand-700">Event A</span></div>
                </div>
                <div className="mt-3 rounded-lg py-1.5 text-center text-[11px] font-semibold text-white" style={{ background: GREEN }}>{m.save}</div>
              </div>
            </div>
          </div>
          <div className="relative z-0 -mt-6 ml-auto w-[78%] rounded-2xl border border-white/10 bg-brand-800 p-4 text-sm shadow-xl sm:-mt-8 sm:w-[70%]">
            <div className="text-xs font-medium text-brand-200">{m.docTitle}</div>
            <ul className="mt-2 space-y-1.5 font-semibold">
              {m.docs.map((d) => (
                <li key={d} className="flex items-center gap-2">
                  <span style={{ color: GREEN }}>✓</span> {d}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------- stories (สลับซ้าย-ขวา) ----------
function Stories({ lang }: { lang: Lang }) {
  const t = HOME[lang].stories;
  const visuals = [<ChatVisual key="c" lang={lang} />, <DocVisual key="d" lang={lang} />, <FlowVisual key="f" lang={lang} />];
  return (
    <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6 sm:py-24">
      <h2 className="max-w-3xl text-balance text-3xl font-bold leading-tight tracking-tight sm:text-4xl">{t.title}</h2>
      <div className="mt-12 space-y-16 sm:mt-16 sm:space-y-24">
        {t.items.map((item, i) => (
          <article key={item.title} className={`grid items-center gap-8 lg:grid-cols-2 lg:gap-16 ${i % 2 === 1 ? "lg:[&>*:first-child]:order-2" : ""}`}>
            <div>
              <h3 className="text-2xl font-bold tracking-tight sm:text-3xl">{item.title}</h3>
              <p className="mt-4 text-pretty text-base leading-relaxed text-slate-700 sm:text-lg">{item.desc}</p>
              <ul className="mt-5 space-y-2 text-slate-800">
                {item.points.map((p) => (
                  <li key={p} className="flex items-start gap-2.5">
                    <span className="mt-1 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: GREEN }}>✓</span>
                    {p}
                  </li>
                ))}
              </ul>
            </div>
            {visuals[i]}
          </article>
        ))}
      </div>
    </section>
  );
}

function ChatVisual({ lang }: { lang: Lang }) {
  const th = lang === "th";
  return (
    <div className="rounded-3xl bg-slate-100 p-5 sm:p-8">
      <div className="mx-auto max-w-sm space-y-3 text-sm">
        <div className="ml-auto w-fit max-w-[80%] rounded-2xl rounded-tr-sm bg-brand-600 px-4 py-2.5 text-white">{th ? "ค่าแท็กซี่ไปหาลูกค้า 350 โปรเจกต์ Event A" : "Taxi to client 350 project Event A"}</div>
        <div className="w-fit max-w-[85%] rounded-2xl rounded-tl-sm bg-white px-4 py-3 shadow-sm">
          <div className="font-semibold text-slate-900">{th ? "บันทึกแล้ว ✓" : "Logged ✓"}</div>
          <div className="mt-1 text-slate-700">{th ? "ค่าเดินทาง · ฿350.00 · Event A" : "Travel · ฿350.00 · Event A"}</div>
          <div className="mt-1 text-xs text-slate-500">{th ? "งบคงเหลือ Event A: ฿11,650" : "Event A budget left: ฿11,650"}</div>
        </div>
        <div className="ml-auto w-fit rounded-2xl rounded-tr-sm bg-brand-600 px-4 py-2.5 text-white">📷 {th ? "ใบเสร็จร้านกาแฟ.jpg" : "coffee-receipt.jpg"}</div>
        <div className="w-fit max-w-[85%] rounded-2xl rounded-tl-sm bg-white px-4 py-3 shadow-sm">
          <div className="font-semibold text-slate-900">{th ? "อ่านใบเสร็จแล้ว ✓" : "Receipt read ✓"}</div>
          <div className="mt-1 text-slate-700">Café Co. · ฿120.00 · VAT ฿7.85</div>
        </div>
      </div>
    </div>
  );
}

function DocVisual({ lang }: { lang: Lang }) {
  const th = lang === "th";
  const rows = th
    ? [["ค่าบริการออกแบบ", "8,500.00"], ["ค่าถ่ายภาพ", "12,000.00"]]
    : [["Design service", "8,500.00"], ["Photography", "12,000.00"]];
  return (
    <div className="rounded-3xl bg-slate-100 p-5 sm:p-8">
      <div className="mx-auto max-w-sm rounded-xl border border-slate-200 bg-white p-5 text-xs shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-sm font-bold text-slate-900">{COMPANY.nameTh}</div>
            <div className="mt-0.5 text-slate-500">{th ? "เลขประจำตัวผู้เสียภาษี" : "Tax ID"} 0-1055-69117-50-3</div>
          </div>
          <div className="text-right">
            <div className="whitespace-nowrap text-base font-bold text-brand-700">{th ? "ใบกำกับภาษี" : "TAX INVOICE"}</div>
            <div className="font-mono text-slate-600">TI-2569-10-001</div>
          </div>
        </div>
        <table className="mt-4 w-full">
          <tbody>
            {rows.map(([d, a]) => (
              <tr key={d} className="border-t border-slate-100">
                <td className="py-1.5 text-slate-700">{d}</td>
                <td className="py-1.5 text-right font-medium">{a}</td>
              </tr>
            ))}
            <tr className="border-t border-slate-200">
              <td className="py-1.5 text-slate-600">VAT 7%</td>
              <td className="py-1.5 text-right">1,435.00</td>
            </tr>
            <tr className="border-t-2 border-slate-800">
              <td className="py-1.5 font-bold">{th ? "ยอดรวมสุทธิ" : "Total"}</td>
              <td className="py-1.5 text-right font-bold">21,935.00</td>
            </tr>
          </tbody>
        </table>
        <div className="mt-4 flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-700">
          <span>{th ? "หนังสือรับรองหัก ณ ที่จ่าย 3%" : "Withholding certificate 3%"}</span>
          <span className="font-semibold text-brand-700">{th ? "ออกแล้ว · ฟอร์ม 50 ทวิ" : "Issued · 50 Tawi form"}</span>
        </div>
      </div>
    </div>
  );
}

function FlowVisual({ lang }: { lang: Lang }) {
  const th = lang === "th";
  const steps = th
    ? [["ตั้งเบิก", "ค่าเช่าสถานที่ ฿25,000", "done"], ["อนุมัติ", "โดย คุณพิม · 09:12", "done"], ["เตรียมจ่าย", "รอบจ่าย 15 ต.ค.", "now"], ["เคลียร์งบ", "", "next"]]
    : [["Request", "Venue rental ฿25,000", "done"], ["Approve", "by Pim · 09:12", "done"], ["Prepare payment", "Batch 15 Oct", "now"], ["Reconcile", "", "next"]];
  return (
    <div className="rounded-3xl bg-slate-100 p-5 sm:p-8">
      <div className="mx-auto max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>Event A</span>
          <span>{th ? "งบ ฿60,000 · ใช้ไป 62%" : "Budget ฿60,000 · 62% used"}</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full w-[62%] rounded-full bg-brand-600" />
        </div>
        <ol className="mt-5 space-y-3 text-sm">
          {steps.map(([title, sub, state]) => (
            <li key={title} className="flex items-start gap-3">
              <span
                className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${state === "done" ? "text-white" : state === "now" ? "border-2 border-brand-600 text-brand-700" : "border border-slate-300 text-slate-400"}`}
                style={state === "done" ? { background: GREEN } : undefined}
              >
                {state === "done" ? "✓" : ""}
              </span>
              <div>
                <div className={`font-semibold ${state === "next" ? "text-slate-400" : "text-slate-900"}`}>{title}</div>
                {sub && <div className="text-xs text-slate-500">{sub}</div>}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

// ---------- data ownership ----------
function DataOwnership({ lang }: { lang: Lang }) {
  const t = HOME[lang].data;
  return (
    <section className="bg-slate-50">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-2 lg:gap-16">
        <div>
          <h2 className="text-balance text-3xl font-bold leading-tight tracking-tight sm:text-4xl">{t.title}</h2>
          <p className="mt-4 text-pretty text-base leading-relaxed text-slate-700 sm:text-lg">{t.desc}</p>
          <ul className="mt-5 space-y-2 text-slate-800">
            {t.points.map((p) => (
              <li key={p} className="flex items-start gap-2.5">
                <span className="mt-1 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: GREEN }}>✓</span>
                {p}
              </li>
            ))}
          </ul>
        </div>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-2.5 text-xs text-slate-600">
            <span className="inline-block h-3 w-3 rounded-sm bg-[#0f9d58]" />
            <span className="font-semibold text-slate-800">Aim Expense — {COMPANY.nameTh}</span>
            <span className="ml-auto">Google Sheets</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  {t.sheetHead.map((h) => (
                    <th key={h} className="whitespace-nowrap px-3 py-2 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {t.sheetRows.map((r) => (
                  <tr key={r[1]} className="border-t border-slate-100">
                    {r.map((c, i) => (
                      <td key={i} className={`whitespace-nowrap px-3 py-2 ${i >= 3 ? "text-right tabular-nums" : ""} ${i === 2 ? "text-brand-700" : "text-slate-800"}`}>{c}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-4 border-t border-slate-200 px-4 py-2 text-[11px] text-slate-500">
            <span className="border-b-2 border-[#0f9d58] pb-0.5 font-medium text-slate-800">{t.sheetTab}</span>
            <span>Billings</span><span>Quotations</span><span>TaxInvoices</span><span>Customers</span>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------- how it works (ลำดับจริง 3 ขั้น) ----------
function HowItWorks({ lang }: { lang: Lang }) {
  const t = HOME[lang].how;
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
      <h2 className="max-w-2xl text-balance text-3xl font-bold leading-tight tracking-tight sm:text-4xl">{t.title}</h2>
      <ol className="mt-10 grid gap-6 sm:grid-cols-3">
        {t.steps.map((s, i) => (
          <li key={s.title} className="relative rounded-2xl border border-slate-200 p-6">
            <span className="text-4xl font-extrabold tabular-nums text-brand-600">{i + 1}</span>
            <h3 className="mt-3 text-lg font-bold">{s.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-700">{s.desc}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ---------- pricing teaser ----------
function PricingTeaser({ lang }: { lang: Lang }) {
  const t = HOME[lang].pricing;
  return (
    <section className="bg-brand-50">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <div className="max-w-2xl">
          <h2 className="text-balance text-3xl font-bold leading-tight tracking-tight sm:text-4xl">{t.title}</h2>
          <p className="mt-4 text-pretty text-base leading-relaxed text-slate-700 sm:text-lg">{t.desc}</p>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {t.tiers.map((p) => (
            <div key={p.name} className={`rounded-2xl p-6 ${"hot" in p && p.hot ? "bg-brand-700 text-white shadow-lg" : "border border-slate-200 bg-white"}`}>
              <div className={`text-sm font-semibold ${"hot" in p && p.hot ? "text-brand-100" : "text-slate-600"}`}>{p.name}</div>
              <div className="mt-2 text-3xl font-extrabold tracking-tight">
                {p.price}
                {"unit" in p && p.unit && <span className={`ml-1 text-base font-medium ${"hot" in p && p.hot ? "text-brand-100" : "text-slate-600"}`}>{p.unit}</span>}
              </div>
              <p className={`mt-2 text-sm ${"hot" in p && p.hot ? "text-brand-100" : "text-slate-700"}`}>{p.note}</p>
            </div>
          ))}
        </div>
        <Link href="/pricing" className="mt-8 inline-flex items-center rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800">
          {t.cta} →
        </Link>
      </div>
    </section>
  );
}

// ---------- FAQ ----------
function FaqSection({ lang, items }: { lang: Lang; items: Array<{ q: string; a: string }> }) {
  const t = HOME[lang].faq;
  return (
    <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-24">
      <h2 className="text-balance text-3xl font-bold leading-tight tracking-tight sm:text-4xl">{t.title}</h2>
      <div className="mt-8 divide-y divide-slate-200 rounded-2xl border border-slate-200">
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
      <Link href={withLang(lang, "/faq")} className="mt-6 inline-block text-sm font-semibold text-brand-700 hover:underline">
        {t.more} →
      </Link>
    </section>
  );
}

// ---------- CTA band ----------
function CtaBand({ lang }: { lang: Lang }) {
  const t = HOME[lang].cta;
  return (
    <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 sm:pb-24">
      <div className="grid items-center gap-8 rounded-3xl bg-brand-900 px-6 py-10 text-white sm:px-10 lg:grid-cols-[1fr_auto]">
        <div>
          <h2 className="text-balance text-2xl font-bold tracking-tight sm:text-3xl">{t.title}</h2>
          <p className="mt-3 max-w-xl text-pretty text-brand-100">{t.desc}</p>
          <Link
            href="/login"
            className="mt-6 inline-flex items-center rounded-full px-6 py-3 text-base font-semibold text-slate-900 shadow-lg transition-transform hover:scale-[1.02] active:scale-95"
            style={{ background: GREEN }}
          >
            {t.btn}
          </Link>
        </div>
        <div className="flex flex-col items-center rounded-2xl bg-white p-4 text-slate-900">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={COMPANY.lineOaQr} alt={`QR LINE Official Account ${COMPANY.lineOaId}`} width={160} height={160} className="h-40 w-40 rounded-lg" />
          <div className="mt-2 text-xs text-slate-600">{t.qrLabel}</div>
          <a href={COMPANY.lineOaUrl} target="_blank" rel="noreferrer" className="mt-1 text-sm font-bold text-[#03873d] hover:underline">
            {COMPANY.lineOaId}
          </a>
        </div>
      </div>
    </section>
  );
}
