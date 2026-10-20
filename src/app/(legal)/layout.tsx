// หน้ากฎหมาย (นโยบายความเป็นส่วนตัว / ข้อกำหนด) — ใช้หัวและฟุตเตอร์เดียวกับเว็บสาธารณะ
// ฟุตเตอร์มีชื่อนิติบุคคล ที่อยู่ อีเมล และ LINE OA ตามเกณฑ์ LINE OA verification
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { LEGAL_VERSION } from "@/lib/legal/version";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <SiteHeader lang="th" path="/privacy" />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
          {children}
          <p className="mt-10 border-t border-slate-100 pt-4 text-xs text-slate-500">เวอร์ชันเอกสาร: {LEGAL_VERSION}</p>
        </article>
      </main>
      <SiteFooter lang="th" />
    </div>
  );
}
