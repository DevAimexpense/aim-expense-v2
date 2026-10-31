// ===========================================
// หน้า /security และ /en/security — 6 คำถามเรื่องข้อมูล ตอบจากสิ่งที่ระบบทำจริง
// (Postgres เก็บเฉพาะ identity · ธุรกิจอยู่ใน Sheet/Drive ของลูกค้า · token เข้ารหัส AES-256-GCM
//  · session 7 วัน · บทบาท admin/accountant/project_manager/staff · retention ตามนโยบายความเป็นส่วนตัว)
// ข้อความทางกฎหมายฉบับเต็มอยู่ที่ /privacy — หน้านี้เป็นภาษาคน
// ===========================================
import Link from "next/link";
import { Database, MessageCircle, Scale, LogOut, KeyRound, Users } from "lucide-react";
import { SiteHeader } from "./site-header";
import { SiteFooter } from "./site-footer";
import { Reveal } from "./reveal";
import { COMPANY } from "@/lib/company";
import { JsonLd, breadcrumbJsonLd } from "@/lib/site-jsonld";
import { pageMeta, type Lang } from "@/lib/site-lang";

type Section = { id: string; icon: typeof Database; title: string; answer: string; paras: string[] };

const SECTIONS: Record<Lang, Section[]> = {
  th: [
    {
      id: "where",
      icon: Database,
      title: "ข้อมูลของบริษัทเราเก็บไว้ที่ไหน",
      answer: "ใน Google Sheet และ Google Drive ของบัญชี Google ที่บริษัทคุณเชื่อมไว้ ไม่ใช่ในฐานข้อมูลของเรา",
      paras: [
        "ตอนเชื่อม Google ครั้งแรก ระบบสร้างสเปรดชีตและโฟลเดอร์ในไดรฟ์ของคุณ รายจ่าย โปรเจกต์ เอกสารรายรับ ใบกำกับภาษี ลูกค้า ผู้รับเงิน และไฟล์ PDF ทุกใบถูกเขียนลงที่นั่น และอ่านกลับมาแสดงทุกครั้งที่ใช้งาน",
        "ฐานข้อมูลของ Aim Expense เก็บเฉพาะข้อมูลระบุตัวตนและการตั้งค่า เช่น บัญชีผู้ใช้ บริษัท สมาชิกและบทบาท การสมัครใช้งาน และบันทึกการกระทำในระบบ ไม่มีตารางรายจ่าย ใบเสร็จ หรือใบกำกับภาษีอยู่บนเซิร์ฟเวอร์ของเรา",
      ],
    },
    {
      id: "access",
      icon: MessageCircle,
      title: "Aim Expense เข้าถึงอะไรได้บ้าง",
      answer: "ไฟล์ที่ระบบสร้างเองในไดรฟ์ของคุณ ข้อมูลโปรไฟล์ LINE และข้อความที่ส่งถึงบอทเท่านั้น",
      paras: [
        "สิทธิ์ Google ที่ขอคือสิทธิ์ทำงานกับไฟล์ที่แอปสร้างขึ้น ระบบเปิดเฉพาะสเปรดชีตและโฟลเดอร์ของ Aim Expense ไม่เห็นไฟล์อื่นในไดรฟ์ของคุณ และการเขียนทุกครั้งทำผ่านสิทธิ์ของเจ้าของบริษัท แม้พนักงานจะเป็นคนส่งรายการ",
        "จาก LINE เราได้รหัสผู้ใช้ ชื่อที่แสดง และรูปโปรไฟล์ เพื่อยืนยันตัวตนและส่งแจ้งเตือน ในแชตเดี่ยวหรือกลุ่มที่ผูกไว้ ระบบอ่านเฉพาะรูปใบเสร็จและข้อความรายจ่ายที่ส่งถึงบอทเพื่อสร้างรายการ ไม่เก็บประวัติแชตอื่น และไม่ส่งข้อความโฆษณาหาพนักงานของคุณ",
      ],
    },
    {
      id: "pdpa",
      icon: Scale,
      title: "ตาม PDPA ใครเป็นผู้ควบคุมข้อมูล ใครเป็นผู้ประมวลผล",
      answer: "บริษัทของคุณเป็นผู้ควบคุมข้อมูลส่วนบุคคล Aim Expense เป็นผู้ประมวลผลที่ทำตามคำสั่งของคุณ",
      paras: [
        "บริษัทคุณเป็นคนตัดสินใจว่าเก็บอะไร ใช้ทำอะไร และไฟล์อยู่ในไดรฟ์ของคุณ ส่วนเราประมวลผลข้อมูลเท่าที่จำเป็นเพื่อให้ระบบทำงานตามที่คุณสั่ง ไม่นำข้อมูลลูกค้า ผู้รับเงิน หรือพนักงานของคุณไปใช้เพื่อวัตถุประสงค์อื่น",
        "ผู้ใช้ทุกคนต้องยอมรับข้อกำหนดการใช้งานและนโยบายความเป็นส่วนตัวก่อนใช้งานครั้งแรก และใช้สิทธิ์ตาม PDPA เช่น ขอดู แก้ไข หรือลบข้อมูล ได้ตามช่องทางในหน้านโยบาย เราตอบกลับภายใน 30 วัน",
      ],
    },
    {
      id: "cancel",
      icon: LogOut,
      title: "เลิกใช้แล้วข้อมูลอยู่ที่ไหน",
      answer: "ยังอยู่ในไดรฟ์ของคุณครบถ้วน เพราะเป็นไฟล์ของคุณตั้งแต่แรก",
      paras: [
        "ยกเลิกแพ็กเกจแล้ว Google Sheet และไฟล์ PDF ทั้งหมดยังเปิดดู ดาวน์โหลด หรือลบเองได้ตามปกติ และถอนสิทธิ์ที่ให้ Aim Expense ได้จากหน้าบัญชี Google ของคุณทุกเมื่อ",
        "ข้อมูลระบุตัวตนในฐานข้อมูลของเรา (บัญชี บริษัท สมาชิก การตั้งค่า) เก็บไว้ 90 วันหลังเลิกใช้เพื่อให้กู้คืนบัญชีได้ จากนั้นลบ หรือแจ้งขอลบก่อนกำหนดได้ที่อีเมลด้านล่าง",
      ],
    },
    {
      id: "encryption",
      icon: KeyRound,
      title: "การเข้ารหัสและการเก็บ token",
      answer: "token สำหรับเข้าถึง Google ถูกเข้ารหัสแบบ AES-256-GCM ก่อนเก็บ ทุกการเชื่อมต่อใช้ HTTPS และไม่มีเลขบัตรในระบบของเรา",
      paras: [
        "กุญแจถอดรหัสแยกเก็บจากฐานข้อมูล token หมดอายุและต่ออายุอัตโนมัติ เซสชันเข้าระบบเป็นคุกกี้ที่สคริปต์ในเบราว์เซอร์อ่านไม่ได้ มีอายุ 7 วัน และหมดเมื่อออกจากระบบ",
        "การชำระเงินอยู่กับ Stripe ทั้งหมด เราไม่เห็นและไม่เก็บเลขบัตรเครดิต เส้นทาง API ที่อ่อนไหว เช่น OCR และอัปโหลด มีการจำกัดจำนวนคำขอต่อ IP",
      ],
    },
    {
      id: "roles",
      icon: Users,
      title: "ในบริษัท ใครเห็นอะไรได้บ้าง",
      answer: "ตามบทบาทและสิทธิ์ที่ผู้ดูแลบริษัทกำหนด พนักงานเห็นเฉพาะส่วนที่เกี่ยวกับตัวเอง",
      paras: [
        "ผู้ดูแลเห็นและตั้งค่าได้ทุกอย่าง ฝ่ายบัญชีเห็นรายจ่าย การจ่ายเงิน เอกสาร และรายงาน ผู้จัดการโปรเจกต์เห็นและอนุมัติเฉพาะโปรเจกต์ที่ดูแล พนักงานเห็นรายการที่ตัวเองส่งและสถานะของมัน",
        "สิทธิ์แต่ละเมนูปรับรายคนได้จากหน้าสิทธิ์การใช้งาน และการกระทำสำคัญ เช่น อนุมัติ จ่าย หรือออกเอกสาร ถูกบันทึกว่าใครทำเมื่อไหร่",
      ],
    },
  ],
  en: [
    {
      id: "where",
      icon: Database,
      title: "Where is our company's data stored?",
      answer: "In the Google Sheet and Google Drive of the Google account your company connected, not in our database.",
      paras: [
        "When you first connect Google, the system creates a spreadsheet and a folder in your Drive. Expenses, projects, revenue documents, tax invoices, customers, payees and every PDF are written there and read back each time you use the app.",
        "Aim Expense's own database holds only identity and settings: user accounts, companies, members and roles, subscriptions and an activity log. There is no expense, receipt or tax-invoice table on our servers.",
      ],
    },
    {
      id: "access",
      icon: MessageCircle,
      title: "What can Aim Expense access?",
      answer: "Only the files it created in your Drive, your LINE profile, and the messages sent to the bot.",
      paras: [
        "The Google permission we request covers files created by the app. The system opens only the Aim Expense spreadsheet and folder, cannot see other files in your Drive, and every write goes through the company owner's permission even when a staff member submits the entry.",
        "From LINE we receive a user ID, display name and profile picture to recognise who is signing in and to send notifications. In a direct chat or a bound group, the system reads only the receipt photos and expense messages sent to the bot to create entries. It keeps no other chat history and never sends advertising to your staff.",
      ],
    },
    {
      id: "pdpa",
      icon: Scale,
      title: "Under PDPA, who is the data controller and who is the processor?",
      answer: "Your company is the data controller. Aim Expense is the data processor acting on your instructions.",
      paras: [
        "Your company decides what is collected and what it is used for, and the files live in your Drive. We process data only as needed to run the system as you direct, and never use your customers', payees' or employees' data for any other purpose.",
        "Every user accepts the terms and privacy policy before first use, and can exercise PDPA rights such as access, correction or deletion through the channels in the policy. We reply within 30 days.",
      ],
    },
    {
      id: "cancel",
      icon: LogOut,
      title: "Where does our data go if we stop using the service?",
      answer: "It stays in your Drive in full, because it was your file from the start.",
      paras: [
        "After cancelling, the Google Sheet and all PDFs can still be opened, downloaded or deleted as usual, and you can revoke Aim Expense's access from your Google account page at any time.",
        "Identity data in our database (accounts, company, members, settings) is kept for 90 days after you stop, so the account can be restored, then deleted. You can request earlier deletion at the email below.",
      ],
    },
    {
      id: "encryption",
      icon: KeyRound,
      title: "Encryption and token storage",
      answer: "Google access tokens are encrypted with AES-256-GCM before storage, every connection uses HTTPS, and no card numbers exist in our system.",
      paras: [
        "The decryption key is kept separately from the database, and tokens expire and refresh automatically. The sign-in session is a cookie that browser scripts cannot read; it lasts 7 days and is cleared when you sign out.",
        "Payments are handled entirely by Stripe. We never see or store credit card numbers. Sensitive API routes such as OCR and uploads are rate-limited per IP.",
      ],
    },
    {
      id: "roles",
      icon: Users,
      title: "Inside the company, who can see what?",
      answer: "It depends on the roles and permissions your company admin sets. Staff see only what concerns them.",
      paras: [
        "Admins see and configure everything. Accountants see expenses, payments, documents and reports. Project managers see and approve only the projects they manage. Staff see the entries they submitted and their status.",
        "Per-menu permissions can be adjusted per person from the permissions page, and key actions such as approving, paying or issuing a document are logged with who did it and when.",
      ],
    },
  ],
};

