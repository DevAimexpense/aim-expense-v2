"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// Public marketing / home page — viewable WITHOUT login (Google homepage requirement).
// TH/EN toggle: Thai is default (target market); English helps reviewers + scaling.
// Composition adapted from a modern agency template: hero panel with floating nav +
// dual pill CTAs + floating product cards, trust strip, about + stat cards, services,
// 2x2 features, CTA.

const GREEN = "#06C755"; // brand action green (LINE)

// ---------- icons ----------
const ico = "h-5 w-5";
const stroke = { fill: "none" as const, stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
function IconChat() { return <svg viewBox="0 0 24 24" {...stroke} className={ico}><path d="M21 11.5a8.5 8.5 0 0 1-12.2 7.7L3 21l1.9-5.6A8.5 8.5 0 1 1 21 11.5Z" /></svg>; }
function IconTax() { return <svg viewBox="0 0 24 24" {...stroke} className={ico}><path d="M9 3h6l3 3v15H6V6Z" /><path d="M9 9h6M9 13h6M9 17h3" /></svg>; }
function IconFlow() { return <svg viewBox="0 0 24 24" {...stroke} className={ico}><path d="m4 12 4 4 12-12" /><path d="M4 19h16" /></svg>; }
function IconBudget() { return <svg viewBox="0 0 24 24" {...stroke} className={ico}><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /><path d="M12 11v4M9 13h6" /></svg>; }
function IconShield() { return <svg viewBox="0 0 24 24" {...stroke} className={ico}><path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6Z" /><path d="m9 12 2 2 4-4" /></svg>; }
function IconSwitch() { return <svg viewBox="0 0 24 24" {...stroke} className={ico}><path d="M4 7h13l-3-3M20 17H7l3 3" /></svg>; }
function ArrowCircle({ dark = false }: { dark?: boolean }) {
  return (
    <span className={`flex h-6 w-6 items-center justify-center rounded-full ${dark ? "bg-black text-white" : "bg-white text-slate-900"}`}>
      <svg viewBox="0 0 24 24" {...stroke} strokeWidth={2.2} className="h-3.5 w-3.5"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
    </span>
  );
}
function Kicker({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 flex items-center justify-center gap-2 text-xs font-semibold tracking-wide text-slate-500"><span className="h-1.5 w-1.5 rounded-full" style={{ background: GREEN }} />{children}</p>;
}

type Lang = "th" | "en";

// ---------- content dictionary ----------
const T = {
  th: {
    nav: { features: "ฟีเจอร์", services: "บริการ", pricing: "ราคา", login: "เข้าสู่ระบบ" },
    hero: {
      h1a: "บันทึกค่าใช้จ่าย ออกภาษีไทย", h1mid: "ครบ จบใน", h1b: "แชต LINE",
      sub: "Aim Expense ช่วย SME ไทยจัดการค่าใช้จ่าย–รายรับ และออกรายงานภาษี (ภ.พ.30 / ภ.ง.ด. / หัก ณ ที่จ่าย) ผ่าน LINE และเว็บ — ข้อมูลทั้งหมดเก็บใน Google Sheet ของคุณเอง",
      ctaPricing: "ดูแพ็กเกจ & ราคา", ctaStart: "เริ่มฟรีด้วย LINE",
      rating: "★★★★★ ใช้ฟรีได้เลย • ทดลอง Pro 30 วัน • ไม่ต้องใช้บัตรเครดิต",
    },
    card: { online: "ออนไลน์", statLabel: "รายการที่บันทึก/เดือน", taxReady: "พร้อมยื่นภาษี", receiptRead: "อ่านใบเสร็จแล้ว", total: "ยอดรวม", project: "โปรเจกต์", saveExpense: "บันทึกเป็นรายจ่าย" },
    trust: { with: "ทำงานร่วมกับ" },
    about: {
      kicker: "เกี่ยวกับ Aim Expense",
      h2a: "ระบบบัญชีที่ออกแบบเพื่อ", h2sme: "SME ไทย", h2b: "และทำงานบน", h2line: "LINE", h2end: "จริง",
      c1: "ข้อมูลเก็บใน Google Sheet ใน Drive ของคุณเอง ไม่ผูกขาด",
      c2label: "ใช้งานง่ายทั้งทีม", c2quote: "“ถ่ายใบเสร็จส่งในกลุ่ม แล้วเข้าระบบให้เลย ลดงานคีย์ไปเยอะ”",
      c3: "รายการที่บันทึกเข้าระบบต่อเดือน",
      c4label: "ครบเรื่องภาษีไทย", c4big: "ภ.พ.30 · ภ.ง.ด.\nหัก ณ ที่จ่าย",
    },
    services: {
      kicker: "สิ่งที่ทำได้", h2: "ครบทุกขั้นตอน ตั้งแต่บันทึกจนออกภาษี",
      sub: "ไม่ว่าจะเป็นนิติบุคคลหรือบุคคลธรรมดา Aim Expense ดูแลให้ตั้งแต่ต้นจนจบ", cta: "เริ่มใช้งาน",
      items: [
        { title: "บันทึกผ่าน LINE", desc: "ถ่ายใบเสร็จให้ AI อ่าน (OCR) หรือพิมพ์สั้นๆ ในแชต ระบบบันทึกให้ทันที — เดี่ยวหรือกลุ่มทีม" },
        { title: "อนุมัติ–จ่าย–เคลียร์งบ", desc: "เวิร์กโฟลว์หลายขั้นสำหรับองค์กรจริง ตั้งเบิก → อนุมัติ → เตรียมจ่าย → เคลียร์งบ" },
        { title: "รายงานภาษีไทย", desc: "ออก ภ.พ.30 / ภ.ง.ด.3/53 / ใบหัก ณ ที่จ่าย / ใบกำกับภาษี ได้ครบจบในที่เดียว" },
      ],
    },
    features: {
      kicker: "ฟีเจอร์เด่น", h2: "ออกแบบมาเพื่อธุรกิจไทยโดยเฉพาะ",
      items: [
        { title: "บันทึกผ่าน LINE + OCR", desc: "ถ่ายรูปใบเสร็จ ระบบอ่านยอด/VAT/ร้านค้าให้อัตโนมัติ พร้อมผูกเข้าโปรเจกต์ในคลิกเดียว" },
        { title: "ข้อมูลเป็นของคุณ 100%", desc: "ทุกอย่างเก็บใน Google Sheet ใน Drive ของคุณ เราไม่เก็บเนื้อหาบนเซิร์ฟเวอร์ ไม่ผูกขาด" },
        { title: "คุมงบรายโปรเจกต์", desc: "ตั้งงบต่อโปรเจกต์ ติดตามใช้จ่าย–คงเหลือ และดูกำไร/ขาดทุนรายโปรเจกต์ได้ทันที" },
        { title: "บริษัท + ส่วนตัว ในแอปเดียว", desc: "รองรับทั้งนิติบุคคล (มี VAT/ภาษี) และบุคคล/ฟรีแลนซ์ จัดการได้หลายธุรกิจในบัญชีเดียว" },
      ],
    },
    cta: { h2: "เริ่มทำบัญชีให้ง่ายขึ้น วันนี้", sub: "เชื่อมด้วย LINE Account ใช้ฟรี ไม่ต้องใช้บัตรเครดิต", btn: "เริ่มฟรีด้วย LINE" },
    footer: { pricing: "ราคา", privacy: "นโยบายความเป็นส่วนตัว", terms: "ข้อกำหนดการใช้งาน", login: "เข้าสู่ระบบ" },
  },
  en: {
    nav: { features: "Features", services: "Services", pricing: "Pricing", login: "Log in" },
    hero: {
      h1a: "Track expenses & Thai tax,", h1mid: "all done in", h1b: "LINE chat",
      sub: "Aim Expense helps Thai SMEs manage expenses & income and produce Thai tax reports (VAT/PP30, WHT/PND) via LINE and web — with all data stored in your own Google Sheet.",
      ctaPricing: "See pricing", ctaStart: "Start free with LINE",
      rating: "★★★★★ Free to start • 30-day Pro trial • No credit card",
    },
    card: { online: "Online", statLabel: "entries logged / month", taxReady: "Tax-ready", receiptRead: "Receipt scanned", total: "Total", project: "Project", saveExpense: "Save as expense" },
    trust: { with: "Works with" },
    about: {
      kicker: "About Aim Expense",
      h2a: "An accounting system built for", h2sme: "Thai SMEs", h2b: "that runs on", h2line: "LINE", h2end: "— for real",
      c1: "All data lives in a Google Sheet in your own Drive — no lock-in",
      c2label: "Easy for the whole team", c2quote: "“Snap a receipt in the group chat and it's logged — far less manual entry.”",
      c3: "entries logged into the system per month",
      c4label: "Full Thai tax", c4big: "VAT PP30 · WHT\nPND 3 / 53",
    },
    services: {
      kicker: "What you can do", h2: "Every step, from logging to filing tax",
      sub: "Whether you're a company or an individual, Aim Expense has you covered end to end.", cta: "Get started",
      items: [
        { title: "Capture via LINE", desc: "Snap a receipt for AI (OCR) or type a quick note in chat — logged instantly, in 1:1 or team groups." },
        { title: "Approve, pay, reconcile", desc: "A multi-step workflow for real organizations: request → approve → prepare payment → reconcile." },
        { title: "Thai tax reports", desc: "Generate VAT (PP30), WHT (PND 3/53), withholding certificates and tax invoices — all in one place." },
      ],
    },
    features: {
      kicker: "Highlights", h2: "Built specifically for Thai businesses",
      items: [
        { title: "Capture via LINE + OCR", desc: "Photograph a receipt and AI reads the total/VAT/vendor automatically, linked to a project in one click." },
        { title: "Your data, 100% yours", desc: "Everything is stored in a Google Sheet in your Drive. We don't keep your content on our servers — no lock-in." },
        { title: "Budget per project", desc: "Set a budget per project, track spend vs. remaining, and see profit/loss per project instantly." },
        { title: "Company + personal in one app", desc: "Supports both companies (with VAT/tax) and individuals/freelancers, across multiple businesses in one account." },
      ],
    },
    cta: { h2: "Start making accounting easier, today", sub: "Connect with your LINE Account. Free to use, no credit card.", btn: "Start free with LINE" },
    footer: { pricing: "Pricing", privacy: "Privacy Policy", terms: "Terms of Service", login: "Log in" },
  },
} satisfies Record<Lang, unknown>;

export default function LandingPage() {
  const [lang, setLang] = useState<Lang>("th");
  useEffect(() => {
    const saved = localStorage.getItem("aim_lang");
    if (saved === "en" || saved === "th") setLang(saved);
  }, []);
  const choose = (l: Lang) => { setLang(l); try { localStorage.setItem("aim_lang", l); } catch {} };
  const t = T[lang];

  return (
    <main className="relative w-full bg-slate-50 text-slate-900">
      <style>{`
        @keyframes le-rise { from { opacity:0; transform: translateY(16px);} to {opacity:1; transform:none;} }
        .le-rise { opacity:0; animation: le-rise .7s cubic-bezier(.16,1,.3,1) forwards; }
        @media (prefers-reduced-motion: reduce){ .le-rise{opacity:1;animation:none;transform:none;} }
      `}</style>

      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        {/* ===================== HERO PANEL ===================== */}
        <section className="relative mt-4 overflow-hidden rounded-[1.75rem] bg-gradient-to-b from-brand-600 via-brand-700 to-brand-800 px-5 pt-5 pb-0 sm:rounded-[2.25rem] sm:px-8">
          <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full blur-3xl" style={{ background: `${GREEN}33` }} />
          <div aria-hidden className="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-white/10 blur-3xl" />

          {/* nav */}
          <nav className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-2.5 text-white">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25"><span className="text-base font-bold">A</span></div>
              <span className="text-base font-bold tracking-tight">Aim Expense</span>
            </div>
            <div className="hidden items-center gap-7 text-sm font-medium text-white/80 md:flex">
              <Link href="#features" className="hover:text-white">{t.nav.features}</Link>
              <Link href="#services" className="hover:text-white">{t.nav.services}</Link>
              <Link href="/pricing" className="hover:text-white">{t.nav.pricing}</Link>
            </div>
            <div className="flex items-center gap-2">
              {/* language toggle */}
              <div className="flex items-center rounded-full bg-white/15 p-0.5 text-xs font-bold ring-1 ring-white/20">
                {(["th", "en"] as const).map((l) => (
                  <button key={l} onClick={() => choose(l)} aria-pressed={lang === l} className={`rounded-full px-2.5 py-1 transition-colors ${lang === l ? "bg-white text-slate-900" : "text-white/75 hover:text-white"}`}>{l.toUpperCase()}</button>
                ))}
              </div>
              <Link href="/login" className="rounded-full px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm transition-transform hover:scale-[1.02] active:scale-95" style={{ background: GREEN }}>{t.nav.login}</Link>
            </div>
          </nav>

          {/* headline */}
          <div className="relative z-10 mx-auto max-w-3xl pt-12 text-center sm:pt-16">
            <h1 className="le-rise text-4xl font-extrabold leading-[1.1] tracking-tight text-white text-balance sm:text-[3.4rem]">
              {t.hero.h1a}<br className="hidden sm:block" />{" "}
              <span className="text-white/70">{t.hero.h1mid}</span> {t.hero.h1b}
            </h1>
            <p className="le-rise mx-auto mt-5 max-w-xl text-base leading-relaxed text-white/80 sm:text-lg" style={{ animationDelay: "80ms" }}>{t.hero.sub}</p>
            <div className="le-rise mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row" style={{ animationDelay: "140ms" }}>
              <Link href="/pricing" className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-slate-900/90 px-5 py-2.5 text-sm font-semibold text-white ring-1 ring-white/10 transition-transform hover:scale-[1.02] active:scale-95 sm:w-auto">{t.hero.ctaPricing}</Link>
              <Link href="/login" className="inline-flex w-full items-center justify-center gap-2 rounded-full py-2 pl-5 pr-2 text-sm font-semibold text-slate-900 shadow-lg transition-transform hover:scale-[1.02] active:scale-95 sm:w-auto" style={{ background: GREEN }}>
                {t.hero.ctaStart} <ArrowCircle dark />
              </Link>
            </div>
            <p className="le-rise mt-4 text-xs text-white/70" style={{ animationDelay: "180ms" }}>{t.hero.rating}</p>
          </div>

          {/* floating product cards */}
          <div className="relative z-10 mx-auto flex max-w-3xl items-end justify-center gap-0 pb-10" style={{ marginTop: "3rem" }}>
            <div className="le-rise hidden w-40 -rotate-6 translate-y-2 rounded-2xl bg-white p-4 shadow-2xl sm:block" style={{ animationDelay: "200ms" }}>
              <div className="text-3xl font-extrabold tracking-tight text-slate-900">520k+</div>
              <div className="mt-1 text-xs text-slate-500">{t.card.statLabel}</div>
              <div className="mt-3 flex h-10 items-end gap-1">
                {[40, 60, 45, 75, 90].map((h, i) => <div key={i} className="flex-1 rounded-sm" style={{ height: `${h}%`, background: i === 4 ? GREEN : "#dbeafe" }} />)}
              </div>
            </div>
            <div className="le-rise relative z-20 w-[260px] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl sm:w-[280px]" style={{ animationDelay: "160ms" }}>
              <div className="flex items-center gap-2.5 px-4 py-3 text-white" style={{ background: `linear-gradient(90deg, ${GREEN}, #04ad4c)` }}>
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/25 text-xs font-bold">A</div>
                <div className="text-xs font-semibold leading-tight">Aim Expense<div className="text-[10px] font-normal text-white/85">● {t.card.online}</div></div>
              </div>
              <div className="space-y-2.5 bg-slate-50 px-3 py-3.5">
                <div className="ml-auto w-[60%] rounded-xl rounded-tr-sm bg-white p-2.5 shadow-sm">
                  <div className="flex justify-between text-[9px] font-bold tracking-wide text-slate-400">RECEIPT<span>☕</span></div>
                  <div className="mt-1 space-y-1"><div className="h-1 w-full rounded bg-slate-200" /><div className="h-1 w-3/4 rounded bg-slate-200" /></div>
                  <div className="mt-1 flex justify-between border-t border-dashed border-slate-200 pt-1 text-[9px] text-slate-500"><span>TOTAL</span><span className="font-bold text-slate-700">฿120</span></div>
                </div>
                <div className="w-[88%] rounded-xl rounded-tl-sm border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold" style={{ background: `${GREEN}1f`, color: "#03873d" }}>
                    <svg viewBox="0 0 24 24" {...stroke} strokeWidth={3} className="h-3 w-3"><path d="m4 12 5 5L20 6" /></svg> {t.card.receiptRead}
                  </div>
                  <div className="mt-2 space-y-1 text-[11px]">
                    <div className="flex justify-between"><span className="text-slate-500">{t.card.total}</span><span className="font-semibold">฿120.00</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">VAT 7%</span><span className="font-medium text-slate-700">฿7.85</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">{t.card.project}</span><span className="rounded bg-brand-50 px-1.5 font-semibold text-brand-700">Event A</span></div>
                  </div>
                  <div className="mt-2.5 rounded-md py-1.5 text-center text-[10px] font-semibold text-white" style={{ background: GREEN }}>{t.card.saveExpense}</div>
                </div>
              </div>
            </div>
            <div className="le-rise hidden w-44 rotate-6 translate-y-2 rounded-2xl bg-slate-900 p-4 text-white shadow-2xl sm:block" style={{ animationDelay: "240ms" }}>
              <div className="text-xs font-medium text-white/60">{t.card.taxReady}</div>
              <div className="mt-2 space-y-1.5 text-sm font-semibold">
                <div className="flex items-center gap-2"><span style={{ color: GREEN }}>✓</span> ภ.พ.30</div>
                <div className="flex items-center gap-2"><span style={{ color: GREEN }}>✓</span> ภ.ง.ด. 3 / 53</div>
                <div className="flex items-center gap-2"><span style={{ color: GREEN }}>✓</span> หัก ณ ที่จ่าย</div>
              </div>
            </div>
          </div>
        </section>

        {/* ===================== TRUST STRIP ===================== */}
        <section className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 py-8 text-sm font-semibold text-slate-400">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-400">{t.trust.with}</span>
          <span>LINE</span><span className="text-slate-300">•</span>
          <span>Google Sheets</span><span className="text-slate-300">•</span>
          <span>Google Drive</span><span className="text-slate-300">•</span>
          <span>OCR / AI</span>
        </section>

        {/* ===================== ABOUT + STAT CARDS ===================== */}
        <section className="py-10 sm:py-14">
          <Kicker>{t.about.kicker}</Kicker>
          <h2 className="mx-auto max-w-3xl text-center text-2xl font-bold leading-snug tracking-tight text-balance sm:text-4xl">
            {t.about.h2a} <span className="text-slate-400">{t.about.h2sme}</span><br className="hidden sm:block" /> {t.about.h2b} <span style={{ color: GREEN }}>{t.about.h2line}</span> {t.about.h2end}
          </h2>

          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl bg-brand-600 p-5 text-white shadow-sm">
              <div className="text-3xl font-extrabold tracking-tight">100%</div>
              <p className="mt-2 text-sm text-white/85">{t.about.c1}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-sm text-slate-500">{t.about.c2label}</div>
              <p className="mt-2 text-[15px] font-medium text-slate-800">{t.about.c2quote}</p>
              <div className="mt-3 flex -space-x-2">{["#60a5fa", "#34d399", "#fbbf24", "#f472b6"].map((c) => <span key={c} className="h-7 w-7 rounded-full border-2 border-white" style={{ background: c }} />)}</div>
            </div>
            <div className="rounded-2xl p-5 text-slate-900 shadow-sm" style={{ background: GREEN }}>
              <div className="text-3xl font-extrabold tracking-tight">520k+</div>
              <p className="mt-2 text-sm text-slate-900/80">{t.about.c3}</p>
            </div>
            <div className="rounded-2xl bg-slate-900 p-5 text-white shadow-sm">
              <div className="text-sm text-white/60">{t.about.c4label}</div>
              <div className="mt-3 whitespace-pre-line text-2xl font-bold leading-tight">{t.about.c4big}</div>
            </div>
          </div>
        </section>

        {/* ===================== SERVICES ===================== */}
        <section id="services" className="py-10 sm:py-14">
          <Kicker>{t.services.kicker}</Kicker>
          <h2 className="mx-auto max-w-2xl text-center text-2xl font-bold leading-snug tracking-tight text-balance sm:text-4xl">{t.services.h2}</h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-sm text-slate-600 sm:text-base">{t.services.sub}</p>
          <div className="mt-6 flex justify-center">
            <Link href="/login" className="inline-flex items-center gap-2 rounded-full bg-slate-900 py-2 pl-5 pr-2 text-sm font-semibold text-white transition-transform hover:scale-[1.02] active:scale-95">
              {t.services.cta} <ArrowCircle />
            </Link>
          </div>
          <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
            {[<IconChat key="c" />, <IconFlow key="f" />, <IconTax key="t" />].map((icon, i) => (
              <div key={i} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-slate-900" style={{ background: GREEN }}>{icon}</span>
                <h3 className="mt-4 text-lg font-bold">{t.services.items[i].title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{t.services.items[i].desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ===================== FEATURES 2x2 ===================== */}
        <section id="features" className="py-10 sm:py-14">
          <Kicker>{t.features.kicker}</Kicker>
          <h2 className="mx-auto max-w-2xl text-center text-2xl font-bold leading-snug tracking-tight text-balance sm:text-4xl">{t.features.h2}</h2>
          <div className="mt-10 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {[<IconChat key="c" />, <IconShield key="s" />, <IconBudget key="b" />, <IconSwitch key="w" />].map((icon, i) => (
              <div key={i} className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">{icon}</span>
                <div>
                  <h3 className="text-lg font-bold">{t.features.items[i].title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{t.features.items[i].desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ===================== CTA ===================== */}
        <section className="pb-14">
          <div className="relative overflow-hidden rounded-[1.75rem] bg-slate-900 px-6 py-14 text-center shadow-xl sm:rounded-[2.25rem] sm:px-12">
            <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full blur-3xl" style={{ background: `${GREEN}33` }} />
            <div aria-hidden className="pointer-events-none absolute -bottom-20 -left-10 h-64 w-64 rounded-full bg-brand-500/20 blur-3xl" />
            <h2 className="relative text-2xl font-bold text-white sm:text-3xl">{t.cta.h2}</h2>
            <p className="relative mx-auto mt-3 max-w-xl text-sm text-white/70 sm:text-base">{t.cta.sub}</p>
            <Link href="/login" className="relative mt-7 inline-flex items-center gap-2 rounded-full py-2 pl-6 pr-2 text-sm font-semibold text-slate-900 shadow-lg transition-transform hover:scale-[1.02] active:scale-95 sm:text-base" style={{ background: GREEN }}>
              {t.cta.btn} <ArrowCircle dark />
            </Link>
          </div>
        </section>
      </div>

      {/* ===================== FOOTER ===================== */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-5 py-8 sm:flex-row sm:px-6">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700"><span className="text-xs font-bold text-white">A</span></div>
            <span>&copy; {new Date().getFullYear()} Aim Expense</span>
          </div>
          <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-slate-600">
            <Link href="/pricing" className="hover:text-slate-900">{t.footer.pricing}</Link>
            <Link href="/privacy" className="hover:text-slate-900">{t.footer.privacy}</Link>
            <Link href="/terms" className="hover:text-slate-900">{t.footer.terms}</Link>
            <a href="mailto:support@aimexpense.com" className="hover:text-slate-900">support@aimexpense.com</a>
            <Link href="/login" className="font-semibold text-brand-700 hover:text-brand-800">{t.footer.login}</Link>
          </nav>
        </div>
      </footer>
    </main>
  );
}