const TEXT = {
  th: {
    title: "ความปลอดภัยและข้อมูลส่วนบุคคล",
    subPre: "ตอบเป็นภาษาคน 6 ข้อว่าข้อมูลของบริษัทคุณอยู่ที่ไหน ใครเข้าถึงได้ และเกิดอะไรขึ้นเมื่อเลิกใช้ ข้อความทางกฎหมายฉบับเต็มอยู่ที่ ",
    subLink: "นโยบายความเป็นส่วนตัว",
    navLabel: "หัวข้อ",
    contactTitle: "แจ้งเหตุหรือติดต่อผู้ดูแลข้อมูล",
    contactBody: "พบช่องโหว่ สงสัยว่าข้อมูลรั่ว หรือต้องการใช้สิทธิ์ตาม PDPA ติดต่อได้ที่",
    contactReply: "เราตอบกลับภายใน 3 วันทำการ",
    metaTitle: "ความปลอดภัยและข้อมูลส่วนบุคคล — Aim Expense",
    metaDesc: "ข้อมูลอยู่ใน Google Sheet ของคุณเอง ไม่ใช่ของเรา: Aim Expense เข้าถึงอะไรได้ บทบาทตาม PDPA เลิกใช้แล้วข้อมูลอยู่ไหน การเข้ารหัส ใครเห็นอะไรในบริษัท",
  },
  en: {
    title: "Security & personal data",
    subPre: "Six plain-language answers about where your company's data lives, who can reach it, and what happens when you stop. The full legal text (Thai) is in the ",
    subLink: "privacy policy",
    navLabel: "Sections",
    contactTitle: "Report an issue or contact the data officer",
    contactBody: "Found a vulnerability, suspect a leak, or want to exercise your PDPA rights? Contact",
    contactReply: "We reply within 3 business days.",
    metaTitle: "Security & personal data — Aim Expense",
    metaDesc: "Your data lives in your own Google Sheet, not ours: what Aim Expense can access, PDPA roles, what happens when you cancel, encryption, and who sees what.",
  },
} as const;

export function securityMeta(lang: Lang) {
  return pageMeta(lang, "/security", { title: TEXT[lang].metaTitle, description: TEXT[lang].metaDesc });
}

export function SecurityPage({ lang }: { lang: Lang }) {
  const t = TEXT[lang];
  const sections = SECTIONS[lang];
  return (
    <div className="site-motion min-h-screen bg-white text-slate-900">
      <JsonLd data={breadcrumbJsonLd(lang, [{ name: t.title, path: "/security" }])} />
      <SiteHeader lang={lang} path="/security" />
      <main>
        <section className="border-b border-brand-100 bg-brand-50">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
            <h1 className="max-w-3xl text-balance text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">{t.title}</h1>
            <p className="mt-4 max-w-2xl text-pretty text-lg text-slate-700">
              {t.subPre}
              <Link href="/privacy" className="font-medium text-brand-700 hover:underline">{t.subLink}</Link>
            </p>
            <nav aria-label={t.navLabel} className="mt-8 flex flex-wrap gap-2 text-sm">
              {sections.map((s) => (
                <a key={s.id} href={`#${s.id}`} className="rounded-full border border-brand-200 bg-white px-3.5 py-1.5 font-medium text-slate-700 transition hover:border-brand-400 hover:text-brand-700">
                  {s.title}
                </a>
              ))}
            </nav>
          </div>
        </section>

        <div className="mx-auto max-w-4xl space-y-14 px-4 py-16 sm:px-6 lg:py-24">
          {sections.map((s) => {
            const Icon = s.icon;
            return (
              <Reveal as="section" key={s.id} className="scroll-mt-24 grid gap-5 sm:grid-cols-[3.5rem_1fr]">
                <span id={s.id} className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-100 text-brand-700 sm:h-14 sm:w-14">
                  <Icon size={26} aria-hidden />
                </span>
                <div>
                  <h2 className="text-balance text-2xl font-bold tracking-tight">{s.title}</h2>
                  <p className="mt-3 text-pretty text-lg font-medium leading-relaxed text-brand-800">{s.answer}</p>
                  {s.paras.map((p, i) => (
                    <p key={i} className="mt-4 leading-relaxed text-slate-700">{p}</p>
                  ))}
                </div>
              </Reveal>
            );
          })}

          <Reveal as="section" className="rounded-3xl border border-brand-100 bg-brand-50 p-6 sm:p-8">
            <h2 className="text-xl font-bold tracking-tight">{t.contactTitle}</h2>
            <p className="mt-3 leading-relaxed text-slate-700">
              {t.contactBody}{" "}
              <a href={`mailto:${COMPANY.email}`} className="font-semibold text-brand-700 hover:underline">{COMPANY.email}</a>
              {" "}· LINE OA{" "}
              <a href={COMPANY.lineOaUrl} target="_blank" rel="noreferrer" className="font-semibold text-brand-700 hover:underline">{COMPANY.lineOaId}</a>
              {" "}· {t.contactReply}
            </p>
          </Reveal>
        </div>
      </main>
      <SiteFooter lang={lang} />
    </div>
  );
}
